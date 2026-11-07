#!/usr/bin/env node
// Builds tmdb.json: posters, images, details, cast, series status and U.S.
// streaming providers for every show in data.json, from The Movie Database.
//
//   TMDB_TOKEN=<your TMDB "API Read Access Token"> node tools/tmdb-import.mjs
//
// Matching: titles are matched by exact name. Hints in brackets are used
// ("(UK)", "(2018)", "(modern)", ...). When several shows share a name, the
// one whose cast overlaps the hand-researched profile in shows.json wins;
// otherwise the most-voted one is used and the match is marked "ambiguous".
// Fix any wrong match in tools/tmdb-overrides.json: { "Title": 12345 } or
// { "Title": null } for "no TMDB entry", then run this again.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.TMDB_TOKEN;
if (!TOKEN) { console.error('Set TMDB_TOKEN to your TMDB API Read Access Token.'); process.exit(1); }
const API = 'https://api.themoviedb.org/3';
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const catalog = read('data.json').catalog;
const profiles = read('shows.json');
const overridesFile = path.join(ROOT, 'tools/tmdb-overrides.json');
const overrides = Object.fromEntries(Object.entries(fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {}).filter(([k]) => !k.startsWith('_')));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p, params = {}) {
  const url = new URL(API + p);
  for (const [k, v] of Object.entries({language: 'en-US', ...params})) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, {headers: {Authorization: 'Bearer ' + TOKEN, accept: 'application/json'}});
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url.pathname}`);
    return r.json();
  }
  throw new Error('Gave up on ' + url.pathname);
}

const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const lastName = n => String(n).trim().split(/\s+/).pop().toLowerCase();

function hints(title) {
  const h = {query: title.replace(/\s*\(.*?\)\s*/g, ' ').trim()};
  const b = (title.match(/\((.*?)\)/) || [])[1] || '';
  if (/^\d{4}$/.test(b)) h.year = b;
  if (/\b(UK|BBC)\b/.test(b)) h.country = 'GB';
  if (/\bUS\b/.test(b)) h.country = 'US';
  if (/Australia/i.test(b)) h.country = 'AU';
  if (/modern/i.test(b)) h.prefer = 'newest';
  if (/original/i.test(b)) h.prefer = 'oldest';
  return h;
}

async function castOverlap(id, profileCast) {
  if (!profileCast) return 0;
  const c = await api(`/tv/${id}/aggregate_credits`);
  const text = profileCast.toLowerCase();
  return (c.cast || []).slice(0, 25).filter(p => text.includes(lastName(p.name))).length;
}

async function findShow(title) {
  if (title in overrides) return overrides[title] == null ? null : {id: overrides[title], match: 'manual'};
  const h = hints(title), cast = profiles[title]?.cast;
  const res = (await api('/search/tv', {query: h.query, first_air_date_year: h.year, include_adult: 'false'})).results || [];
  let exact = res.filter(r => norm(r.name) === norm(h.query) || norm(r.original_name) === norm(h.query));
  if (h.country && exact.some(r => (r.origin_country || []).includes(h.country)))
    exact = exact.filter(r => (r.origin_country || []).includes(h.country));
  if (h.prefer) {
    exact.sort((a, b) => String(a.first_air_date).localeCompare(String(b.first_air_date)));
    if (h.prefer === 'newest') exact.reverse();
    if (exact.length) return {id: exact[0].id, match: 'hint'};
  }
  if (!exact.length) return res[0] ? {id: res[0].id, match: 'fuzzy'} : null;
  if (exact.length === 1) return {id: exact[0].id, match: h.year || h.country ? 'hint' : 'name'};
  if (cast) {
    const scored = [];
    for (const r of exact.slice(0, 5)) scored.push({id: r.id, n: await castOverlap(r.id, cast)});
    scored.sort((a, b) => b.n - a.n);
    if (scored[0].n > 0) return {id: scored[0].id, match: 'cast'};
  }
  exact.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
  if (h.country) return {id: exact[0].id, match: 'hint'};
  const close = (exact[1].vote_count || 0) >= 0.25 * (exact[0].vote_count || 0);
  return {id: exact[0].id, match: close ? 'ambiguous' : 'name'};
}

const year = d => (d ? String(d).slice(0, 4) : null);
const prov = list => (list || []).sort((a, b) => a.display_priority - b.display_priority)
  .map(p => ({name: p.provider_name, logo: p.logo_path}));

async function details(title, found) {
  const d = await api(`/tv/${found.id}`, {append_to_response: 'aggregate_credits,content_ratings,watch/providers,external_ids,keywords,recommendations'});
  const us = d['watch/providers']?.results?.US || {};
  const cast = (d.aggregate_credits?.cast || []).slice(0, 8).map(p => p.name);
  const rec = {
    id: d.id, name: d.name, year: year(d.first_air_date), endYear: year(d.last_air_date),
    status: d.status, seasons: d.number_of_seasons, episodes: d.number_of_episodes,
    overview: d.overview || '', genres: (d.genres || []).map(g => g.name),
    networks: (d.networks || []).map(n => ({name: n.name, logo: n.logo_path})),
    poster: d.poster_path, backdrop: d.backdrop_path, cast,
    rating: (d.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US')?.rating || null,
    imdb: d.external_ids?.imdb_id || null,
    providers: {link: us.link || null, stream: prov(us.flatrate), free: prov(us.free), ads: prov(us.ads), buy: prov(us.buy), rent: prov(us.rent)},
    country: d.origin_country || [], language: d.original_language || null,
    keywords: (d.keywords?.results || []).map(k => k.name),
    similar: (d.recommendations?.results || []).slice(0, 20).map(r => r.id),
    nextEpisode: d.next_episode_to_air ? {date: d.next_episode_to_air.air_date, season: d.next_episode_to_air.season_number, episode: d.next_episode_to_air.episode_number} : null,
    match: found.match
  };
  const profileCast = profiles[title]?.cast;
  if (profileCast) rec.castCheck = cast.filter(n => profileCast.toLowerCase().includes(lastName(n))).length;
  return rec;
}

const titles = [...new Set(catalog.map(x => x.title))];
const out = {}, problems = [];
let done = 0;
async function worker(queue) {
  for (let t; (t = queue.shift()) !== undefined;) {
    try {
      const f = await findShow(t);
      out[t] = f ? await details(t, f) : null;
      if (!f) problems.push(`no match: ${t}`);
      else if (['fuzzy', 'ambiguous'].includes(f.match)) problems.push(`${f.match}: ${t} -> ${out[t].name} (${out[t].year})`);
    } catch (e) { problems.push(`error: ${t}: ${e.message}`); out[t] = null; }
    if (++done % 50 === 0) console.error(`${done}/${titles.length}`);
  }
}
const queue = [...titles];
await Promise.all(Array.from({length: 6}, () => worker(queue)));

const ordered = Object.fromEntries(titles.map(t => [t, out[t] ?? null]));
fs.writeFileSync(path.join(ROOT, 'tmdb.json'), JSON.stringify({
  source: 'This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming data provided by JustWatch.',
  imageBase: 'https://image.tmdb.org/t/p/',
  generated: new Date().toISOString().slice(0, 10),
  shows: ordered
}, null, 1) + '\n');
const count = k => Object.values(ordered).filter(v => v && v.match === k).length;
console.log(`Matched ${Object.values(ordered).filter(Boolean).length}/${titles.length}:`,
  ['cast', 'name', 'hint', 'manual', 'ambiguous', 'fuzzy'].map(k => `${k} ${count(k)}`).join(', '));
if (problems.length) console.log('Review:\n  ' + problems.join('\n  '));
