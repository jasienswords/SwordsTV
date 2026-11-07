// Streaming services: the full U.S. list (providers.json, refreshed nightly from TMDB) and the
// picker used on the Profile page and in the first-time setup. The household's choices are
// saved as subscriptions {name: {active, monthlyCost}}, shared by everyone in it.
let PROVIDERS = [], PROVIDER_ALIAS = {};
const SERVICE_GROUPS = [['popular', 'Popular'], ['subscription', 'More subscriptions'], ['live', 'Live TV'], ['free', 'Free with ads'], ['network', 'TV network apps']];

function loadProviders(d) {
  PROVIDERS = (d && d.services) || [];
  PROVIDER_ALIAS = {};
  for (const s of PROVIDERS) for (const a of s.aliases || []) PROVIDER_ALIAS[a.toLowerCase()] = s.name;
}
const providerLogo = name => { const p = PROVIDERS.find(s => s.name === name); return p && p.logo ? img(p.logo, 'w92') : ''; };

// Turn the chosen names into the saved subscriptions, keeping any prices already entered.
function setSubscriptions(names) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SUBS_KEY) || '{}'); } catch {}
  const chosen = new Set(names), out = {};
  for (const s of getSubscriptions()) out[s.name] = {active: chosen.has(s.name), monthlyCost: (saved[s.name] || {}).monthlyCost || s.monthlyCost || ''};
  for (const n of chosen) if (!out[n]) out[n] = {active: true, monthlyCost: ''};
  localStorage.setItem(SUBS_KEY, JSON.stringify(out));
  if (typeof SYNC !== 'undefined' && SYNC.hid) {
    SYNC.db.doc('households/' + SYNC.hid).set({subscriptions: out, servicesSet: true}, {merge: true}).catch(e => console.warn('Services save failed', e));
  }
  return out;
}

function servicePicker(selected, opts = {}) {
  const list = PROVIDERS.length ? PROVIDERS : SUBSCRIPTION_DEFAULTS.map((s, i) => ({name: s.name, group: 'subscription', priority: i}));
  const subs = list.filter(s => s.group === 'subscription');
  const groups = {popular: subs.slice(0, 24), subscription: subs.slice(24), live: list.filter(s => s.group === 'live'), free: list.filter(s => s.group === 'free'), network: list.filter(s => s.group === 'network')};
  const tile = s => `<button type="button" class="svc${selected.has(s.name) ? ' on' : ''}" data-svc="${esc(s.name)}" aria-pressed="${selected.has(s.name)}">${s.logo ? `<img src="${img(s.logo, 'w92')}" alt="" loading="lazy">` : `<span class="svc-noimg">${esc(s.name.charAt(0))}</span>`}<span>${esc(s.name)}</span></button>`;
  return `<div class="svc-picker"${opts.readOnly ? ' data-readonly="1"' : ''}>
    <div class="svc-mine"><span class="acct-label">Your services · ${selected.size}</span><div class="svc-chosen">${[...selected].map(n => `<span class="pill svc-pill">${providerLogo(n) ? `<img src="${providerLogo(n)}" alt="">` : ''}${esc(n)}${opts.readOnly ? '' : ` <button type="button" data-unsvc="${esc(n)}" aria-label="Remove ${esc(n)}">×</button>`}</span>`).join('') || '<span class="muted">None picked yet</span>'}</div></div>
    ${opts.readOnly ? '' : `<input class="field search svc-search" type="search" autocomplete="off" placeholder="Search ${list.length} services…" aria-label="Search services">
    <div class="svc-results" hidden></div>
    ${SERVICE_GROUPS.map(([k, label]) => groups[k].length ? `<details class="svc-group"${k === 'popular' || opts.open === k ? ' open' : ''}><summary>${label} <span>${groups[k].length}</span></summary><div class="svc-grid">${groups[k].map(tile).join('')}</div></details>` : '').join('')}`}
  </div>`;
}

// Wire up a picker inside `root`. onChange(selectedSet) runs after every tap.
function bindServicePicker(root, selected, onChange) {
  const picker = root.querySelector('.svc-picker');
  if (!picker || picker.dataset.readonly) return;
  const redraw = () => {
    root.querySelectorAll('[data-svc]').forEach(b => { const on = selected.has(b.dataset.svc); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const mine = picker.querySelector('.svc-mine');
    const fresh = document.createElement('div'); fresh.innerHTML = servicePicker(selected);
    mine.replaceWith(fresh.querySelector('.svc-mine'));
    picker.querySelectorAll('[data-unsvc]').forEach(b => b.onclick = () => toggle(b.dataset.unsvc));
  };
  const toggle = name => { selected.has(name) ? selected.delete(name) : selected.add(name); redraw(); onChange && onChange(selected); };
  picker.addEventListener('click', e => { const b = e.target.closest('[data-svc]'); if (b) toggle(b.dataset.svc); });
  picker.querySelectorAll('[data-unsvc]').forEach(b => b.onclick = () => toggle(b.dataset.unsvc));
  const q = picker.querySelector('.svc-search'), results = picker.querySelector('.svc-results');
  if (q) q.oninput = () => {
    const n = q.value.trim().toLowerCase();
    picker.querySelectorAll('.svc-group').forEach(d => d.hidden = !!n);
    results.hidden = !n;
    if (!n) return;
    const hits = (PROVIDERS.length ? PROVIDERS : []).filter(s => s.name.toLowerCase().includes(n) || (s.aliases || []).some(a => a.toLowerCase().includes(n))).slice(0, 30);
    const tmp = document.createElement('div'); tmp.innerHTML = servicePicker(selected, {});
    results.innerHTML = hits.length ? `<div class="svc-grid">${hits.map(s => tmp.querySelector(`[data-svc="${CSS.escape(s.name)}"]`)?.outerHTML || '').join('')}</div>` : '<p class="muted">No service by that name.</p>';
  };
}

// Redraw the Profile page after a change without losing your place or the open picker sections.
function rerenderProfile() {
  const y = window.scrollY, open = [...document.querySelectorAll('.svc-group')].map(d => d.open);
  render();
  document.querySelectorAll('.svc-group').forEach((d, i) => { if (open[i] != null) d.open = open[i]; });
  window.scrollTo(0, y);
}

// The Profile page's services card (household-wide; adults can change it).
function servicesCard() {
  const selected = new Set(getSubscriptions().filter(s => s.active).map(s => s.name));
  const adult = currentProfile().ageGroup === 'adult';
  return `<div class="card" id="servicesCard"><h3 class="card-title">Your streaming services</h3><p class="muted">Shared by everyone in your household. I use these for “On your streaming services” and to point out what costs extra.</p>${servicePicker(selected, {readOnly: !adult})}</div>`;
}
function bindServicesCard() {
  const card = document.getElementById('servicesCard');
  if (!card) return;
  const selected = new Set(getSubscriptions().filter(s => s.active).map(s => s.name));
  let t;
  bindServicePicker(card, selected, sel => { clearTimeout(t); t = setTimeout(() => { setSubscriptions([...sel]); toast('Streaming services saved'); rerenderProfile(); }, 900); });
}
