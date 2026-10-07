/* Firebase integration — project collancer-8fd62.
   Single source of truth for auth + firestore access.
   Uses the firebase npm SDK (v10 API) with the project's public web config. */
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  RecaptchaVerifier, signInWithPhoneNumber,
} from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  runTransaction, serverTimestamp, increment, arrayUnion, arrayRemove,
} from 'firebase/firestore';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCfjNkaC2pAePgroS-ginbOy_wRsS2sNw8',
  authDomain: 'collancer-8fd62.firebaseapp.com',
  projectId: 'collancer-8fd62',
  storageBucket: 'collancer-8fd62.firebasestorage.app',
  messagingSenderId: '154521281878',
  appId: '1:154521281878:web:ae6439817888eedd6ce2f7',
};

let _app = null;
let _auth = null;
let _db = null;
let _ready = null;

/** Initialize Firebase once; resolves when auth is usable. 12s safety timeout. */
export function ensureFirebase() {
  if (_ready) return _ready;
  _ready = new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve({ auth: _auth, db: _db }); } };
    try {
      _app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
      _auth = getAuth(_app);
      _db = getFirestore(_app);
      // Wait a tick for auth restoration, then resolve regardless.
      const unsub = onAuthStateChanged(_auth, () => { unsub(); finish(); });
      setTimeout(finish, 12000);
    } catch (e) {
      console.warn('[firebase] init failed', e);
      finish();
    }
  });
  return _ready;
}

export const auth = () => _auth;
export const db = () => _db;

/* ---- Auth helpers ---- */
export async function registerEmail(email, password) {
  await ensureFirebase();
  return createUserWithEmailAndPassword(_auth, email, password);
}
export async function loginEmail(email, password) {
  await ensureFirebase();
  return signInWithEmailAndPassword(_auth, email, password);
}
export async function logout() {
  await ensureFirebase();
  try { await signOut(_auth); } catch (e) { /* noop */ }
  try { localStorage.removeItem('collancer_role'); } catch (e) { /* noop */ }
}
const googleProvider = () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
};
/** Google sign-in helper (popup). Available integration; primary UX is email/password. */
export async function loginGooglePopup() {
  await ensureFirebase();
  return signInWithPopup(_auth, googleProvider());
}
/** Google sign-in helper (redirect). */
export async function loginGoogleRedirect() {
  await ensureFirebase();
  return signInWithRedirect(_auth, googleProvider());
}
/** Handle redirect result after Google redirect sign-in. */
export async function handleGoogleRedirectResult() {
  await ensureFirebase();
  try { return await getRedirectResult(_auth); } catch (e) { return null; }
}

/* ---- Phone OTP login ---- */

let _recaptchaVerifier = null;

function clearRecaptcha() {
  if (_recaptchaVerifier) {
    try { _recaptchaVerifier.clear(); } catch (e) { /* noop */ }
    _recaptchaVerifier = null;
  }
}

/**
 * normalizePhoneNumber(p) -> E.164 string or null.
 * Indian 10-digit numbers get +91. Anything else must already be
 * international format (leading +) with 10–15 digits.
 */
export function normalizePhoneNumber(p) {
  const raw = String(p || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (/^91\d{10}$/.test(digits)) return '+' + digits;
  if (/^\d{10}$/.test(digits)) return '+91' + digits;
  if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) return '+' + digits;
  return null;
}

/**
 * sendPhoneOtp(e164Phone, containerId) -> Promise<ConfirmationResult>.
 * Renders an invisible reCAPTCHA into the given container and sends the OTP.
 * The container element must exist in the DOM when this is called.
 */
export async function sendPhoneOtp(e164Phone, containerId = 'recaptcha-container') {
  await ensureFirebase();
  clearRecaptcha();
  _recaptchaVerifier = new RecaptchaVerifier(_auth, containerId, { size: 'invisible' });
  return signInWithPhoneNumber(_auth, e164Phone, _recaptchaVerifier);
}

/** verifyPhoneOtp(confirmationResult, code) -> Promise<UserCredential>. */
export function verifyPhoneOtp(confirmationResult, code) {
  return confirmationResult.confirm(String(code || '').trim());
}

/** Clear the reCAPTCHA verifier (call on unmount / flow reset). */
export function clearPhoneRecaptcha() {
  clearRecaptcha();
}
export function watchAuth(cb) {
  ensureFirebase().then(() => onAuthStateChanged(_auth, cb));
  return () => {};
}

/* ---- Firestore re-exports (single import surface) ---- */
export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp,
  increment, arrayUnion, arrayRemove,
};

/* ---- Small data helpers ---- */
export async function getDocData(path, id) {
  const d = await ensureFirebase();
  const snap = await getDoc(doc(d.db, path, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
