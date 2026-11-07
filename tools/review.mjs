#!/usr/bin/env node
// Records the content review of a discovered show.
//
//   node tools/review.mjs list                       pending finds, with what to check
//   node tools/review.mjs ok <tmdbId> "<notes>"      approve: show it in the app
//   node tools/review.mjs reject <tmdbId> "<reason>" reject: remove it and never suggest it again
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
  console.error('Usage: review.mjs list | ok <tmdbId> "<notes>" | reject <tmdbId> "<reason>"');
  process.exit(1);
}
