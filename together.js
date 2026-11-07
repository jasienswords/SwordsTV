// Watching together: picks for several profiles at once.
// Each show is scored for every person; the blend favours shows nobody will mind (60% average,
// 40% the lowest score). Anyone's Disliked or Not interested rules a show out, and so does
// everyone having seen it. The strictest age group and comfort levels in the group apply.
const TOGETHER = {pids: null};
const AGE_RANK = {kids: 0, teen: 1, adult: 2};
const LIMIT_RANK = {mild: 0, moderate: 1, any: 2}, DARK_RANK = {avoid: 0, some: 1, fine: 2};

function settingsOf(raw) {
  return {ageGroup: raw.ageGroup || 'adult', comfort: {...DEFAULT_COMFORT, ...(raw.comfort || {})}, prefs: raw.prefs || {}, legacyCatalog: !!raw.legacyCatalog, name: raw.name || ''};
}
function strictest(list) {
  const min = (vals, rank) => vals.reduce((a, b) => rank[b] < rank[a] ? b : a);
  return {
    ageGroup: min(list.map(p => p.ageGroup), AGE_RANK),
    comfort: {violence: min(list.map(p => p.comfort.violence), LIMIT_RANK), sex: min(list.map(p => p.comfort.sex), LIMIT_RANK),
      language: min(list.map(p => p.comfort.language), LIMIT_RANK), dark: min(list.map(p => p.comfort.dark), DARK_RANK)},
    prefs: {}, name: 'together'
  };
}
function togetherPicks(pids) {
  const people = pids.map(pid => {
    const raw = SYNC.profiles[pid] || {}, P = settingsOf(raw);
    const shows = allShowsOf(pid === SYNC.pid ? changes : (raw.changes || {}), P.legacyCatalog).filter(s => !PREVIEW.has(s.title));
    const prof = buildProfile(shows, {...P.prefs, dark: P.ageGroup === 'adult' ? P.comfort.dark : 'avoid'});
    return {pid, P, prof, by: new Map(shows.map(s => [s.title, s]))};
  });
  const rules = strictest(people.map(x => x.P)), seenIds = new Set(), out = [];
  for (const x of DATA.catalog) {
    const t = x.title, rec = tm(t);
    if (!rec || PREVIEW.has(t) || seenIds.has(rec.id)) continue;
    let all = true, veto = false;
    const scores = people.map(p => {
      const s = p.by.get(t) || {};
      if (s.rating === 'Disliked' || s.dismissed) veto = true;
      if (!(s.watched || RATINGS.includes(s.rating))) all = false;
      return matchShow(t, p.prof).score;
    });
    if (veto || all) continue;
    const low = Math.min(...scores), avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (!eligible(t, {score: low}, rules)) continue;
    seenIds.add(rec.id);
    out.push({title: t, score: 0.6 * avg + 0.4 * low, scores});
  }
  out.sort((a, b) => b.score - a.score);
  return {rules, people, picks: out.slice(0, 30)};
}

function togetherCard() {
  if (typeof SYNC === 'undefined' || !SYNC.pid || Object.keys(SYNC.profiles).length < 2) return '';
  return `<section class="hero together-cta"><div class="together-avatars">${Object.values(SYNC.profiles).slice(0, 4).map(p => avatar(p)).join('')}</div><div class="hero-content"><h2>Watching together?</h2><p>Pick who’s on the couch and I’ll find something everyone will enjoy.</p></div><button class="btn primary" id="togetherBtn">Find a show&nbsp;→</button></section>`;
}

function renderTogether() {
  const ps = Object.values(SYNC.profiles).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!TOGETHER.pids) TOGETHER.pids = [SYNC.pid];
  TOGETHER.pids = TOGETHER.pids.filter(id => SYNC.profiles[id]);
  let html = `${agent('Who’s watching? I’ll look for shows that suit everyone, and stick to the strictest content settings in the group.')}${heading('Watching together', 'Tap everyone who’s watching.')}
    <div class="together-pick">${ps.map(p => `<button type="button" class="profile-pick small${TOGETHER.pids.includes(p.id) ? ' on' : ''}" data-together="${esc(p.id)}" aria-pressed="${TOGETHER.pids.includes(p.id)}">${avatar(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>`;
  if (TOGETHER.pids.length < 2) return html + `<div class="empty">Pick at least two people.</div>`;
  const {rules, people, picks} = togetherPicks(TOGETHER.pids);
  const limit = rules.ageGroup === 'kids' ? 'Kids limits apply: TV-Y to TV-PG only.' : rules.ageGroup === 'teen' ? 'Teen limits apply: up to TV-14, no strong content.'
    : `Following the strictest comfort levels in the group (violence: ${rules.comfort.violence}, sexual content: ${rules.comfort.sex}, language: ${rules.comfort.language}).`;
  html += `<p class="muted together-rules">${esc(limit)}</p>`;
  if (!picks.length) return html + `<div class="empty">Nothing fits everyone yet. Rating a few more shows on each profile will help.</div>`;
  const names = people.map(p => p.P.name);
  const fitText = x => {
    const best = Math.max(...x.scores), low = Math.min(...x.scores);
    if (best - low < 0.35) return 'Good for everyone';
    const lead = names.filter((n, i) => x.scores[i] >= best - 0.2);
    return 'Especially for ' + (lead.length > 2 ? lead.slice(0, -1).join(', ') + ' & ' + lead.at(-1) : lead.join(' & '));
  };
  const shows = picks.map(x => ({...(getShow(x.title) || {title: x.title}), _fit: fitText(x)}));
  return html + `<div class="together-grid">${gridOf(shows, s => s._fit)}</div>`;
}

// Toggle who's watching.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-together]');
  if (!b) return;
  const id = b.dataset.together, set = new Set(TOGETHER.pids || []);
  set.has(id) ? set.delete(id) : set.add(id);
  TOGETHER.pids = [...set];
  render();
});
