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
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const catalog = read('data.json').catalog, profiles = read('shows.json'), tmdb = read('tmdb.json').shows;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});

const ascii = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
const norm = s => ascii(s).toLowerCase().replace(/\(\d{4}\)|\((us|uk)\)/g, '').replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const lastName = n => String(n).trim().split(/\s+/).pop().toLowerCase();
const slugBase = s => ascii(s).toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/['’.]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {headers: {'user-agent': UA, accept: 'text/html'}, redirect: 'follow'});
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { await sleep(3000 * (i + 1)); continue; }
      return r.ok ? {url: r.url, html: await r.text()} : null;
    } catch { await sleep(2000); }
  }
  return null;
}
function ldSeries(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (d['@type'] === 'TVSeries') return d; } catch {}
  }
  return null;
}
function verify(info, title, t) {
  const names = new Set([norm(title), norm(t.name)]);
  if (!names.has(norm(info.name))) return false;
  const yearOk = t.year && info.year && Math.abs(+info.year - +t.year) <= 1;
  const cast = (t.cast || []).map(lastName);
  const castOk = (info.actors || []).some(a => cast.includes(lastName(a)));
  return yearOk || castOk;
}

// ── Metacritic ──
async function mcPage(slug) {
  const p = await get(`https://www.metacritic.com/tv/${slug}/`);
  const d = p && ldSeries(p.html);
  if (!d) return null;
  const ag = d.aggregateRating || {};
  return {name: d.name, year: String(d.datePublished || '').slice(0, 4), actors: (d.actor || []).map(a => a.name),
    score: ag.ratingValue ?? null, reviews: ag.reviewCount ?? null, url: d.url || p.url};
}
async function metacritic(title, t) {
  const bases = [...new Set([slugBase(title), slugBase(t.name)])].map(b => b.replace(/ /g, '-'));
  const tried = new Set();
  const tryslug = async s => { if (tried.has(s)) return null; tried.add(s); await sleep(1100); const i = await mcPage(s); return i && verify(i, title, t) ? i : null; };
  for (const b of bases) for (const s of [b, `${b}-${t.year}`]) { const i = await tryslug(s); if (i) return i; }
  await sleep(1100);
  const sr = await get(`https://www.metacritic.com/search/${encodeURIComponent(title.replace(/\s*\(.*?\)/g, ''))}/?category=1`);
  const slugs = sr ? [...new Set([...sr.html.matchAll(/href="\/tv\/([a-z0-9-]+)\/"/g)].map(m => m[1]))] : [];
  for (const s of slugs.filter(s => bases.some(b => s.startsWith(b.slice(0, 6)))).slice(0, 4)) { const i = await tryslug(s); if (i) return i; }
  return null;
}

// ── Rotten Tomatoes ──
async function rtPage(slug) {
  const p = await get(`https://www.rottentomatoes.com/tv/${slug}`);
  const d = p && ldSeries(p.html);
  if (!d) return null;
  const pct = (key) => { const m = p.html.match(new RegExp(`"${key}":\\{[^}]*?"scorePercent":"(\\d+)%"`)); return m ? +m[1] : null; };
  const reviews = (p.html.match(/"criticsScore":\{[^}]*?"reviewCount":(\d+)/) || [])[1];
  return {name: d.name, year: String(d.dateCreated || d.startDate || '').slice(0, 4), actors: (d.actor || []).map(a => a.name),
    critics: pct('criticsScore'), audience: pct('audienceScore'), reviews: reviews ? +reviews : null, url: p.url.split('?')[0]};
}
async function rotten(title, t) {
  const bases = [...new Set([slugBase(title), slugBase(t.name)])].map(b => b.replace(/ /g, '_'));
  const tried = new Set();
  const tryslug = async s => { if (tried.has(s)) return null; tried.add(s); await sleep(1100); const i = await rtPage(s); return i && verify(i, title, t) ? i : null; };
  for (const b of bases) for (const s of [b, `${b}_${t.year}`]) { const i = await tryslug(s); if (i) return i; }
  await sleep(1100);
  const sr = await get(`https://www.rottentomatoes.com/search?search=${encodeURIComponent(title.replace(/\s*\(.*?\)/g, ''))}`);
  const slugs = sr ? [...new Set([...sr.html.matchAll(/href="https:\/\/www\.rottentomatoes\.com\/tv\/([a-z0-9_]+)"/g)].map(m => m[1]))] : [];
  for (const s of slugs.filter(s => bases.some(b => s.startsWith(b.slice(0, 6)))).slice(0, 4)) { const i = await tryslug(s); if (i) return i; }
  return null;
}

// ── IMDb dataset ──
console.error('Downloading IMDb ratings…');
const gz = Buffer.from(await (await fetch('https://datasets.imdbws.com/title.ratings.tsv.gz')).arrayBuffer());
const imdb = new Map(zlib.gunzipSync(gz).toString('utf8').split('\n').slice(1).map(l => l.split('\t')).map(([id, r, v]) => [id, {rating: +r, votes: +v}]));

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
