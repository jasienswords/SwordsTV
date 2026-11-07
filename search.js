// SwordsTV search & add.
// Searches the family catalog instantly and, when a public TMDB key is set in
// app-config.json, all of TMDB live (posters, details and where to watch right
// away). Opening a TMDB result previews it like any other show; rating it or
// adding it to the Watchlist adds it to the family's shows (synced via Firebase).
// The nightly job then adds IMDb / Rotten Tomatoes / Metacritic scores and
// content notes, so added shows end up exactly like catalog shows.
const ADDED_KEY = 'swordstv_added_v1';
let ADDED = (() => { try { return JSON.parse(localStorage.getItem(ADDED_KEY) || '{}'); } catch { return {}; } })();
let APP_CONFIG = {}, GUIDANCE = {};
const PREVIEW = new Set();          // TMDB results being looked at but not added
let searchQuery = '', searchResults = null, searchTimer = null, searchSeq = 0;

// ── TMDB (public key; read-only) ──
function tmdbUrl(p, params = {}) {
  const u = new URL('https://api.themoviedb.org/3' + p);
  for (const [k, v] of Object.entries({language: 'en-US', ...params})) u.searchParams.set(k, v);
  if (APP_CONFIG.tmdbKeyType !== 'bearer') u.searchParams.set('api_key', APP_CONFIG.tmdbApiKey);
  return u;
}
async function tmdbGet(p, params) {
  const headers = APP_CONFIG.tmdbKeyType === 'bearer' ? {Authorization: 'Bearer ' + APP_CONFIG.tmdbApiKey} : {};
  const r = await fetch(tmdbUrl(p, params), {headers});
  if (!r.ok) throw new Error('TMDB ' + r.status);
  return r.json();
}
const liveSearch = () => !!APP_CONFIG.tmdbApiKey;

// Same record shape the nightly import writes to tmdb.json.
function tmdbRecord(d) {
  const us = (d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results.US) || {};
  const prov = l => (l || []).slice().sort((a, b) => a.display_priority - b.display_priority).map(p => ({name: p.provider_name, logo: p.logo_path}));
  const yr = x => x ? String(x).slice(0, 4) : null;
  return {
    id: d.id, name: d.name, year: yr(d.first_air_date), endYear: yr(d.last_air_date), status: d.status,
    seasons: d.number_of_seasons, episodes: d.number_of_episodes, overview: d.overview || '',
    genres: (d.genres || []).map(g => g.name), networks: (d.networks || []).map(n => ({name: n.name, logo: n.logo_path})),
    poster: d.poster_path, backdrop: d.backdrop_path,
    cast: ((d.aggregate_credits && d.aggregate_credits.cast) || []).slice(0, 8).map(p => p.name),
    rating: (((d.content_ratings && d.content_ratings.results) || []).find(r => r.iso_3166_1 === 'US') || {}).rating || null,
    imdb: (d.external_ids && d.external_ids.imdb_id) || null,
    providers: {link: us.link || null, stream: prov(us.flatrate), free: prov(us.free), ads: prov(us.ads), buy: prov(us.buy), rent: prov(us.rent)},
    country: d.origin_country || [], language: d.original_language || null,
    keywords: ((d.keywords && d.keywords.results) || []).map(k => k.name),
    similar: ((d.recommendations && d.recommendations.results) || []).slice(0, 20).map(r => r.id),
    nextEpisode: d.next_episode_to_air ? {date: d.next_episode_to_air.air_date, season: d.next_episode_to_air.season_number, episode: d.next_episode_to_air.episode_number} : null,
    lastEpisode: d.last_episode_to_air ? {date: d.last_episode_to_air.air_date, season: d.last_episode_to_air.season_number, episode: d.last_episode_to_air.episode_number} : null,
    // A season TMDB lists beyond the latest aired one but with no air date yet: announced, not scheduled.
    announcedSeason: ((d.seasons || []).filter(x => x.season_number > ((d.last_episode_to_air && d.last_episode_to_air.season_number) || 0) && !x.air_date).map(x => x.season_number).sort((a, b) => a - b)[0]) || null,
    tmdbScore: d.vote_count >= 20 ? Math.round(d.vote_average * 10) / 10 : null,
    match: 'added'
  };
}
const fetchShow = id => tmdbGet('/tv/' + id, {append_to_response: 'aggregate_credits,content_ratings,watch/providers,external_ids,keywords,recommendations'}).then(tmdbRecord);

// ── Added shows (family list, synced) ──
function catalogTitleFor(rec) {
  const existing = Object.entries(TMDB).find(([, t]) => t && t.id === rec.id);
  if (existing) return existing[0];
  // A show added by name earlier (no TMDB link yet) with the same name: link it, keeping its rating.
  const byName = Object.keys(ADDED).find(t => !ADDED[t].id && t.toLowerCase() === String(rec.name).toLowerCase());
  if (byName) { ADDED[byName] = {...ADDED[byName], id: rec.id, year: rec.year, _t: Date.now()}; TMDB[byName] = rec; saveAdded(); syncPush(); return byName; }
  return DATA.catalog.some(x => x.title === rec.name) ? `${rec.name} (${rec.year})` : rec.name;
}
function saveAdded() { localStorage.setItem(ADDED_KEY, JSON.stringify(ADDED)); }
function ensureInCatalog(title) { if (!DATA.catalog.some(x => x.title === title)) DATA.catalog.push({title, rating: '', status: 'Unwatched', note: '', added: true}); }

// Called when a previewed show gets rated or listed: make it a family show.
function adoptShow(title) {
  if (!PREVIEW.has(title)) return;
  PREVIEW.delete(title);
  const t = TMDB[title];
  ADDED[title] = {id: t ? t.id : null, year: t ? t.year : null, addedOn: new Date().toISOString().slice(0, 10), _t: Date.now()};
  saveAdded();
  syncPush();
}

// Put every added show into the catalog; fetch live details for ones the nightly job hasn't covered yet.
async function loadAddedShows() {
  const missing = [];
  for (const [title, a] of Object.entries(ADDED)) {
    ensureInCatalog(title);
    if (!TMDB[title] && a.id && liveSearch()) missing.push([title, a.id]);
  }
  for (const [title, id] of missing) { try { TMDB[title] = await fetchShow(id); } catch {} }
  if (missing.length && DATA) { if (currentView === 'detail') renderDetail(); else render(); }
}
function mergeAdded(remote) {
  let changed = false;
  for (const [t, a] of Object.entries(remote || {})) if (!ADDED[t] || (a._t || 0) > (ADDED[t]._t || 0)) { ADDED[t] = a; changed = true; }
  if (changed) { saveAdded(); loadAddedShows(); }
  return changed;
}

// ── Search view ──
function openSearch() {
  if (currentView !== 'search' && currentView !== 'detail') { previousView = currentView; previousScroll = window.scrollY; }
  currentView = 'search';
  render();
  window.scrollTo(0, 0);
  const q = document.getElementById('searchAll');
  if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
function catalogMatches(q) {
  const n = q.toLowerCase().trim();
  if (!n) return [];
  return allShows().filter(s => s.title.toLowerCase().includes(n) && !PREVIEW.has(s.title))
    .sort((a, b) => (a.title.toLowerCase().startsWith(n) ? 0 : 1) - (b.title.toLowerCase().startsWith(n) ? 0 : 1) || a.title.localeCompare(b.title)).slice(0, 24);
}
function resultCard(r) {
  const yr = (r.first_air_date || '').slice(0, 4);
  return `<article class="show tmdb-result" data-tmdb="${r.id}">${r.poster_path
    ? `<div class="poster has-img" style="--c1:#3a3f4a;--c2:#1c1f26"><img class="poster-img" src="${img(r.poster_path, 'w342')}" alt="" loading="lazy" crossorigin="anonymous"></div>`
    : `<div class="poster" style="--c1:#3a3f4a;--c2:#1c1f26"><div class="poster-title">${esc(r.name)}</div></div>`}
    <div class="show-meta"><strong>${esc(r.name)}</strong><span>${esc([yr, (r.origin_country || [])[0] && COUNTRY_NAMES[r.origin_country[0]]].filter(Boolean).join(' · ') || 'TV series')}</span></div></article>`;
}
function renderSearch() {
  const q = searchQuery.trim(), inCat = catalogMatches(q);
  const catIds = new Set(Object.values(TMDB).filter(Boolean).map(t => t.id));
  const unlinked = new Set(Object.keys(ADDED).filter(t => !ADDED[t].id).map(t => t.toLowerCase()));
  let html = `${heading('Search', liveSearch() ? 'Your shows, plus every TV series on TMDB.' : 'Search your shows, or add one by name.')}
   <div class="filters"><input id="searchAll" class="field search" type="search" autocomplete="off" placeholder="Show title…" value="${esc(searchQuery)}"></div>`;
  if (!q) return html + `<div class="empty">Type a show's name. Found it? Rate it if you've seen it, or add it to My Queue.</div>`;
  html += `<h4 class="group-head">In your shows <span>${inCat.length}</span></h4>` + (inCat.length ? gridOf(inCat) : `<p class="muted">Not in your shows yet.</p>`);
  if (liveSearch()) {
    const more = (searchResults || []).filter(r => !catIds.has(r.id));
    const toLink = more.filter(r => unlinked.has(String(r.name).toLowerCase()));
    html += `<h4 class="group-head">More on TMDB${searchResults ? ` <span>${more.length}</span>` : ''}</h4>`;
    html += searchResults === null ? `<p class="muted">Searching…</p>` : searchResults === 'error'
      ? `<p class="muted">${navigator.onLine ? 'TMDB search isn’t responding right now.' : 'You’re offline.'} You can still add “${esc(q)}” by name below.</p>`
      : more.length ? `<div class="grid">${more.map(resultCard).join('')}</div>` : `<p class="muted">No other TV series match.</p>`;
    if (toLink.length) html += `<p class="muted">You added “${esc(toLink[0].name)}” by name earlier. Tap the matching show above to link it; your rating stays.</p>`;
  }
  if (!liveSearch() || searchResults === 'error') html += `<button class="btn primary add-by-name" id="addByName">＋ Add “${esc(q)}”</button><p class="muted">It’s saved right away; poster and details arrive with tonight’s update.</p>`;
  return html;
}
function bindSearch() {
  const q = document.getElementById('searchAll');
  if (!q) return;
  q.oninput = e => {
    searchQuery = e.target.value;
    searchResults = liveSearch() && searchQuery.trim() ? null : [];
    const pos = q.selectionStart;
    render();
    const n = document.getElementById('searchAll'); n.focus(); n.setSelectionRange(pos, pos);
    clearTimeout(searchTimer);
    if (liveSearch() && searchQuery.trim().length >= 2) {
      const seq = ++searchSeq, term = searchQuery.trim();
      searchTimer = setTimeout(() => tmdbGet('/search/tv', {query: term, include_adult: 'false'})
        .then(r => { if (seq === searchSeq) { searchResults = (r.results || []).slice(0, 18); if (currentView === 'search') { const p2 = document.getElementById('searchAll').selectionStart; render(); const m = document.getElementById('searchAll'); m.focus(); m.setSelectionRange(p2, p2); } } })
        .catch(() => { if (seq === searchSeq) { searchResults = 'error'; if (currentView === 'search') render(); } }), 350);
    }
  };
  document.querySelectorAll('.tmdb-result').forEach(el => el.onclick = () => previewTmdb(+el.dataset.tmdb));
  const add = document.getElementById('addByName');
  if (add) add.onclick = () => {
    const title = searchQuery.trim();
    if (!title) return;
    ADDED[title] = {id: null, query: title, addedOn: new Date().toISOString().slice(0, 10), _t: Date.now()};
    saveAdded(); ensureInCatalog(title); syncPush(); openDetail(title);
  };
}
async function previewTmdb(id) {
  toast('Loading…');
  try {
    const rec = await fetchShow(id);
    const title = catalogTitleFor(rec);
    if (!DATA.catalog.some(x => x.title === title)) { TMDB[title] = rec; ensureInCatalog(title); PREVIEW.add(title); }
    openDetail(title);
  } catch { toast('Couldn’t load that show. Try again.'); }
}
