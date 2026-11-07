// Shared TMDB access. Needs TMDB_TOKEN (a TMDB "API Read Access Token").
const API = 'https://api.themoviedb.org/3';
const TOKEN = process.env.TMDB_TOKEN;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const lastName = n => String(n).trim().split(/\s+/).pop().toLowerCase();
export async function api(p, params = {}) {
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

export const year = d => (d ? String(d).slice(0, 4) : null);
export const prov = list => (list || []).sort((a, b) => a.display_priority - b.display_priority)
  .map(p => ({name: p.provider_name, logo: p.logo_path}));

export async function details(found, profileCast) {
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
    lastEpisode: d.last_episode_to_air ? {date: d.last_episode_to_air.air_date, season: d.last_episode_to_air.season_number, episode: d.last_episode_to_air.episode_number} : null,
    // A season TMDB lists beyond the latest aired one but with no air date yet: announced, not scheduled.
    announcedSeason: ((d.seasons || []).filter(x => x.season_number > ((d.last_episode_to_air && d.last_episode_to_air.season_number) || 0) && !x.air_date).map(x => x.season_number).sort((a, b) => a - b)[0]) || null,
    match: found.match
  };
  if (profileCast) rec.castCheck = cast.filter(n => profileCast.toLowerCase().includes(lastName(n))).length;
  return rec;
}

