// Queuey accounts: households, profiles and sync (Firebase).
//
//   households/{hid}                 name, owner, members, invited emails, streaming services, added shows
//   households/{hid}/profiles/{pid}  one person's ratings and lists ("changes")
//   users/{uid}                      which household an account belongs to
//   invites/{email}                  an open invitation to join a household
//   signals/{hid}                    anonymous copy of the ratings (no names or emails) that the
//                                    nightly job reads to find new shows for each profile
//
// Only a household's members can read or change it (see firestore.rules). Every change carries
// a timestamp (_t) and the newer one wins, so phones can edit offline and catch up later.
const SYNC = {ready: false, user: null, db: null, hid: null, household: null, pid: null, profiles: {}, pushing: null, unsub: [], gate: null};
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SESSION_KEY = 'queuey_session_v1';
const LEGACY_CHANGES_KEY = 'swordstv_v1_user_changes';
const AVATAR_COLORS = ['#e0a33a', '#ef6a5b', '#4f9fe0', '#4cc38a', '#a77ce0', '#e07fb0', '#5bc0c8', '#9aa34a'];

// Whether data.json's built-in ratings belong to the current profile (only the original
// family profile, which was moved over from the first version of the app).
let LEGACY_CATALOG = true;

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
const stamp = c => (c && c._t) || 0;
const lower = e => String(e || '').trim().toLowerCase();
const fs = () => firebase.firestore;

// Newest version of each show wins.
function mergeChanges(local, remote) {
  const out = {...remote};
  for (const [t, c] of Object.entries(local || {})) if (!(t in out) || stamp(c) > stamp(out[t])) out[t] = c;
  return out;
}

// ── Session: which household and profile this device last used ──
function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function saveSession() { localStorage.setItem(SESSION_KEY, JSON.stringify({uid: SYNC.user && SYNC.user.uid, hid: SYNC.hid, pid: SYNC.pid, legacy: LEGACY_CATALOG, name: profileName()})); }
const profileKey = (pid, legacy) => legacy ? LEGACY_CHANGES_KEY : 'queuey_changes_' + pid;
function useProfileStorage(pid, legacy) {
  LEGACY_CATALOG = !!legacy;
  STORAGE = profileKey(pid, legacy);
  try { changes = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { changes = {}; }
}
// Before Firebase answers, open the profile this device used last time so the app appears at once.
(function restoreSession() {
  const s = readSession();
  if (s && s.pid) { SYNC.pid = s.pid; SYNC.hid = s.hid; LEGACY_CATALOG = !!s.legacy; SYNC.initialStorage = profileKey(s.pid, s.legacy); }
  else LEGACY_CATALOG = !!localStorage.getItem(LEGACY_CHANGES_KEY);
})();

// ── The current profile's settings ──
// ageGroup: adult | teen | kids. comfort (adults): violence, sex, language = mild | moderate | any;
// dark = avoid | some | fine. prefs: answers from the taste setup.
const AGE_GROUPS = {adult: 'Adult (18+)', teen: 'Teen (13–17)', kids: 'Kids (under 13)'};
const DEFAULT_COMFORT = {violence: 'moderate', sex: 'moderate', language: 'moderate', dark: 'some'};
function currentProfile() {
  const p = SYNC.profiles[SYNC.pid] || {};
  return {ageGroup: p.ageGroup || 'adult', comfort: {...DEFAULT_COMFORT, ...(p.comfort || {})}, prefs: p.prefs || {}, setupDone: !!p.setupDone || !!p.legacyCatalog, name: p.name || '', legacyCatalog: !!p.legacyCatalog};
}
// What the taste engine reads: the setup answers plus how the profile feels about dark themes.
function currentPrefs() { const p = currentProfile(); return {...p.prefs, dark: p.ageGroup === 'adult' ? p.comfort.dark : 'avoid'}; }
async function updateProfile(pid, fields) {
  await SYNC.db.doc(`households/${SYNC.hid}/profiles/${pid}`).set({...fields, updatedAt: Date.now()}, {merge: true});
  SYNC.profiles[pid] = {...(SYNC.profiles[pid] || {}), ...fields};
}

function profileName() { const p = SYNC.profiles[SYNC.pid]; return p ? p.name : ((readSession() || {}).name || ''); }

const SYNC_SHORT = {'Sign in to sync': 'Sign in', 'Sync paused': 'Paused'};
function syncStatus(text, signedIn) {
  const b = document.getElementById('syncBtn');
  if (!b) return;
  const name = signedIn && text === 'Synced' ? profileName() : '';
  b.textContent = name || SYNC_SHORT[text] || text;
  b.title = name ? `${name} · synced` : text;
  b.classList.toggle('signed-in', !!signedIn);
}

// ── Start up ──
async function syncStart() {
  try {
    const cfg = await fetch('firebase-config.json', {cache: 'no-cache'}).then(r => r.json());
    await loadScript(FIREBASE_SDK + 'firebase-app-compat.js');
    await Promise.all([loadScript(FIREBASE_SDK + 'firebase-auth-compat.js'), loadScript(FIREBASE_SDK + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(cfg);
    SYNC.db = firebase.firestore();
    // Local testing only: firebase-config.json with an "emulator" host on localhost.
    if (cfg.emulator && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { firebase.auth().useEmulator(`http://${cfg.emulator}:9099`); SYNC.db.useEmulator(cfg.emulator, 8080); }
    SYNC.cfg = cfg;
    SYNC.ready = true;
    firebase.auth().getRedirectResult().catch(e => gateError(e));
    firebase.auth().onAuthStateChanged(u => onUser(u).catch(e => { console.warn('Account load failed', e); offlineFallback(); }));
  } catch (e) {
    console.warn('Sync unavailable; using this phone only.', e);
    syncStatus('Offline', false);
  }
}

// No connection: keep using the last profile on this device rather than locking the app.
function offlineFallback() {
  if (SYNC.pid) { hideGate(); syncStatus('Offline', true); render(); }
  // The original family's phones keep working on their saved copy if the new household data can't be reached.
  else if (localStorage.getItem(LEGACY_CHANGES_KEY)) { hideGate(); syncStatus('Sync paused', false); if (DATA) render(); }
  else showGate('message', {title: 'Can’t reach Queuey', text: 'Check your connection and try again.', button: 'Try again', action: () => onUser(SYNC.user)});
}

function stopListening() { SYNC.unsub.forEach(f => { try { f(); } catch {} }); SYNC.unsub = []; }

async function onUser(u) {
  stopListening();
  SYNC.user = u;
  if (!u) { SYNC.hid = null; SYNC.household = null; SYNC.profiles = {}; syncStatus('Sign in to sync', false); showGate('signin'); return; }
  const passwordAccount = u.providerData.some(p => p.providerId === 'password');
  if (passwordAccount && !u.emailVerified) { showGate('verify'); return; }
  syncStatus('Syncing…', false);
  const db = SYNC.db;
  let hid = null;
  const me = await db.doc('users/' + u.uid).get();
  if (me.exists && me.data().householdId) {
    try { await db.doc('households/' + me.data().householdId).get(); hid = me.data().householdId; } catch { hid = null; }
  }
  if (!hid) hid = await joinFromInvite(u);
  if (!hid) {
    const legacy = await legacyFamily();
    if (legacy && legacy.migratedTo) { showGate('message', {title: 'Your family is already here', text: 'Your family’s ratings were moved into a household. Ask whoever moved them to invite this email address from their Account menu, then sign in again.', button: 'Sign out', action: () => firebase.auth().signOut()}); return; }
    if (legacy) { showGate('migrate', {legacy}); return; }
    showGate('create');
    return;
  }
  await enterHousehold(hid);
}

// ── Households ──
async function enterHousehold(hid) {
  stopListening();
  if (SYNC.hid !== hid) SYNC.pid = null;
  SYNC.hid = hid;
  const db = SYNC.db;
  SYNC.unsub.push(db.doc('households/' + hid).onSnapshot(snap => applyHousehold(snap.data() || {}), e => console.warn('Household read failed', e)));
  let first = true;
  SYNC.unsub.push(db.collection('households/' + hid + '/profiles').onSnapshot(snap => {
    SYNC.profiles = {};
    snap.forEach(d => { SYNC.profiles[d.id] = {id: d.id, ...d.data()}; });
    if (first) {
      first = false;
      const ids = Object.keys(SYNC.profiles);
      if (SYNC.pid && SYNC.profiles[SYNC.pid]) selectProfile(SYNC.pid);
      else if (ids.length === 1) selectProfile(ids[0]);
      else showGate(ids.length ? 'profiles' : 'newprofile');
    } else if (SYNC.pid && SYNC.profiles[SYNC.pid]) applyRemoteProfile(SYNC.profiles[SYNC.pid]);
    if (SYNC.gate === 'profiles') showGate('profiles');
  }, e => { console.warn('Profiles read failed', e); offlineFallback(); }));
}

function applyHousehold(data) {
  SYNC.household = data;
  const addedChanged = mergeAdded(data.added);
  if (data.subscriptions) localStorage.setItem(SUBS_KEY, JSON.stringify(data.subscriptions));
  if (addedChanged && DATA && SYNC.pid) { if (currentView === 'detail') renderDetail(); else render(); }
  const addedNewer = Object.keys(ADDED).some(t => !(data.added || {})[t] || (ADDED[t]._t || 0) > ((data.added || {})[t]._t || 0));
  if (addedNewer) syncPush();
  if (SYNC.gate === 'account') renderAccount();
}

function selectProfile(pid) {
  const p = SYNC.profiles[pid];
  if (!p) return;
  SYNC.pid = pid;
  useProfileStorage(pid, p.legacyCatalog);
  saveSession();
  hideGate();
  applyRemoteProfile(p, true);
  syncStatus('Synced', true);
  syncPush(); // keeps the anonymous signals copy current
  if (!p.setupDone && !p.legacyCatalog && typeof startSetup === 'function') startSetup();
  if (DATA) { currentView = currentView === 'detail' ? 'home' : currentView; render(); }
}

function applyRemoteProfile(p, force) {
  const remote = p.changes || {};
  const merged = mergeChanges(changes, remote);
  const localNewer = Object.keys(merged).some(t => merged[t] !== remote[t]);
  const changed = JSON.stringify(merged) !== JSON.stringify(changes);
  changes = merged;
  localStorage.setItem(STORAGE, JSON.stringify(changes));
  if ((changed || force) && DATA) { if (currentView === 'detail') renderDetail(); else render(); }
  if (localNewer) syncPush();
  syncStatus('Synced', true);
}

// What the nightly job may see: ratings and list state only, no names or emails.
function signalOf(ch) {
  const out = {};
  for (const [t, c] of Object.entries(ch || {})) out[t] = {rating: c.rating ?? null, watched: c.watched ?? null, libraryStatus: c.libraryStatus ?? null, status: c.status ?? null, dismissed: !!c.dismissed, snoozeUntil: c.snoozeUntil || 0, _t: c._t || 0};
  return out;
}

// Send this profile's ratings, and the household's services and added shows.
function syncPush() {
  if (!SYNC.ready || !SYNC.user || !SYNC.hid || !SYNC.pid) return;
  clearTimeout(SYNC.pushing);
  SYNC.pushing = setTimeout(() => {
    let subs = {};
    try { subs = JSON.parse(localStorage.getItem(SUBS_KEY) || '{}'); } catch {}
    const db = SYNC.db, now = Date.now(), b = db.batch(), hid = SYNC.hid, pid = SYNC.pid;
    b.set(db.doc(`households/${hid}/profiles/${pid}`), {changes, updatedAt: now, updatedBy: SYNC.user.email || ''}, {merge: true});
    b.set(db.doc('households/' + hid), {added: ADDED, subscriptions: subs, updatedAt: now}, {merge: true});
    const cp = currentProfile();
    b.set(db.doc('signals/' + hid), {profiles: {[pid]: {legacyCatalog: LEGACY_CATALOG, ageGroup: cp.ageGroup, prefs: currentPrefs(), comfort: cp.comfort, changes: signalOf(changes)}}, added: ADDED, updatedAt: now}, {merge: true});
    b.commit().then(() => syncStatus('Synced', true))
      .catch(e => { syncStatus('Sync paused', true); console.warn('Sync failed', e); });
  }, 400);
}

// ── Invitations ──
async function joinFromInvite(u) {
  const email = lower(u.email);
  if (!email) return null;
  const db = SYNC.db;
  let inv;
  try { inv = await db.doc('invites/' + email).get(); } catch { return null; }
  if (!inv.exists) return null;
  const hid = inv.data().householdId;
  await db.doc('households/' + hid).update({
    memberUids: fs().FieldValue.arrayUnion(u.uid),
    ['members.' + u.uid]: {email, name: u.displayName || email.split('@')[0], joined: Date.now()},
    invitedEmails: fs().FieldValue.arrayRemove(email)
  });
  await db.doc('users/' + u.uid).set({householdId: hid});
  await db.doc('invites/' + email).delete().catch(() => {});
  toast(`Welcome to ${inv.data().householdName || 'your household'}!`);
  return hid;
}

async function inviteEmail(raw) {
  const email = lower(raw);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('That doesn’t look like an email address'); return false; }
  const db = SYNC.db, hid = SYNC.hid;
  await db.doc('invites/' + email).set({householdId: hid, householdName: (SYNC.household || {}).name || '', invitedBy: SYNC.user.email || '', on: Date.now()});
  await db.doc('households/' + hid).update({invitedEmails: fs().FieldValue.arrayUnion(email)});
  return true;
}
async function cancelInvite(email) {
  const db = SYNC.db;
  await db.doc('households/' + SYNC.hid).update({invitedEmails: fs().FieldValue.arrayRemove(email)});
  await db.doc('invites/' + email).delete().catch(() => {});
}

// ── Creating things ──
function newId() { return SYNC.db.collection('households').doc().id; }

async function createHousehold({name, profile, invite, legacy}) {
  const u = SYNC.user, db = SYNC.db, hid = newId(), pid = newId(), email = lower(u.email);
  let subs = {};
  try { subs = JSON.parse(localStorage.getItem(SUBS_KEY) || '{}'); } catch {}
  const added = legacy ? {...(legacy.added || {}), ...ADDED} : {};
  await db.doc('households/' + hid).set({
    name, ownerUid: u.uid, memberUids: [u.uid], members: {[u.uid]: {email, name: u.displayName || email.split('@')[0], joined: Date.now()}},
    invitedEmails: [], subscriptions: legacy ? (legacy.subscriptions || subs) : {}, added, createdAt: Date.now()
  });
  const profileChanges = legacy ? mergeChanges(JSON.parse(localStorage.getItem(LEGACY_CHANGES_KEY) || '{}'), legacy.changes || {}) : {};
  await db.doc(`households/${hid}/profiles/${pid}`).set({name: profile, color: AVATAR_COLORS[0], ageGroup: 'adult', legacyCatalog: !!legacy, setupDone: !!legacy, changes: profileChanges, createdAt: Date.now()});
  await db.doc('users/' + u.uid).set({householdId: hid});
  SYNC.hid = hid;
  if (legacy) {
    ADDED = added; saveAdded();
    await db.doc(SYNC.cfg.familyDoc).set({migratedTo: hid, migratedAt: Date.now(), migratedBy: email}, {merge: true}).catch(() => {});
  }
  if (invite) await inviteEmail(invite).catch(e => console.warn('Invite failed', e));
  SYNC.pid = pid;
  await enterHousehold(hid);
}

async function addProfile(name, ageGroup = 'adult') {
  const pid = newId(), used = Object.values(SYNC.profiles).map(p => p.color);
  const color = AVATAR_COLORS.find(c => !used.includes(c)) || AVATAR_COLORS[Object.keys(SYNC.profiles).length % AVATAR_COLORS.length];
  await SYNC.db.doc(`households/${SYNC.hid}/profiles/${pid}`).set({name, color, ageGroup, legacyCatalog: false, setupDone: false, changes: {}, createdAt: Date.now()});
  return pid;
}

// The first version of the app kept one shared family document. Its members can read it;
// everyone else gets "permission denied".
async function legacyFamily() {
  if (!SYNC.cfg.familyDoc) return null;
  try {
    const ref = SYNC.db.doc(SYNC.cfg.familyDoc), snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.migratedTo) return data;
    // Reading may still be public under the old rules, so also prove this account may write to it.
    await ref.set({lastCheck: Date.now()}, {merge: true});
    return data;
  } catch { return null; }
}

// ── Sign in ──
function signInGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(e => {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code))
      firebase.auth().signInWithRedirect(provider);
    else if (e.code !== 'auth/popup-closed-by-user') gateError(e);
  });
}
const AUTH_ERRORS = {
  'auth/invalid-email': 'That email address isn’t valid.',
  'auth/user-not-found': 'No account with that email. Tap “Create an account”.',
  'auth/wrong-password': 'That password doesn’t match.',
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/invalid-login-credentials': 'That email and password don’t match.',
  'auth/email-already-in-use': 'There’s already an account with that email. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters for the password.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/operation-not-allowed': 'Email sign-in isn’t switched on yet. Use Google for now.'
};
function gateError(e) {
  const msg = AUTH_ERRORS[e && e.code] || (e && e.message) || 'Something went wrong.';
  const el = document.getElementById('gateError');
  if (el) { el.textContent = msg; el.hidden = false; } else toast(msg);
}

// Header button: account menu when signed in, sign-in screen otherwise.
function syncSignIn() {
  if (!SYNC.ready) { toast('Sync isn’t available right now'); return; }
  if (!SYNC.user) { showGate('signin'); return; }
  if (SYNC.hid && SYNC.pid) openAccount(); else onUser(SYNC.user);
}

// ── Full-screen setup screens ──
const avatar = (p, big) => `<span class="avatar${big ? ' big' : ''}" style="--av:${esc(p.color || AVATAR_COLORS[0])}">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
function hideGate() { const g = document.getElementById('gate'); if (g) g.hidden = true; document.body.classList.remove('gated'); if (SYNC.gate !== 'account') SYNC.gate = null; }
function showGate(kind, opts = {}) {
  SYNC.gate = kind;
  const g = document.getElementById('gate');
  document.body.classList.add('gated');
  g.hidden = false;
  const u = SYNC.user, mascot = '<img class="gate-mascot" src="queuey.svg" alt="">';
  let html = '';
  if (kind === 'signin') {
    const create = !!opts.create;
    html = `${mascot}<h2>${create ? 'Create your account' : 'Welcome to <span class="wordmark-inline">Queuey</span>'}</h2>
      <p class="gate-lead">${create ? 'One account for your household. You’ll add everyone’s profiles next.' : 'Your TV buddy: I learn what your household loves and find what to watch next.'}</p>
      <button class="btn google-btn" id="gGoogle"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
      <div class="gate-or"><span>or with email</span></div>
      <form id="gEmailForm" class="gate-form">
        <label for="gEmail">Email</label><input class="field" id="gEmail" type="email" autocomplete="username email" inputmode="email" autocapitalize="off" required>
        <label for="gPass">Password</label><input class="field" id="gPass" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" minlength="${create ? 8 : 1}" required>
        ${create ? '<p class="gate-hint">On iPhone, tap “Use Strong Password”. It’s saved to your Keychain and filled in with Face ID, so you never type it.</p>' : ''}
        <p class="gate-error" id="gateError" hidden></p>
        <button class="btn primary" type="submit">${create ? 'Create account' : 'Sign in'}</button>
      </form>
      <div class="gate-links">${create ? '<button class="link-btn" id="gMode">I already have an account</button>' : '<button class="link-btn" id="gMode">New to Queuey? Create an account</button><button class="link-btn" id="gForgot">Forgot password?</button>'}</div>`;
  } else if (kind === 'verify') {
    html = `${mascot}<h2>Check your email</h2><p class="gate-lead">I sent a link to <strong>${esc(u.email)}</strong>. Tap it to confirm your address, then come back here.</p>
      <p class="gate-error" id="gateError" hidden></p>
      <button class="btn primary" id="gVerified">I’ve confirmed it</button>
      <div class="gate-links"><button class="link-btn" id="gResend">Send the email again</button><button class="link-btn" id="gOut">Use a different account</button></div>`;
  } else if (kind === 'create' || kind === 'migrate') {
    const mig = kind === 'migrate';
    html = `${mascot}<h2>${mig ? 'Welcome back!' : 'Set up your household'}</h2>
      <p class="gate-lead">${mig ? 'Queuey now has households with a profile for each person. I’ll move your family’s ratings, queue and services into your new household. Nothing is lost.' : 'A household shares its streaming services and can hold a profile for each person.'}</p>
      <form id="gHouseForm" class="gate-form">
        <label for="gHouse">Household name</label><input class="field" id="gHouse" required maxlength="40" placeholder="The Smith household" value="${mig ? 'The Swords household' : ''}">
        <label for="gProfile">${mig ? 'Name for the profile that keeps your current ratings' : 'Your profile name'}</label><input class="field" id="gProfile" required maxlength="24" value="${mig ? 'Family' : esc((u && u.displayName || '').split(' ')[0])}">
        <label for="gInvite">Invite another adult (optional)</label><input class="field" id="gInvite" type="email" autocomplete="off" autocapitalize="off" placeholder="their@email.com">
        <p class="gate-hint">They’ll join automatically the first time they sign in with that email. You can add more profiles for kids or anyone without their own login later.</p>
        <p class="gate-error" id="gateError" hidden></p>
        <button class="btn primary" type="submit">${mig ? 'Move us in' : 'Create household'}</button>
      </form>
      <div class="gate-links"><button class="link-btn" id="gOut">Sign out (${esc(u.email || '')})</button></div>`;
  } else if (kind === 'profiles') {
    const ps = Object.values(SYNC.profiles).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    html = `${mascot}<h2>Who’s watching?</h2>
      <div class="profile-grid">${ps.map(p => `<button class="profile-pick" data-pid="${esc(p.id)}">${avatar(p, true)}<span>${esc(p.name)}</span></button>`).join('')}
      ${ps.length < 8 ? '<button class="profile-pick add" id="gAddProfile"><span class="avatar big add">+</span><span>Add profile</span></button>' : ''}</div>`;
  } else if (kind === 'newprofile') {
    html = `${mascot}<h2>Add a profile</h2><p class="gate-lead">Each person gets their own ratings, For You picks and Taste Profile.</p>
      <form id="gNewProfile" class="gate-form"><label for="gPName">Name</label><input class="field" id="gPName" required maxlength="24">
      <label>Age group</label>${ageChips('adult')}<p class="gate-hint" id="ageNote">${AGE_NOTES.adult}</p>
      <p class="gate-error" id="gateError" hidden></p><button class="btn primary" type="submit">Add profile</button></form>
      ${Object.keys(SYNC.profiles).length ? '<div class="gate-links"><button class="link-btn" id="gBack">Back</button></div>' : ''}`;
  } else if (kind === 'editprofile') {
    const p = SYNC.profiles[opts.pid] || {}, c = {...DEFAULT_COMFORT, ...(p.comfort || {})}, age = p.ageGroup || 'adult';
    html = `${avatar(p, true)}<h2>${esc(p.name)}</h2>
      <form id="gEditProfile" class="gate-form"><label for="gPName">Name</label><input class="field" id="gPName" required maxlength="24" value="${esc(p.name)}">
      <label>Age group</label>${ageChips(age)}
      <div class="comfort-block"${age === 'adult' ? '' : ' hidden'}><label>Comfort levels</label>${comfortRows(c)}</div>
      <p class="gate-hint" id="ageNote">${AGE_NOTES[age]}</p>
      <p class="gate-error" id="gateError" hidden></p><button class="btn primary" type="submit">Save</button></form>
      <div class="gate-links"><button class="link-btn" id="gRedo">Redo taste setup</button>${opts.pid !== SYNC.pid ? '<button class="link-btn danger" id="gDelete">Delete profile</button>' : ''}<button class="link-btn" id="gCancel">Cancel</button></div>`;
  } else if (kind === 'message') {
    html = `${mascot}<h2>${esc(opts.title)}</h2><p class="gate-lead">${esc(opts.text)}</p>${opts.button ? `<button class="btn primary" id="gMsgBtn">${esc(opts.button)}</button>` : ''}`;
  }
  g.innerHTML = `<div class="gate-card">${html}</div>`;
  g.scrollTop = 0;
  const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = f; };
  const busy = (form, fn) => async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    const err = document.getElementById('gateError'); if (err) err.hidden = true;
    try { await fn(); } catch (x) { gateError(x); } finally { btn.disabled = false; }
  };
  on('gGoogle', signInGoogle);
  on('gMode', () => showGate('signin', {create: !opts.create}));
  on('gForgot', async () => {
    const email = document.getElementById('gEmail').value.trim();
    if (!email) { gateError({message: 'Type your email above first, then tap “Forgot password?”.'}); return; }
    try { await firebase.auth().sendPasswordResetEmail(email); gateError({message: 'Check your email for a link to choose a new password.'}); } catch (x) { gateError(x); }
  });
  on('gOut', () => firebase.auth().signOut());
  on('gBack', () => showGate('profiles'));
  on('gMsgBtn', () => opts.action && opts.action());
  on('gResend', async () => { try { await u.sendEmailVerification(); gateError({message: 'Sent. Check your inbox (and spam folder).'}); } catch (x) { gateError(x); } });
  on('gVerified', async () => { await u.reload(); if (firebase.auth().currentUser.emailVerified) { await u.getIdToken(true); onUser(firebase.auth().currentUser); } else gateError({message: 'Not confirmed yet. Tap the link in the email first.'}); });
  on('gAddProfile', () => showGate('newprofile'));
  g.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => selectProfile(b.dataset.pid));
  const ef = document.getElementById('gEmailForm');
  if (ef) ef.onsubmit = busy(ef, async () => {
    const email = document.getElementById('gEmail').value.trim(), pass = document.getElementById('gPass').value;
    if (opts.create) { const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass); await cred.user.sendEmailVerification(); }
    else await firebase.auth().signInWithEmailAndPassword(email, pass);
  });
  const hf = document.getElementById('gHouseForm');
  if (hf) hf.onsubmit = busy(hf, () => createHousehold({name: document.getElementById('gHouse').value.trim(), profile: document.getElementById('gProfile').value.trim(), invite: document.getElementById('gInvite').value.trim(), legacy: opts.legacy}));
  const pf = document.getElementById('gNewProfile');
  if (pf) pf.onsubmit = busy(pf, async () => { const pid = await addProfile(document.getElementById('gPName').value.trim(), pickedAge()); SYNC.pid = null; waitForProfile(pid); });
  bindChoiceChips(g);
  const ep = document.getElementById('gEditProfile');
  if (ep) ep.onsubmit = busy(ep, () => saveProfileEdit(opts.pid));
  on('gRedo', async () => { await updateProfile(opts.pid, {setupDone: false}); if (opts.pid === SYNC.pid) startSetup(); else { selectProfile(opts.pid); } });
  on('gDelete', async () => { if (!confirm(`Delete ${SYNC.profiles[opts.pid].name}'s profile and ratings? This can't be undone.`)) return; await SYNC.db.doc(`households/${SYNC.hid}/profiles/${opts.pid}`).delete(); hideGate(); toast('Profile deleted'); });
  on('gCancel', () => hideGate());
}
// Profiles arrive through the live listener; switch once the new one shows up.
function waitForProfile(pid, tries = 0) {
  if (SYNC.profiles[pid]) selectProfile(pid);
  else if (tries < 40) setTimeout(() => waitForProfile(pid, tries + 1), 100);
}

// ── Account menu ──
function openAccount() { SYNC.gate = 'account'; renderAccount(); showSheet('accountBg'); }
function renderAccount() {
  const body = document.getElementById('accountBody');
  if (!body) return;
  const h = SYNC.household || {}, ps = Object.values(SYNC.profiles).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const members = Object.values(h.members || {}), invited = h.invitedEmails || [], adultHere = currentProfile().ageGroup === 'adult';
  body.innerHTML = `<h3>${esc(h.name || 'Your household')}</h3>
    <div class="acct-section"><div class="acct-label">Profiles</div>
      <div class="profile-row">${ps.map(p => `<button class="profile-pick small${p.id === SYNC.pid ? ' on' : ''}" data-switch="${esc(p.id)}">${avatar(p)}<span>${esc(p.name)}</span></button>`).join('')}
      ${adultHere ? '<button class="profile-pick small add" id="aAdd"><span class="avatar add">+</span><span>Add</span></button>' : ''}</div>
      ${adultHere ? `<div class="edit-row">${ps.map(p => `<button class="link-btn" data-edit="${esc(p.id)}">Edit ${esc(p.name)}</button>`).join('')}</div>` : ''}</div>
    <div class="acct-section"><div class="acct-label">People who can sign in</div>
      <ul class="acct-list">${members.map(m => `<li>${esc(m.email)}</li>`).join('')}${invited.map(e => `<li class="pending">${esc(e)} <em>invited</em> <button class="link-btn" data-uninvite="${esc(e)}">Cancel</button></li>`).join('')}</ul>
      <form id="aInvite" class="invite-form"><input class="field" id="aInviteEmail" type="email" autocomplete="off" autocapitalize="off" placeholder="Invite by email"><button class="btn" type="submit">Invite</button></form>
      <p class="acct-hint">They join this household the first time they sign in to Queuey with that email.</p></div>
    <div class="acct-foot"><span>Signed in as ${esc((SYNC.user || {}).email || '')}</span><button class="btn" id="aSignOut">Sign out</button></div>
    <div class="modal-actions"><button class="btn primary" id="aDone">Done</button></div>`;
  body.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => { hideSheet(); SYNC.gate = null; if (b.dataset.switch !== SYNC.pid) { selectProfile(b.dataset.switch); toast('Switched to ' + SYNC.profiles[b.dataset.switch].name); } });
  body.querySelectorAll('[data-uninvite]').forEach(b => b.onclick = () => cancelInvite(b.dataset.uninvite).catch(e => toast('Couldn’t cancel: ' + e.message)));
  const add = document.getElementById('aAdd'); if (add) add.onclick = () => { hideSheet(); SYNC.gate = null; showGate('newprofile'); };
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { hideSheet(); SYNC.gate = null; showGate('editprofile', {pid: b.dataset.edit}); });
  document.getElementById('aDone').onclick = () => { hideSheet(); SYNC.gate = null; };
  document.getElementById('aSignOut').onclick = () => { if (confirm('Sign out of Queuey on this device?')) { hideSheet(); SYNC.gate = null; localStorage.removeItem(SESSION_KEY); SYNC.pid = null; firebase.auth().signOut(); } };
  document.getElementById('aInvite').onsubmit = async e => {
    e.preventDefault();
    const v = document.getElementById('aInviteEmail').value;
    try { if (await inviteEmail(v)) toast('Invited ' + lower(v)); } catch (x) { toast('Couldn’t invite: ' + (x.message || x.code)); }
  };
}

// ── Age group and comfort-level controls (shared by the add and edit screens) ──
const AGE_NOTES = {
  adult: 'Adults choose their own comfort levels. Anything above them is left out of recommendations.',
  teen: 'Teens see shows rated up to TV-14. Strong content is never recommended, and unrated shows wait for Queuey’s content check.',
  kids: 'Kids see shows rated TV-Y, TV-Y7, TV-G or TV-PG only, in recommendations and in search.'
};
const COMFORT_ROWS = [
  ['violence', 'Violence', [['mild', 'Keep it mild'], ['moderate', 'Moderate is fine'], ['any', 'Anything']]],
  ['sex', 'Sexual content', [['mild', 'Keep it mild'], ['moderate', 'Moderate is fine'], ['any', 'Anything']]],
  ['language', 'Language', [['mild', 'Keep it mild'], ['moderate', 'Moderate is fine'], ['any', 'Anything']]],
  ['dark', 'Dark or bleak themes', [['avoid', 'Avoid'], ['some', 'Sometimes'], ['fine', 'Bring it on']]]
];
const chipGroup = (name, options, value) => `<div class="chips choice" data-choice="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === value ? 'on' : ''}" aria-pressed="${v === value}">${l}</button>`).join('')}</div>`;
const ageChips = v => chipGroup('age', Object.entries(AGE_GROUPS), v);
const comfortRows = c => COMFORT_ROWS.map(([k, label, opts]) => `<div class="comfort-row"><span>${label}</span>${chipGroup('comfort-' + k, opts, c[k])}</div>`).join('') + '<p class="gate-hint">“Moderate is fine” still allows strong content when a show is an exceptionally good match.</p>';
const picked = (root, name) => { const b = root.querySelector(`[data-choice="${name}"] .on`); return b ? b.dataset.v : null; };
const pickedAge = () => picked(document, 'age') || 'adult';
function bindChoiceChips(root) {
  root.querySelectorAll('.chips.choice').forEach(group => group.querySelectorAll('button').forEach(b => b.onclick = () => {
    group.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    if (group.dataset.choice === 'age') {
      const cb = root.querySelector('.comfort-block'); if (cb) cb.hidden = b.dataset.v !== 'adult';
      const n = root.querySelector('#ageNote'); if (n) n.textContent = AGE_NOTES[b.dataset.v];
    }
  }));
}
async function saveProfileEdit(pid) {
  const age = pickedAge(), fields = {name: document.getElementById('gPName').value.trim(), ageGroup: age};
  if (age === 'adult') fields.comfort = Object.fromEntries(COMFORT_ROWS.map(([k]) => [k, picked(document, 'comfort-' + k) || DEFAULT_COMFORT[k]]));
  await updateProfile(pid, fields);
  hideGate();
  if (pid === SYNC.pid) { syncStatus('Synced', true); syncPush(); render(); }
  toast('Profile saved');
}
