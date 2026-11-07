#!/usr/bin/env node
// Builds scores.json: IMDb rating, Rotten Tomatoes (Tomatometer + Popcornmeter)
// and Metascore for every catalog show that has no hand-researched profile
// in shows.json (those profiles already carry their own scores).
//
//   node tools/scores-import.mjs            (needs tmdb.json from tmdb-import.mjs)
//
// IMDb:   official ratings dataset (datasets.imdbws.com), matched by the IMDb id
//         TMDB gives for the show, so no name guessing is involved.
// RT / Metacritic: the show's page, accepted only when the series name matches
//         AND either its first-air year (±1) or its cast matches TMDB's record.
//         Anything else is recorded as not found rather than guessed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const catalog = read('data.json').catalog, profiles = read('shows.json'), tmdb = read('tmdb.json').shows;
import {metacritic, rotten, loadImdb} from './lib/scores.mjs';
const today = new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});

// ── IMDb dataset ──
console.error('Downloading IMDb ratings…');
const imdb = await loadImdb();

const titles = [...new Set(catalog.map(x => x.title))].filter(t => !profiles[t] && tmdb[t]).slice(0, +process.env.LIMIT || Infinity);
const out = {};
for (const t of titles) {
  const tm = tmdb[t], i = tm.imdb && imdb.get(tm.imdb);
  out[t] = {imdb: i ? {id: tm.imdb, rating: i.rating, votes: i.votes} : (tm.imdb ? {id: tm.imdb, rating: null} : null)};
}
let done = 0;
const progress = () => { if (++done % 50 === 0) console.error(`${done}/${titles.length * 2} site lookups`); };
await Promise.all([
  (async () => { for (const t of titles) {
    const m = await metacritic(t, tmdb[t]).catch(() => null);
    out[t].metascore = m ? (m.score != null ? {score: m.score, reviews: m.reviews, url: m.url} : {score: null, status: 'No Metascore yet (too few critic reviews)', url: m.url}) : {score: null, status: 'Not listed on Metacritic'};
    progress();
  } })(),
  (async () => { for (const t of titles) {
    const r = await rotten(t, tmdb[t]).catch(() => null);
    out[t].rt = r ? {critics: r.critics, audience: r.audience, reviews: r.reviews, url: r.url} : null;
    progress();
  } })()
]);
fs.writeFileSync(path.join(ROOT, 'scores.json'), JSON.stringify({
  source: 'IMDb ratings from the IMDb datasets (personal, non-commercial use); Rotten Tomatoes and Metacritic scores read from each show\'s page.',
  checked: today, shows: out
}, null, 1) + '\n');
const v = Object.values(out), c = f => v.filter(f).length;
console.log(`Shows: ${v.length} | IMDb rating ${c(x => x.imdb && x.imdb.rating != null)} | Tomatometer ${c(x => x.rt && x.rt.critics != null)} | Popcornmeter ${c(x => x.rt && x.rt.audience != null)} | RT page ${c(x => x.rt)} | Metascore ${c(x => x.metascore.score != null)} | on Metacritic ${c(x => x.metascore.url)}`);
