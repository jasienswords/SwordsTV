// Optional Face ID / Touch ID lock for this device.
// Uses the phone's own biometric prompt (WebAuthn, "platform authenticator"). The check happens
// on the device: it keeps others in the house from opening Queuey on your phone, but it is not
// a substitute for the account sign-in. Locks when the app opens, and again after 5 minutes away.
const LOCK_KEY = 'queuey_lock_v1', LOCK_AFTER_MS = 5 * 60 * 1000;
const LOCK = {hiddenAt: 0, locked: false};
const lockInfo = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch { return null; } };
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function lockAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
async function enableLock() {
  const cred = await navigator.credentials.create({publicKey: {
    challenge: randomBytes(32), rp: {name: 'Queuey'},
    user: {id: randomBytes(16), name: (SYNC.user && SYNC.user.email) || 'Queuey', displayName: 'Queuey on this device'},
    pubKeyCredParams: [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -257}],
    authenticatorSelection: {authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged'},
    timeout: 60000, attestation: 'none'
  }});
  localStorage.setItem(LOCK_KEY, JSON.stringify({id: toB64(cred.rawId), on: Date.now()}));
}
function disableLock() { localStorage.removeItem(LOCK_KEY); }
async function verifyLock() {
  const info = lockInfo();
  await navigator.credentials.get({publicKey: {challenge: randomBytes(32), allowCredentials: [{type: 'public-key', id: fromB64(info.id), transports: ['internal']}], userVerification: 'required', timeout: 60000}});
}

function showLock() {
  if (!lockInfo() || LOCK.locked) return;
  LOCK.locked = true;
  const el = document.getElementById('lock');
  el.hidden = false;
  document.body.classList.add('gated');
  el.innerHTML = `<div class="gate-card"><img class="gate-mascot" src="queuey.svg" alt=""><h2>Queuey is locked</h2>
    <p class="gate-lead">Use Face ID or Touch ID to open it.</p><p class="gate-error" id="lockError" hidden></p>
    <button class="btn primary wide" id="lockUnlock">Unlock</button>
    <div class="gate-links"><button class="link-btn" id="lockSignOut">Sign out instead</button></div></div>`;
  document.getElementById('lockUnlock').onclick = async () => {
    try { await verifyLock(); hideLock(); }
    catch { const e = document.getElementById('lockError'); e.textContent = 'That didn’t work. Tap Unlock to try again.'; e.hidden = false; }
  };
  document.getElementById('lockSignOut').onclick = () => {
    if (!confirm('Sign out of Queuey on this device? You’ll sign in again with your email or Google, and the Face ID lock will be turned off.')) return;
    disableLock(); hideLock();
    localStorage.removeItem(SESSION_KEY);
    if (SYNC.ready) firebase.auth().signOut();
  };
}
function hideLock() {
  LOCK.locked = false;
  const el = document.getElementById('lock');
  el.hidden = true; el.innerHTML = '';
  if (document.getElementById('gate').hidden) document.body.classList.remove('gated');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) LOCK.hiddenAt = Date.now();
  else if (lockInfo() && LOCK.hiddenAt && Date.now() - LOCK.hiddenAt > LOCK_AFTER_MS) showLock();
});
// Lock straight away when the app opens.
if (lockInfo()) document.addEventListener('DOMContentLoaded', showLock);
