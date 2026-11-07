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
import {loadProfiles, showsFor} from './lib/profiles.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = f => path.join(ROOT, f);
const read = (f, fallback) => fs.existsSync(file(f)) ? JSON.parse(fs.readFileSync(file(f), 'utf8')) : fallback;
if (!process.env.TMDB_TOKEN) { console.error('Set TMDB_TOKEN.'); process.exit(1); }

const MAX_NEW_PER_NIGHT = 10;      // new finds added per run
const MAX_PENDING_OR_SHOWN = 60;   // unrated discoveries kept in the app at once
const MIN_IMDB = 7.0, MIN_IMDB_VOTES = 500;
const MIN_IMDB_SAME_CREATOR = 6.5; // a new show from the creator of a show you loved gets more leeway
const SKIP_GENRES = new Set(['Kids', 'News', 'Talk', 'Soap']);
const today = new Date().toISOString().slice(0, 10);

const data = read('data.json'), research = read('shows.json', {}), tmdbFile = read('tmdb.json');
const scoresFile = read('scores.json', {shows: {}});
const disc = read('discoveries.json', {updated: null, shows: {}, rejected: {}});
const people = loadProfiles(ROOT);

// ── Same show model as the app ──
const TMDB = {...tmdbFile.shows}, SCORES = {...scoresFile.shows};
for (const [t, d] of Object.entries(disc.shows)) { TMDB[t] = d.tmdb; SCORES[t] = d.scores; }
const catalog = [...data.catalog, ...Object.keys(disc.shows).filter(t => disc.shows[t].guidance?.status === 'ok').map(title => ({title, rating: '', status: 'Unwatched'}))];
const ctx = {TMDB, RESEARCH: research, SCORES, console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file('taste.js'), 'utf8') + '\n;this.engine={buildProfile,rankedCandidates,matchShow,whyText,contentFlags,diversify,MAX_GENRE_SHARE};', ctx);
const {buildProfile, rankedCandidates, matchShow, whyText, contentFlags, diversify, MAX_GENRE_SHARE} = ctx.engine;
// One taste profile per person. A find is kept when it fits at least one of them as well as
// that person's 25th-best current match; its reason comes from the person it fits best.
const engines = people.map(p => {
  const shows = showsFor(catalog, p), profile = buildProfile(shows), ranked = rankedCandidates(shows, profile);
  return {p, shows, profile, bar: ranked.length ? ranked[Math.min(24, ranked.length - 1)].m.score : 0};
}).filter(e => e.profile.total >= 10);
for (const e of engines) console.log(`Profile ${e.p.household}/${e.p.profile}: ${e.profile.total} ratings; new finds must score at least ${e.bar.toFixed(2)}.`);
if (!engines.length) { console.log('No profile has 10 ratings yet; nothing to search for.'); process.exit(0); }
const bestFit = title => {
  let best = null;
  for (const e of engines) { const m = matchShow(title, e.profile); if (!best || m.score - e.bar > best.margin) best = {e, m, margin: m.score - e.bar}; }
  return best;
};
const rated = t => people.some(p => { const c = (p.changes || {})[t]; return c && (c.rating || c.libraryStatus); });

// ── Candidate pool ──
const knownIds = new Set([...Object.values(TMDB).filter(Boolean).map(t => t.id), ...Object.keys(disc.rejected).map(Number)]);
const pool = new Map(); // id -> source
const add = (id, src) => { if (!knownIds.has(id) && !pool.has(id)) pool.set(id, src); };
const lovedOrLiked = [...new Set(engines.flatMap(e => [...e.profile.lovedTitles, ...e.profile.likedTitles]))];
for (const t of lovedOrLiked) (TMDB[t]?.similar || []).forEach(id => add(id, 'similar to ' + t));
const genreIds = Object.fromEntries(((await api('/genre/tv/list')).genres || []).map(g => [g.name, g.id]));
const topGenres = [...new Map(engines.flatMap(e => Object.values(e.profile.traits).filter(x => x.type === 'genre' && x.n >= 3 && x.affinity > 0.05).sort((a, b) => b.affinity - a.affinity).slice(0, 3)).map(g => [g.label, g])).values()];
for (const g of topGenres) for (const page of [1, 2]) {
  const r = await api('/discover/tv', {with_genres: genreIds[g.label], with_original_language: 'en', 'vote_count.gte': 100, sort_by: 'popularity.desc', page});
  (r.results || []).forEach(x => add(x.id, 'popular in ' + g.label));
}
((await api('/trending/tv/week')).results || []).forEach(x => add(x.id, 'trending this week'));
// Other shows created by the people behind the shows you loved or liked.
const creators = new Map();
for (const t of lovedOrLiked) for (const c of TMDB[t]?.creators || []) if (!creators.has(c.id)) creators.set(c.id, t);
for (const [pid, t] of creators) {
  try { ((await api(`/person/${pid}/tv_credits`)).crew || []).filter(x => x.job === 'Creator').forEach(x => add(x.id, 'same creator as ' + t)); } catch {}
}
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
  if (!im || im.rating == null || im.votes < MIN_IMDB_VOTES) continue;
  TMDB[title] = rec; SCORES[title] = {imdb: im};
  const sameCreator = engines.some(e => matchShow(title, e.profile).because.some(b => b.creator && b.rating === 'Loved'));
  if (im.rating < (sameCreator ? MIN_IMDB_SAME_CREATOR : MIN_IMDB)) { delete TMDB[title]; continue; }
  if (contentFlags(title).length) { delete TMDB[title]; continue; }
  const best = bestFit(title);
  delete TMDB[title];
  if (best.margin >= 0) found.push({title, rec, im, m: best.m, e: best.e, margin: best.margin, source});
}
found.sort((a, b) => b.margin - a.margin);

// ── Keep the best few; refresh existing finds ──
const live = Object.entries(disc.shows).filter(([t, d]) => d.guidance?.status !== 'rejected' && !rated(t));
const room = Math.max(0, MAX_PENDING_OR_SHOWN - live.length);
const added = [];
// Keep the finds varied: tonight's picks are mixed by genre, and no genre may hold more
// than its share of all the finds on show.
const primary = r => (r.genres || ['?'])[0];
const liveByGenre = {};
for (const [, d] of live) liveByGenre[primary(d.tmdb)] = (liveByGenre[primary(d.tmdb)] || 0) + 1;
const genreRoom = g => (liveByGenre[g] || 0) < Math.ceil(MAX_PENDING_OR_SHOWN * MAX_GENRE_SHARE);
// Priority lane: recent shows from the creator of a show you loved (e.g. The Paper, from the
// creator of The Office) go first, outside the genre limits; up to 3 a night.
const recentYear = new Date().getFullYear() - 2;
const priority = found.filter(f => +f.rec.year >= recentYear && f.m.because.some(b => b.creator && b.rating === 'Loved')).slice(0, 3);
const picks = [...priority, ...diversify(found.filter(f => !priority.includes(f) && genreRoom(primary(f.rec))), f => primary(f.rec))];
const tonight = {};
for (const f of picks) {
  if (added.length >= Math.min(MAX_NEW_PER_NIGHT, room)) break;
  const g = primary(f.rec);
  if (!priority.includes(f) && (tonight[g] || 0) >= Math.ceil(MAX_NEW_PER_NIGHT * MAX_GENRE_SHARE)) continue;
  tonight[g] = (tonight[g] || 0) + 1;
  const site = await siteScores(f.title, f.rec);
  TMDB[f.title] = f.rec; SCORES[f.title] = {imdb: f.im, ...site};
  disc.shows[f.title] = {tmdb: f.rec, scores: {imdb: f.im, ...site}, addedOn: today, source: f.source,
    matchScore: +f.m.score.toFixed(2), why: whyText(matchShow(f.title, f.e.profile)), guidance: {status: 'pending'}};
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
