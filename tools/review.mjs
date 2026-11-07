#!/usr/bin/env node
// Records the content review of a discovered show.
//
//   node tools/review.mjs list                       pending finds, with what to check
//   node tools/review.mjs ok <tmdbId> "<notes>"      approve: show it in the app
//   node tools/review.mjs reject <tmdbId> "<reason>" reject: remove it and never suggest it again
//   node tools/review.mjs added                       family-added shows still needing content notes
//   node tools/review.mjs note "<title>" "<notes>"     content notes for a family-added show (never rejected)
//   node tools/review.mjs backlog [N]                 the N best-matching catalog shows not yet content-reviewed
//   node tools/review.mjs clear "<title>" "<notes>"     reviewed: OK to recommend (notes shown on the show page)
//   node tools/review.mjs block "<title>" "<reason>"    reviewed: never recommend (still searchable)
// For You only recommends shows that have been content-reviewed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'discoveries.json');
const disc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const [cmd, id, ...rest] = process.argv.slice(2);
const note = rest.join(' ').trim();
const find = () => Object.entries(disc.shows).find(([, d]) => String(d.tmdb.id) === String(id));
const save = () => fs.writeFileSync(FILE, JSON.stringify(disc, null, 1) + '\n');

if (cmd === 'list') {
  const pending = Object.entries(disc.shows).filter(([, d]) => d.guidance?.status === 'pending');
  if (!pending.length) console.log('No finds waiting for review.');
  for (const [t, d] of pending) {
    const x = d.tmdb;
    console.log(`\n${x.id}  ${t} (${x.year}${x.endYear && x.endYear !== x.year ? '–' + x.endYear : ''}) · ${x.genres.join(', ')} · ${x.networks.map(n => n.name).join(', ')} · US rating ${x.rating || 'n/a'}`);
    console.log(`  IMDb ${d.scores.imdb?.rating ?? 'n/a'} · RT ${d.scores.rt?.critics ?? 'n/a'}% · Metascore ${d.scores.metascore?.score ?? 'n/a'} · ${d.why}`);
    console.log(`  Overview: ${x.overview}`);
    console.log(`  Keywords: ${x.keywords.join(', ') || 'none'}`);
  }
} else if (cmd === 'added' || (cmd === 'note' && id && note)) {
  const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const GF = path.join(ROOT, 'guidance.json');
  const guidance = fs.existsSync(GF) ? JSON.parse(fs.readFileSync(GF, 'utf8')) : {shows: {}};
  const ratings = fs.existsSync(path.join(ROOT, 'ratings.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'ratings.json'), 'utf8')) : {};
  const tmdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmdb.json'), 'utf8')).shows;
  if (cmd === 'added') {
    const todo = Object.keys(ratings.added || {}).filter(t => !guidance.shows[t]);
    if (!todo.length) console.log('No family-added shows need content notes.');
    for (const t of todo) {
      const x = tmdb[t];
      if (!x) { console.log(`\n${t}: not found on TMDB yet (added by name); skip until it is.`); continue; }
      console.log(`\n${t} (${x.year}) · ${x.genres.join(', ')} · ${x.networks.map(n => n.name).join(', ')} · US rating ${x.rating || 'n/a'}`);
      console.log(`  Overview: ${x.overview}`);
      console.log(`  Keywords: ${x.keywords.join(', ') || 'none'}`);
    }
  } else {
    guidance.shows[id] = {notes: note, reviewed: new Date().toISOString().slice(0, 10)};
    fs.writeFileSync(GF, JSON.stringify(guidance, null, 1) + '\n');
    console.log(`Noted: ${id}`);
  }
} else if (cmd === 'backlog' || ((cmd === 'clear' || cmd === 'block') && id && note)) {
  const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rd = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const GF = path.join(ROOT, 'guidance.json');
  const guidance = fs.existsSync(GF) ? rd('guidance.json') : {shows: {}};
  if (cmd === 'backlog') {
    const vm = await import('node:vm');
    const research = rd('shows.json'), tmdb = rd('tmdb.json').shows, scores = rd('scores.json').shows;
    const ratings = fs.existsSync(path.join(ROOT, 'ratings.json')) ? rd('ratings.json').changes || {} : {};
    const listed = x => ['Up Next', 'Watching', 'Want to Watch'].includes(x);
    const shows = rd('data.json').catalog.map(x => { const c = ratings[x.title] || {}; return {...x, ...c,
      libraryStatus: c.libraryStatus ?? (listed(c.status) ? c.status : listed(x.status) ? x.status : 'Not in My Library'),
      watched: c.watched ?? (c.status === 'Watched' || x.status === 'Watched')}; });
    const ctx = {TMDB: tmdb, RESEARCH: research, SCORES: scores, console};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'taste.js'), 'utf8') + '\n;this.e={buildProfile,rankedCandidates};', ctx);
    const reviewed = t => research[t] || guidance.shows[t];
    const todo = ctx.e.rankedCandidates(shows, ctx.e.buildProfile(shows)).filter(x => !reviewed(x.s.title)).slice(0, +id || 25);
    if (!todo.length) console.log('Every recommendable show has been reviewed.');
    for (const {s: show} of todo) {
      const x = tmdb[show.title];
      console.log(`\n${show.title} (${x.year}${x.endYear && x.endYear !== x.year ? '–' + x.endYear : ''}) · ${x.genres.join(', ')} · ${x.networks.map(n => n.name).join(', ')} · US rating ${x.rating || 'n/a'}`);
      console.log(`  Overview: ${x.overview}`);
      console.log(`  Keywords: ${x.keywords.join(', ') || 'none'}`);
    }
  } else {
    guidance.shows[id] = {status: cmd === 'clear' ? 'ok' : 'blocked', notes: note, reviewed: new Date().toISOString().slice(0, 10)};
    fs.writeFileSync(GF, JSON.stringify(guidance, null, 1) + '\n');
    console.log(`${cmd === 'clear' ? 'Cleared' : 'Blocked'}: ${id}`);
  }
} else if ((cmd === 'ok' || cmd === 'reject') && id && note) {
  const hit = find();
  if (!hit) { console.error(`No discovered show with TMDB id ${id}.`); process.exit(1); }
  const [title, d] = hit;
  if (cmd === 'ok') {
    d.guidance = {status: 'ok', notes: note, reviewed: new Date().toISOString().slice(0, 10)};
    console.log(`Approved: ${title}`);
  } else {
    disc.rejected[d.tmdb.id] = {title, reason: note, on: new Date().toISOString().slice(0, 10)};
    delete disc.shows[title];
    console.log(`Rejected: ${title}`);
  }
  save();
} else {
  console.error('Usage: review.mjs list | ok <tmdbId> "<notes>" | reject <tmdbId> "<reason>" | added | note "<title>" "<notes>" | backlog [N] | clear "<title>" "<notes>" | block "<title>" "<reason>"');
  process.exit(1);
}
