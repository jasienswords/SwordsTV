// Queuey family sync (Firebase).
// One shared Firestore document holds every family rating and the subscription
// list. Anyone can read it, so every phone shows the family's ratings; only the
// family's Google accounts can change it (enforced by the Firestore rules).
// Each change carries a timestamp (_t); when two phones edit the same show, the
// newer change wins. Without a connection the app keeps working on this phone's
// saved copy and catches up on the next sync.
const SYNC = {ready: false, user: null, ref: null, pushing: null, lastSeen: null};
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
const stamp = c => (c && c._t) || 0;

// Newest version of each show wins.
function mergeChanges(local, remote) {
  const out = {...remote};
  for (const [t, c] of Object.entries(local || {})) if (!(t in out) || stamp(c) > stamp(out[t])) out[t] = c;
  return out;
}

const SYNC_SHORT = {'Sign in to sync': 'Sign in', 'Not a family account': 'Not allowed', 'Sync paused': 'Paused'};
function syncStatus(text, signedIn) {
  const b = document.getElementById('syncBtn');
  if (!b) return;
  b.textContent = SYNC_SHORT[text] || text;
  b.title = text === 'Synced' ? 'Family sync is on' : text;
  b.classList.toggle('signed-in', !!signedIn);
}

function applyRemote(data) {
  const addedChanged = mergeAdded(data.added);
  const remote = data.changes || {};
  const merged = mergeChanges(changes, remote);
  const localNewer = Object.keys(merged).some(t => merged[t] !== remote[t]);
  const changed = JSON.stringify(merged) !== JSON.stringify(changes);
  changes = merged;
  localStorage.setItem(STORAGE, JSON.stringify(changes));
  if (data.subscriptions) localStorage.setItem(SUBS_KEY, JSON.stringify(data.subscriptions));
  if ((changed || addedChanged) && DATA) { if (currentView === 'detail') renderDetail(); else render(); }
  const addedNewer = Object.keys(ADDED).some(t => !(data.added || {})[t] || (ADDED[t]._t || 0) > ((data.added || {})[t]._t || 0));
  if ((localNewer || addedNewer) && SYNC.user) syncPush();
}

// Send this phone's ratings (and subscriptions) to the family document.
function syncPush() {
  if (!SYNC.ready || !SYNC.user) return;
  clearTimeout(SYNC.pushing);
  SYNC.pushing = setTimeout(() => {
    let subs = {};
    try { subs = JSON.parse(localStorage.getItem(SUBS_KEY) || '{}'); } catch {}
    SYNC.ref.set({changes, added: ADDED, subscriptions: subs, updatedAt: Date.now(), updatedBy: SYNC.user.email}, {merge: true})
      .then(() => syncStatus('Synced', true))
      .catch(e => { syncStatus(e.code === 'permission-denied' ? 'Not a family account' : 'Sync paused', true); console.warn('Sync failed', e); });
  }, 400);
}

async function syncStart() {
  try {
    const cfg = await fetch('firebase-config.json', {cache: 'no-cache'}).then(r => r.json());
    await loadScript(FIREBASE_SDK + 'firebase-app-compat.js');
    await Promise.all([loadScript(FIREBASE_SDK + 'firebase-auth-compat.js'), loadScript(FIREBASE_SDK + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(cfg);
    SYNC.ref = firebase.firestore().doc(cfg.familyDoc);
    SYNC.ready = true;
    syncStatus('Sign in to sync', false);
    SYNC.ref.onSnapshot(snap => applyRemote(snap.exists ? snap.data() : {}), e => console.warn('Sync read failed', e));
    firebase.auth().onAuthStateChanged(u => {
      SYNC.user = u;
      if (u) { syncStatus('Synced', true); syncPush(); } else syncStatus('Sign in to sync', false);
    });
    firebase.auth().getRedirectResult().catch(() => {});
  } catch (e) {
    console.warn('Family sync unavailable; using this phone only.', e);
    syncStatus('Offline', false);
  }
}

function syncSignIn() {
  if (!SYNC.ready) return;
  if (SYNC.user) {
    if (confirm(`Signed in as ${SYNC.user.email}. Sign out of family sync on this phone?`)) firebase.auth().signOut();
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(e => {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code))
      firebase.auth().signInWithRedirect(provider);
    else if (e.code !== 'auth/popup-closed-by-user') toast('Sign-in failed: ' + (e.message || e.code));
  });
}
