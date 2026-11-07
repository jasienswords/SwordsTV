// "What are you in the mood for?" on the Profile page: genres, services, styles and eras the
// profile wants more of right now. Saved on the profile; For You moves matching shows up.
const FOCUS_GENRES = ['Comedy', 'Drama', 'Documentary', 'Reality', 'Mystery', 'Crime', 'Sci-Fi & Fantasy', 'Action & Adventure', 'Animation', 'Family', 'War & Politics'];
function currentFocus() { return (typeof SYNC !== 'undefined' && SYNC.profiles[SYNC.pid] && SYNC.profiles[SYNC.pid].focus) || {}; }
function focusCard() {
  if (typeof SYNC === 'undefined' || !SYNC.pid) return '';
  const f = currentFocus(), kids = currentProfile().ageGroup === 'kids';
  const chips = (key, opts) => `<div class="chips multi focus-chips" data-focus="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${(f[key] || []).includes(v) ? 'on' : ''}" aria-pressed="${(f[key] || []).includes(v)}">${esc(l)}</button>`).join('')}</div>`;
  const services = getSubscriptions().filter(s => s.active).map(s => [s.name, s.name]);
  const genres = (kids ? FOCUS_GENRES.filter(g => !['Crime', 'War & Politics'].includes(g)).concat('Kids') : FOCUS_GENRES).map(g => [g, g]);
  const styles = Object.entries(FOCUS_STYLES).filter(([k]) => !(kids && k === 'gritty')).map(([k, v]) => [k, v.label]);
  const eras = Object.entries(FOCUS_ERAS).map(([k, v]) => [k, v.label]);
  const active = ['genres', 'services', 'styles', 'eras'].reduce((n, k) => n + (f[k] || []).length, 0);
  return `<div class="card focus-card" id="focusCard"><h3 class="card-title">What are you in the mood for?</h3>
    <p class="muted">Tap anything you want more of right now and I’ll move it up in For You. Your Taste Profile stays the same; change these whenever your mood does.</p>
    <div class="setup-q"><label>Genres</label>${chips('genres', genres)}</div>
    ${services.length ? `<div class="setup-q"><label>Services</label>${chips('services', services)}</div>` : ''}
    <div class="setup-q"><label>Style</label>${chips('styles', styles)}</div>
    <div class="setup-q"><label>When it was made</label>${chips('eras', eras)}</div>
    <div class="focus-foot"><span class="muted" id="focusStatus">${active ? `${active} preference${active === 1 ? '' : 's'} on` : 'Nothing picked: For You follows your Taste Profile only.'}</span>${active ? '<button class="btn" id="focusClear">Clear all</button>' : ''}</div></div>`;
}
function bindFocusCard() {
  const card = document.getElementById('focusCard');
  if (!card) return;
  let t;
  const save = () => {
    const f = {setAt: Date.now()};
    card.querySelectorAll('[data-focus]').forEach(g => { f[g.dataset.focus] = [...g.querySelectorAll('.on')].map(b => b.dataset.v); });
    clearTimeout(t);
    t = setTimeout(async () => { await updateProfile(SYNC.pid, {focus: f}); syncPush(); toast('For You updated for your mood'); rerenderProfile(); }, 700);
  };
  card.querySelectorAll('[data-focus] button').forEach(b => b.onclick = () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); save(); });
  const clr = document.getElementById('focusClear');
  if (clr) clr.onclick = async () => { await updateProfile(SYNC.pid, {focus: {setAt: Date.now()}}); syncPush(); rerenderProfile(); toast('Mood cleared'); };
}
