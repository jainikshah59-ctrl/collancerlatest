/* Firebase integration — project collancer-8fd62.
   Single source of truth for auth + firestore access.
   Uses the firebase npm SDK (v10 API) with the project's public web config. */
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
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

/** Initialize Firebase once.
 * IMPORTANT: Firebase initialization must not wait for auth persistence/network.
 * Auth state is delivered separately through watchAuth(). */
export function ensureFirebase() {
  if (_ready) return _ready;
  _ready = Promise.resolve().then(() => {
    try {
      _app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
      _auth = getAuth(_app);
      _db = getFirestore(_app);
      return { auth: _auth, db: _db };
    } catch (e) {
      console.warn('[firebase] init failed', e);
      _ready = null;
      throw e;
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
export function watchAuth(cb) {
  let unsub = () => {};
  let cancelled = false;
  ensureFirebase()
    .then(() => {
      if (cancelled) return;
      if (!_auth) {
        cb(null);
        return;
      }
      unsub = onAuthStateChanged(_auth, cb);
    })
    .catch(() => {
      if (!cancelled) cb(null);
    });
  return () => {
    cancelled = true;
    try { unsub(); } catch { /* noop */ }
  };
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
