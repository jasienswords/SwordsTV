#!/usr/bin/env node
// Finds new shows (not yet in the catalog) that fit the family's Taste Profile
// and records them in discoveries.json for review.
//
//   TMDB_TOKEN=<token> node tools/discover.mjs
//
// Uses the same taste engine as the app (taste.js), so "fits your taste" means
// exactly what For You means. New finds are saved with guidance "pending";
// the nightly review approves or rejects each one (tools/review.mjs), and only
// approved shows appear in the app.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {api, details} from './lib/tmdb.mjs';
import {loadImdb, siteScores, imdbEntry} from './lib/scores.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = f => path.join(ROOT, f);
const read = (f, fallback) => fs.existsSync(file(f)) ? JSON.parse(fs.readFileSync(file(f), 'utf8')) : fallback;
if (!process.env.TMDB_TOKEN) { console.error('Set TMDB_TOKEN.'); process.exit(1); }

const MAX_NEW_PER_NIGHT = 10;      // new finds added per run
const MAX_PENDING_OR_SHOWN = 60;   // unrated discoveries kept in the app at once
const MIN_IMDB = 7.0, MIN_IMDB_VOTES = 500;
const SKIP_GENRES = new Set(['Kids', 'News', 'Talk', 'Soap']);
const today = new Date().toISOString().slice(0, 10);

const data = read('data.json'), research = read('shows.json', {}), tmdbFile = read('tmdb.json');
const scoresFile = read('scores.json', {shows: {}});
const disc = read('discoveries.json', {updated: null, shows: {}, rejected: {}});
const ratings = read('ratings.json', {changes: {}}).changes || {};

// ── Same show model as the app ──
const TMDB = {...tmdbFile.shows}, SCORES = {...scoresFile.shows};
for (const [t, d] of Object.entries(disc.shows)) { TMDB[t] = d.tmdb; SCORES[t] = d.scores; }
const catalog = [...data.catalog, ...Object.keys(disc.shows).filter(t => disc.shows[t].guidance?.status === 'ok').map(title => ({title, rating: '', status: 'Unwatched'}))];
const listed = s => ['Up Next', 'Watching', 'Want to Watch'].includes(s);
const shows = catalog.map(x => {
  const c = ratings[x.title] || {};
  const libraryStatus = c.libraryStatus ?? (listed(c.status) ? c.status : listed(x.status) ? x.status : 'Not in My Library');
  return {...x, ...c, libraryStatus, watched: c.watched ?? (c.status === 'Watched' || x.status === 'Watched')};
});
const ctx = {TMDB, RESEARCH: research, SCORES, console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file('taste.js'), 'utf8') + '\n;this.engine={buildProfile,rankedCandidates,matchShow,whyText,contentFlags};', ctx);
const {buildProfile, rankedCandidates, matchShow, whyText, contentFlags} = ctx.engine;
const profile = buildProfile(shows);
const ranked = rankedCandidates(shows, profile);
const bar = ranked.length ? ranked[Math.min(24, ranked.length - 1)].m.score : 0;
console.log(`Profile from ${profile.total} ratings; a new find must score at least ${bar.toFixed(2)} (your 25th-best current match).`);

// ── Candidate pool ──
const knownIds = new Set([...Object.values(TMDB).filter(Boolean).map(t => t.id), ...Object.keys(disc.rejected).map(Number)]);
const pool = new Map(); // id -> source
const add = (id, src) => { if (!knownIds.has(id) && !pool.has(id)) pool.set(id, src); };
for (const t of [...profile.lovedTitles, ...profile.likedTitles]) (TMDB[t]?.similar || []).forEach(id => add(id, 'similar to ' + t));
const genreIds = Object.fromEntries(((await api('/genre/tv/list')).genres || []).map(g => [g.name, g.id]));
const topGenres = Object.values(profile.traits).filter(x => x.type === 'genre' && x.n >= 3 && x.affinity > 0.05).sort((a, b) => b.affinity - a.affinity).slice(0, 3);
for (const g of topGenres) for (const page of [1, 2]) {
  const r = await api('/discover/tv', {with_genres: genreIds[g.label], with_original_language: 'en', 'vote_count.gte': 100, sort_by: 'popularity.desc', page});
  (r.results || []).forEach(x => add(x.id, 'popular in ' + g.label));
}
((await api('/trending/tv/week')).results || []).forEach(x => add(x.id, 'trending this week'));
console.log(`Checking ${pool.size} candidate shows from TMDB…`);

// ── Score candidates ──
const imdb = await loadImdb();
const catalogTitles = new Set(Object.keys(TMDB));
const found = [];
for (const [id, source] of pool) {
  let rec;
  try { rec = await details({id, match: 'discovered'}); } catch { continue; }
  if (rec.language !== 'en' || rec.genres.some(g => SKIP_GENRES.has(g)) || !rec.poster) continue;
  const title = catalogTitles.has(rec.name) ? `${rec.name} (${rec.year})` : rec.name;
  const im = imdbEntry(imdb, rec.imdb);
  if (!im || im.rating == null || im.rating < MIN_IMDB || im.votes < MIN_IMDB_VOTES) continue;
  TMDB[title] = rec; SCORES[title] = {imdb: im};
  if (contentFlags(title).length) { delete TMDB[title]; continue; }
  const m = matchShow(title, profile);
  delete TMDB[title];
  if (m.score >= bar) found.push({title, rec, im, m, source});
}
found.sort((a, b) => b.m.score - a.m.score);

// ── Keep the best few; refresh existing finds ──
const live = Object.entries(disc.shows).filter(([t, d]) => d.guidance?.status !== 'rejected' && !(ratings[t] && (ratings[t].rating || ratings[t].libraryStatus)));
const room = Math.max(0, MAX_PENDING_OR_SHOWN - live.length);
const added = [];
for (const f of found.slice(0, Math.min(MAX_NEW_PER_NIGHT, room))) {
  const site = await siteScores(f.title, f.rec);
  TMDB[f.title] = f.rec; SCORES[f.title] = {imdb: f.im, ...site};
  disc.shows[f.title] = {tmdb: f.rec, scores: {imdb: f.im, ...site}, addedOn: today, source: f.source,
    matchScore: +f.m.score.toFixed(2), why: whyText(matchShow(f.title, profile)), guidance: {status: 'pending'}};
  added.push(f.title);
}
for (const [t, d] of Object.entries(disc.shows)) {
  if (added.includes(t)) continue;
  try { const rec = await details({id: d.tmdb.id, match: 'discovered'}); d.tmdb = rec; const im = imdbEntry(imdb, rec.imdb); if (im) d.scores.imdb = im; } catch {}
}
disc.updated = today;
fs.writeFileSync(file('discoveries.json'), JSON.stringify(disc, null, 1) + '\n');
console.log(`Found ${found.length} shows that fit; added ${added.length} for review${room < MAX_NEW_PER_NIGHT ? ` (room for ${room})` : ''}.`);
for (const t of added) console.log(`  PENDING  ${disc.shows[t].tmdb.id}  ${t} (${disc.shows[t].tmdb.year}) — IMDb ${disc.shows[t].scores.imdb.rating} — ${disc.shows[t].why}`);
