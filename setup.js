// Queuey taste setup: the first-time walkthrough for a new profile.
// Steps: welcome → streaming services (first adult in a new household) → comfort levels (adults)
// → taste questions → favourite shows → quick ratings of well-known shows → what Queuey learned.
// Every step can be skipped; answers are saved as you go, so leaving half-way loses nothing.
const SETUP = {steps: [], step: 0, prefs: {}, comfort: {}, starter: null, idx: 0, favs: [], q: '', results: [], seq: 0};
const SETUP_GENRES = ['Comedy', 'Drama', 'Documentary', 'Reality', 'Mystery', 'Crime', 'Sci-Fi & Fantasy', 'Action & Adventure', 'Animation', 'Family', 'War & Politics'];
const SETUP_RATINGS = [['Loved', 'Loved it'], ['Liked', 'Liked it'], ['Okay', 'It was okay'], ['Disliked', 'Didn’t like it']];

function setupSteps(age) {
  const h = SYNC.household || {}, needServices = age === 'adult' && !h.servicesSet && !Object.keys(h.subscriptions || {}).length;
  return ['welcome', ...(needServices ? ['services'] : []), ...(age === 'adult' ? ['comfort'] : []), 'taste', 'favorites', 'rate', 'summary'];
}
function startSetup(at) {
  if (!DATA) { setTimeout(() => startSetup(at), 300); return; }  // catalogue still loading
  const P = currentProfile();
  SETUP.steps = setupSteps(P.ageGroup);
  SETUP.prefs = {...P.prefs};
  SETUP.comfort = {...P.comfort};
  SETUP.step = at && SETUP.steps.includes(at) ? SETUP.steps.indexOf(at) : 0;
  SETUP.starter = null; SETUP.idx = 0; SETUP.q = ''; SETUP.results = [];
  SETUP.favs = allShows().filter(s => s.rating === 'Loved').map(s => s.title);
  SYNC.gate = 'setup';
  renderSetup();
}
const setupPid = () => SYNC.pid;
async function saveSetup(extra = {}) {
  const fields = {prefs: SETUP.prefs, ...extra};
  if (currentProfile().ageGroup === 'adult') fields.comfort = SETUP.comfort;
  try { await updateProfile(setupPid(), fields); } catch (e) { console.warn('Setup save failed', e); }
}
function nextStep() { SETUP.step = Math.min(SETUP.step + 1, SETUP.steps.length - 1); renderSetup(); }
async function finishSetup() {
  await saveSetup({setupDone: true});
  syncPush();
  hideGate();
  currentView = 'home';
  render();
  window.scrollTo(0, 0);
}

// ── Screens ──
function renderSetup() {
  const g = document.getElementById('gate'), P = currentProfile(), kind = SETUP.steps[SETUP.step];
  document.body.classList.add('gated'); g.hidden = false;
  const you = P.name || 'you', kids = P.ageGroup === 'kids';
  const total = SETUP.steps.length - 1, pct = Math.round(100 * SETUP.step / total);
  const top = kind === 'welcome' || kind === 'summary' ? '' : `<div class="setup-top"><div class="setup-bar"><span style="width:${pct}%"></span></div><button class="link-btn" id="sSkip">Skip setup</button></div>`;
  let html = '';
  if (kind === 'welcome') {
    html = `<img class="gate-mascot" src="queuey.svg" alt=""><h2>Hi ${esc(you)}!</h2>
      <p class="gate-lead">${kids ? 'Let’s find shows you’ll love. Tell me what you like, then rate a few shows you know.' : 'Let’s build your Taste Profile. A few quick questions, a few favourite shows, then fast ratings of shows you might know. About 5 minutes, and you can skip anything.'}</p>
      <button class="btn primary wide" id="sNext">Let’s go</button><div class="gate-links"><button class="link-btn" id="sSkip">Skip for now</button></div>`;
  } else if (kind === 'services') {
    SETUP.services = SETUP.services || new Set(SYNC.household && SYNC.household.servicesSet ? getSubscriptions().filter(s => s.active).map(s => s.name) : []);
    html = `<h2>Your streaming services</h2><p class="gate-lead">Which ones does your household have? Tap every one, including free and live TV services. I’ll point out what’s included and what costs extra.</p>
      ${servicePicker(SETUP.services)}
      <button class="btn primary wide" id="sNext">Next</button>`;
  } else if (kind === 'comfort') {
    html = `<h2>Comfort levels</h2><p class="gate-lead">What are you comfortable seeing? Shows above these levels are left out of your picks. You can change this any time.</p>
      <div class="gate-form">${comfortRows(SETUP.comfort)}</div><button class="btn primary wide" id="sNext">Next</button>`;
  } else if (kind === 'taste') {
    const pr = SETUP.prefs, genres = kids ? [...SETUP_GENRES.filter(g => !['Crime', 'War & Politics'].includes(g)), 'Kids'] : SETUP_GENRES;
    const multi = (name, sel) => `<div class="chips multi" data-multi="${name}">${genres.map(x => `<button type="button" data-v="${esc(x)}" class="${(sel || []).includes(x) ? 'on' : ''}">${esc(x)}</button>`).join('')}</div>`;
    const one = (name, opts, v) => chipGroup(name, opts, v);
    html = `<h2>${kids ? 'What do you like?' : 'Your taste'}</h2><p class="gate-lead">Tap all that fit. These give me a head start; your ratings take over from here.</p>
      <div class="setup-q"><label>Genres ${kids ? 'you like' : 'you love'}</label>${multi('loveGenres', pr.loveGenres)}</div>
      <div class="setup-q"><label>Genres you’d rather skip</label>${multi('avoidGenres', pr.avoidGenres)}</div>
      ${kids ? '' : `<div class="setup-q"><label>British or American?</label>${one('origin', [['GB', 'Mostly British'], ['US', 'Mostly American'], ['both', 'Both']], pr.origin || 'both')}</div>
      <div class="setup-q"><label>How long a commitment?</label>${one('length', [['short', 'Short & done'], ['long', 'Long-running'], ['either', 'Either']], pr.length || 'either')}</div>
      <div class="setup-q"><label>Usual mood</label>${one('mood', [['cozy', 'Cozy & feel-good'], ['gritty', 'Gritty & intense'], ['mix', 'A mix']], pr.mood || 'mix')}</div>
      <div class="setup-q"><label>New or old?</label>${one('era', [['recent', 'Mostly recent'], ['any', 'Classics too']], pr.era || 'any')}</div>`}
      <button class="btn primary wide" id="sNext">Next</button>`;
  } else if (kind === 'favorites') {
    html = `<h2>${kids ? 'Shows you love' : 'A few favourites'}</h2><p class="gate-lead">Search for 3 to 5 shows ${kids ? 'you love' : 'you’ve loved'}. These count the most.</p>
      <div class="fav-chosen">${SETUP.favs.map(t => `<span class="pill fav">${esc(t)} <button type="button" data-unfav="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join('') || '<span class="muted">None yet</span>'}</div>
      <input class="field search" id="sFavQ" type="search" autocomplete="off" placeholder="Search for a show…" value="${esc(SETUP.q)}">
      <div class="fav-results">${SETUP.results.map(r => `<button type="button" class="fav-result" data-fav="${esc(r.key)}">${r.poster ? `<img src="${img(r.poster, 'w92')}" alt="" loading="lazy">` : '<span class="fav-noimg"></span>'}<span><strong>${esc(r.name)}</strong><small>${esc(r.sub)}</small></span><em>${SETUP.favs.includes(r.title) ? '✓' : '+'}</em></button>`).join('')}</div>
      <button class="btn primary wide" id="sNext">${SETUP.favs.length ? 'Next' : 'Skip this step'}</button>`;
  } else if (kind === 'rate') {
    if (!SETUP.starter) { html = `<h2>Quick ratings</h2><p class="gate-lead">Finding shows you might know…</p>`; buildStarter().then(() => { if (SYNC.gate === 'setup' && SETUP.steps[SETUP.step] === 'rate') renderSetup(); }); }
    else {
      const list = SETUP.starter, s = list[SETUP.idx], rated = allShows().filter(x => RATINGS.includes(x.rating)).length;
      if (!s) { nextStep(); return; }
      const t = tm(s) || {};
      html = `<h2>Have you seen it?</h2><p class="gate-lead">${rated} rated so far${rated < 10 ? ` · ${10 - rated} more and I’ll know you well` : ' · nice! Keep going or finish anytime'}</p>
        <div class="rate-card">${t.poster ? `<img src="${img(t.poster, 'w342')}" alt="${esc(s)}" onerror="this.outerHTML='<div class=&quot;rate-noimg&quot;>'+this.alt+'</div>'">` : `<div class="rate-noimg">${esc(s)}</div>`}
        <div class="rate-info"><strong>${esc(s)}</strong><small>${esc([t.year, (t.genres || [])[0], ((t.networks || [])[0] || {}).name].filter(Boolean).join(' · '))}</small></div></div>
        <div class="rate-buttons">${SETUP_RATINGS.map(([v, l]) => `<button type="button" class="btn rate-${v.toLowerCase()}" data-rate="${v}">${l}</button>`).join('')}</div>
        <button type="button" class="btn wide unseen" data-rate="">Haven’t seen it</button>
        <div class="gate-links"><span class="muted">${SETUP.idx + 1} of ${list.length}</span><button class="link-btn" id="sNext">${rated >= 10 ? 'Done rating' : 'Finish later'}</button></div>`;
    }
  } else if (kind === 'summary') {
    const p = buildProfile(allShows(), {...SETUP.prefs, dark: P.ageGroup === 'adult' ? SETUP.comfort.dark : 'avoid'});
    const likes = Object.values(p.traits).filter(x => x.affinity > 0.05 && ['genre', 'country', 'length'].includes(x.type) && (x.rated >= 2 || x.seeded)).sort((a, b) => b.affinity - a.affinity).slice(0, 4).map(x => x.label);
    html = `<img class="gate-mascot" src="queuey.svg" alt=""><h2>You’re all set${P.name ? ', ' + esc(P.name) : ''}!</h2>
      <p class="gate-lead">From ${p.total} rating${p.total === 1 ? '' : 's'}${(SETUP.prefs.loveGenres || []).length ? ' and your answers' : ''}, here’s my first read on your taste. It sharpens every time you rate a show.</p>
      ${likes.length ? `<div class="service-row center">${likes.map(l => `<span class="pill gold">${esc(l)}</span>`).join('')}</div>` : ''}
      <button class="btn primary wide" id="sDone">See my picks</button>`;
  }
  g.innerHTML = `<div class="gate-card setup">${top}${html}</div>`;
  g.scrollTop = 0;
  bindSetup(kind);
}

function bindSetup(kind) {
  const g = document.getElementById('gate'), on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = f; };
  bindChoiceChips(g);
  if (kind === 'services') bindServicePicker(g, SETUP.services);
  g.querySelectorAll('.chips.multi button').forEach(b => b.onclick = () => b.classList.toggle('on'));
  const multi = name => [...g.querySelectorAll(`[data-multi="${name}"] .on`)].map(b => b.dataset.v);
  on('sSkip', () => { if (confirm('Skip the rest of the setup? You can rate shows anytime, and I’ll remind you on For You.')) finishSetup(); });
  on('sDone', finishSetup);
  on('sNext', async () => {
    if (kind === 'services') setSubscriptions([...SETUP.services]);
    if (kind === 'comfort') for (const [k] of COMFORT_ROWS) SETUP.comfort[k] = picked(g, 'comfort-' + k) || SETUP.comfort[k];
    if (kind === 'taste') {
      SETUP.prefs.loveGenres = multi('loveGenres');
      SETUP.prefs.avoidGenres = multi('avoidGenres').filter(x => !SETUP.prefs.loveGenres.includes(x));
      for (const k of ['origin', 'length', 'mood', 'era']) { const v = picked(g, k); if (v) SETUP.prefs[k] = v; }
    }
    if (['services', 'comfort', 'taste'].includes(kind)) saveSetup();
    nextStep();
  });
  if (kind === 'favorites') {
    const q = document.getElementById('sFavQ');
    q.oninput = () => { SETUP.q = q.value; clearTimeout(SETUP.timer); SETUP.timer = setTimeout(favSearch, 300); };
    if (SETUP.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    g.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => pickFavorite(b.dataset.fav));
    g.querySelectorAll('[data-unfav]').forEach(b => b.onclick = () => {
      const t = b.dataset.unfav; SETUP.favs = SETUP.favs.filter(x => x !== t);
      saveChange(t, {rating: 'Not rated', watched: false, completed: false}, {quiet: true}); renderSetup();
    });
  }
  if (kind === 'rate') g.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => {
    const title = SETUP.starter[SETUP.idx];
    if (b.dataset.rate) rateWatched(title, b.dataset.rate);
    SETUP.idx++;
    renderSetup();
  });
}

function rateWatched(title, rating) {
  saveChange(title, {rating, watched: true, completed: true, libraryStatus: 'Not in My Library', status: 'Not in My Library', dismissed: false, snoozeUntil: 0}, {quiet: true});
}

// ── Favourites search: your shows first, then TMDB ──
async function favSearch() {
  const q = SETUP.q.trim(), seq = ++SETUP.seq;
  if (q.length < 2) { SETUP.results = []; renderSetup(); return; }
  const mine = catalogMatches(q).slice(0, 6).map(s => { const t = tm(s.title) || {}; return {key: 'c:' + s.title, title: s.title, name: s.title, poster: t.poster, sub: [t.year, (t.genres || [])[0]].filter(Boolean).join(' · ')}; });
  SETUP.results = mine; renderSetup();
  if (!liveSearch()) return;
  try {
    const have = new Set(Object.values(TMDB).filter(Boolean).map(t => t.id));
    const r = await tmdbGet('/search/tv', {query: q, include_adult: 'false'});
    const more = await ageFilter((r.results || []).filter(x => !have.has(x.id)).slice(0, 8));
    if (seq !== SETUP.seq) return;
    SETUP.results = [...mine, ...more.map(x => ({key: 't:' + x.id, title: x.name, name: x.name, poster: x.poster_path, sub: [(x.first_air_date || '').slice(0, 4), COUNTRY_NAMES[(x.origin_country || [])[0]]].filter(Boolean).join(' · ')}))];
    renderSetup();
  } catch {}
}
async function pickFavorite(key) {
  let title;
  if (key.startsWith('c:')) title = key.slice(2);
  else {
    try {
      const rec = await fetchShow(+key.slice(2));
      title = catalogTitleFor(rec);
      if (!DATA.catalog.some(x => x.title === title)) { TMDB[title] = rec; ensureInCatalog(title); PREVIEW.add(title); }
    } catch { toast('Couldn’t load that show. Try again.'); return; }
  }
  if (SETUP.favs.includes(title)) return;
  rateWatched(title, 'Loved');
  SETUP.favs.push(title);
  SETUP.q = ''; SETUP.results = [];
  renderSetup();
}

// ── Starter set: well-known shows across genres that suit the profile's age group ──
async function buildStarter() {
  const P = currentProfile(), age = P.ageGroup, avoid = new Set(SETUP.prefs.avoidGenres || P.prefs.avoidGenres || []);
  const votes = t => (((SCORES[t] || {}).imdb) || {}).votes || 0;
  const candidates = allShows().filter(s => !PREVIEW.has(s.title) && !RATINGS.includes(s.rating) && !s.watched && tm(s.title) && tm(s.title).poster
    && ratingAllowed(usRatingOf(s.title), age) && !(GUIDANCE[s.title] && GUIDANCE[s.title].status === 'blocked') && !avoid.has((tm(s.title).genres || [])[0]));
  let titles = candidates.sort((a, b) => votes(b.title) - votes(a.title)).slice(0, 160).map(s => s.title);
  // Kids: the family catalogue has few children's shows, so add popular ones from TMDB.
  if (age === 'kids' && liveSearch()) {
    try {
      const have = new Set(Object.values(TMDB).filter(Boolean).map(t => t.id)), found = [];
      for (const g of ['10762', '10751|16']) {
        const r = await tmdbGet('/discover/tv', {with_genres: g, with_original_language: 'en', sort_by: 'popularity.desc', 'vote_count.gte': '150'});
        found.push(...(r.results || []).filter(x => !have.has(x.id) && x.poster_path));
      }
      const recs = await Promise.all(found.slice(0, 24).map(x => fetchShow(x.id).catch(() => null)));
      for (const rec of recs) {
        if (!rec || !KIDS_RATINGS.includes(rec.rating)) continue;
        const title = catalogTitleFor(rec);
        if (!DATA.catalog.some(x => x.title === title)) { TMDB[title] = rec; ensureInCatalog(title); PREVIEW.add(title); }
        titles.unshift(title);
      }
    } catch (e) { console.warn('Kids starter lookup failed', e); }
  }
  // Mix genres so the ratings say something about each.
  const byGenre = {};
  for (const t of [...new Set(titles)]) (byGenre[(tm(t).genres || ['Other'])[0]] = byGenre[(tm(t).genres || ['Other'])[0]] || []).push(t);
  const loved = new Set(SETUP.prefs.loveGenres || []), order = Object.keys(byGenre).sort((a, b) => (loved.has(b) - loved.has(a)) || byGenre[b].length - byGenre[a].length);
  const out = [];
  for (let i = 0; out.length < 30 && order.some(g => byGenre[g][i]); i++) for (const g of order) if (byGenre[g][i] && out.length < 30) out.push(byGenre[g][i]);
  SETUP.starter = out;
  SETUP.idx = 0;
}

// ── Rate more shows (from the Profile page) ──
// 100 of the profile's best current matches, one at a time: rate it if you've seen it,
// add it to Want to Watch, or say you're not interested.
const RATEMORE = {list: [], idx: 0, done: 0};
function startRateMore() {
  const all = allShows().filter(s => !PREVIEW.has(s.title)), profile = buildProfile(all);
  RATEMORE.list = rankedCandidates(all, profile).filter(x => eligible(x.s.title, x.m)).slice(0, 100).map(x => ({title: x.s.title, why: whyText(x.m)}));
  RATEMORE.idx = 0; RATEMORE.done = 0;
  SYNC.gate = 'ratemore';
  renderRateMore();
}
function renderRateMore() {
  const g = document.getElementById('gate'), item = RATEMORE.list[RATEMORE.idx];
  document.body.classList.add('gated'); g.hidden = false;
  if (!item) { endRateMore(); return; }
  const t = tm(item.title) || {}, n = RATEMORE.list.length;
  g.innerHTML = `<div class="gate-card setup"><div class="setup-top"><div class="setup-bar"><span style="width:${Math.round(100 * RATEMORE.idx / n)}%"></span></div><button class="link-btn" id="rmDone">Done</button></div>
    <div class="rate-card">${t.poster ? `<img src="${img(t.poster, 'w342')}" alt="${esc(item.title)}" onerror="this.outerHTML='<div class=&quot;rate-noimg&quot;>'+this.alt+'</div>'">` : `<div class="rate-noimg">${esc(item.title)}</div>`}
    <div class="rate-info"><strong>${esc(item.title)}</strong><small>${esc([t.year, (t.genres || [])[0], ((t.networks || [])[0] || {}).name].filter(Boolean).join(' · '))}</small></div></div>
    ${t.overview ? `<p class="rm-about">${esc(firstSentence(t.overview))}</p>` : ''}
    <div class="rm-label">Seen it?</div>
    <div class="rate-buttons">${SETUP_RATINGS.map(([v, l]) => `<button type="button" class="btn rate-${v.toLowerCase()}" data-rm="${v}">${l}</button>`).join('')}</div>
    <div class="rm-label">Not yet?</div>
    <div class="rate-buttons three"><button type="button" class="btn rm-want" data-rm="want">＋ Want to Watch</button><button type="button" class="btn" data-rm="no">Not interested</button><button type="button" class="btn" data-rm="skip">Skip</button></div>
    <div class="gate-links"><span class="muted">${RATEMORE.idx + 1} of ${n} · ${RATEMORE.done} answered</span></div></div>`;
  g.scrollTop = 0;
  document.getElementById('rmDone').onclick = endRateMore;
  g.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    const v = b.dataset.rm, title = item.title;
    if (SETUP_RATINGS.some(([r]) => r === v)) rateWatched(title, v);
    else if (v === 'want') { const c = getShow(title) || {}; saveChange(title, {libraryStatus: 'Want to Watch', status: 'Want to Watch', dismissed: false, snoozeUntil: 0, ...(c.libraryStatus !== 'Want to Watch' ? {rank: nextRank()} : {})}, {quiet: true}); }
    else if (v === 'no') saveChange(title, {dismissed: true}, {quiet: true});
    if (v !== 'skip') RATEMORE.done++;
    RATEMORE.idx++;
    renderRateMore();
  });
}
function endRateMore() {
  hideGate();
  if (RATEMORE.done) toast(`Thanks! ${RATEMORE.done} answer${RATEMORE.done === 1 ? '' : 's'} saved. Your picks are updated.`);
  render();
}
