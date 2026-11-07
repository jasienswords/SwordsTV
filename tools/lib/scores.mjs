// Shared review-score lookups: IMDb dataset, Rotten Tomatoes and Metacritic pages.
// A page is accepted only when the series name matches AND its first-air year
// (within one year) or its cast matches the TMDB record.
import zlib from 'node:zlib';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ascii = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
const norm = s => ascii(s).toLowerCase().replace(/\(\d{4}\)|\((us|uk)\)/g, '').replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const lastName = n => String(n).trim().split(/\s+/).pop().toLowerCase();
const slugBase = s => ascii(s).toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/['’.]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

export async function get(url) {
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
export function ldSeries(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (d['@type'] === 'TVSeries') return d; } catch {}
  }
  return null;
}
export function verify(info, title, t) {
  const names = new Set([norm(title), norm(t.name)]);
  if (!names.has(norm(info.name))) return false;
  const yearOk = t.year && info.year && Math.abs(+info.year - +t.year) <= 1;
  const cast = (t.cast || []).map(lastName);
  const castOk = (info.actors || []).some(a => cast.includes(lastName(a)));
  return yearOk || castOk;
}

// ── Metacritic ──
export async function mcPage(slug) {
  const p = await get(`https://www.metacritic.com/tv/${slug}/`);
  const d = p && ldSeries(p.html);
  if (!d) return null;
  const ag = d.aggregateRating || {};
  return {name: d.name, year: String(d.datePublished || '').slice(0, 4), actors: (d.actor || []).map(a => a.name),
    score: ag.ratingValue ?? null, reviews: ag.reviewCount ?? null, url: d.url || p.url};
}
export async function metacritic(title, t) {
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
export async function rtPage(slug) {
  const p = await get(`https://www.rottentomatoes.com/tv/${slug}`);
  const d = p && ldSeries(p.html);
  if (!d) return null;
  const pct = (key) => { const m = p.html.match(new RegExp(`"${key}":\\{[^}]*?"scorePercent":"(\\d+)%"`)); return m ? +m[1] : null; };
  const reviews = (p.html.match(/"criticsScore":\{[^}]*?"reviewCount":(\d+)/) || [])[1];
  return {name: d.name, year: String(d.dateCreated || d.startDate || '').slice(0, 4), actors: (d.actor || []).map(a => a.name),
    critics: pct('criticsScore'), audience: pct('audienceScore'), reviews: reviews ? +reviews : null, url: p.url.split('?')[0]};
}
export async function rotten(title, t) {
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

export async function loadImdb() {
  const gz = Buffer.from(await (await fetch('https://datasets.imdbws.com/title.ratings.tsv.gz')).arrayBuffer());
  return new Map(zlib.gunzipSync(gz).toString('utf8').split('\n').slice(1).map(l => l.split('\t')).map(([id, r, v]) => [id, {rating: +r, votes: +v}]));
}

// Rotten Tomatoes + Metacritic for one show, in the shape scores.json stores.
export async function siteScores(title, t) {
  const [m, r] = await Promise.all([metacritic(title, t).catch(() => null), rotten(title, t).catch(() => null)]);
  return {
    metascore: m ? (m.score != null ? {score: m.score, reviews: m.reviews, url: m.url} : {score: null, status: 'No Metascore yet (too few critic reviews)', url: m.url}) : {score: null, status: 'Not listed on Metacritic'},
    rt: r ? {critics: r.critics, audience: r.audience, reviews: r.reviews, url: r.url} : null
  };
}
export const imdbEntry = (imdb, id) => { const i = id && imdb.get(id); return i ? {id, rating: i.rating, votes: i.votes} : (id ? {id, rating: null} : null); };
