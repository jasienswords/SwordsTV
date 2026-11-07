#!/usr/bin/env node
// The nightly SwordsTV update. Run from the repository root:
//
//   TMDB_TOKEN=<token> node tools/nightly.mjs
//
//   1. Saves the family's latest ratings from Firebase to ratings.json (also a nightly backup).
//   2. Refreshes TMDB data for every show: streaming availability, new episodes, status.
//   3. Refreshes IMDb ratings in scores.json from IMDb's daily dataset.
//   4. Searches for new shows that fit the Taste Profile (discoveries.json, "pending" review).
// Afterwards, review pending finds with tools/review.mjs and publish.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadImdb, imdbEntry, siteScores} from './lib/scores.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = f => path.join(ROOT, f);
const step = (n, msg) => console.log(`\n[${n}/4] ${msg}`);
const run = script => execFileSync(process.execPath, [file(script)], {stdio: 'inherit', env: process.env});

// Firestore REST values → plain JSON.
function decode(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return null;
}

step(1, 'Fetching family ratings from Firebase…');
const cfg = JSON.parse(fs.readFileSync(file('firebase-config.json'), 'utf8'));
const r = await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${cfg.familyDoc}`);
if (r.ok) {
  const doc = decode({mapValue: {fields: (await r.json()).fields || {}}});
  const changes = doc.changes || {};
  fs.writeFileSync(file('ratings.json'), JSON.stringify({savedAt: new Date().toISOString(), changes, added: doc.added || {}, subscriptions: doc.subscriptions || {}}, null, 1) + '\n');
  console.log(`Saved ${Object.keys(changes).length} family rating entries and ${Object.keys(doc.added || {}).length} family-added shows.`);
} else if (r.status === 404) {
  console.log('No family ratings yet (nobody has signed in). Using the catalog ratings only.');
} else {
  console.log(`Could not read family ratings (HTTP ${r.status}); keeping the last saved copy.`);
}

step(2, 'Refreshing TMDB data for every show…');
run('tools/tmdb-import.mjs');

step(3, 'Refreshing IMDb ratings…');
const imdb = await loadImdb();
const scores = JSON.parse(fs.readFileSync(file('scores.json'), 'utf8'));
const tmdb = JSON.parse(fs.readFileSync(file('tmdb.json'), 'utf8')).shows;
let updated = 0;
for (const [t, s] of Object.entries(scores.shows)) {
  const e = imdbEntry(imdb, tmdb[t]?.imdb);
  if (e && e.rating != null && (!s.imdb || s.imdb.rating !== e.rating || s.imdb.votes !== e.votes)) { s.imdb = e; updated++; }
}
// Shows with no scores yet (e.g. ones the family added): look up all three.
const research = JSON.parse(fs.readFileSync(file('shows.json'), 'utf8'));
let filled = 0;
for (const [t, rec] of Object.entries(tmdb)) {
  if (!rec || research[t] || scores.shows[t]) continue;
  scores.shows[t] = {imdb: imdbEntry(imdb, rec.imdb), ...(await siteScores(t, rec))};
  filled++;
}
fs.writeFileSync(file('scores.json'), JSON.stringify(scores, null, 1) + '\n');
console.log(`Updated ${updated} IMDb ratings; added scores for ${filled} new shows.`);

step(4, 'Searching for new shows that fit the Taste Profile…');
run('tools/discover.mjs');
console.log('\nNext: node tools/review.mjs list');
