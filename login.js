/**
 * AGORA — login.js
 * Gère uniquement la page de connexion (operating-system.html).
 * Après authentification réussie, redirige vers dashboard.html.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyAeQmIo2EEQNSvuBt54obS-qrRxn35WaT8",
  authDomain: "operating-system-ea358.firebaseapp.com",
  projectId: "operating-system-ea358",
  storageBucket: "operating-system-ea358.firebasestorage.app",
  messagingSenderId: "896027329219",
  appId: "1:896027329219:web:59d7ef893c8ee61c10d876",
  measurementId: "G-8KRMJJF1C8"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ── Si déjà connecté, rediriger directement ──────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.replace('dashboard.html');
  }
});

// ── Mapping erreurs Firebase → messages FR ───────────────────────────────────
function handleAuthError(code) {
  const map = {
    'auth/invalid-email':      'Adresse email invalide.',
    'auth/user-not-found':     'Aucun compte associé à cet email.',
    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
    'auth/wrong-password':     'Mot de passe incorrect.',
    'auth/too-many-requests':  'Trop de tentatives. Réessayez plus tard.',
    'auth/missing-password':   'Le mot de passe est requis.',
    'auth/user-disabled':      'Ce compte a été désactivé.',
  };
  return map[code] ?? 'Une erreur est survenue. Veuillez réessayer.';
}

// ── Formulaire de connexion ───────────────────────────────────────────────────
const form      = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn   = document.getElementById('login-btn');
const btnText    = document.getElementById('login-btn-text');
const btnSpinner = document.getElementById('login-btn-spinner');

function showError(msg) {
  loginError.textContent   = msg;
  loginError.style.display = 'block';
}

function hideError() {
  loginError.style.display = 'none';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email    = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;

  // Validation côté client
  if (!email) {
    showError('Adresse email invalide.');
    return;
  }
  if (!password) {
    showError('Le mot de passe est requis.');
    return;
  }

  // État chargement
  loginBtn.disabled        = true;
  btnText.textContent      = 'Connexion…';
  btnSpinner.style.display = 'inline-block';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // Connexion réussie : redirection immédiate sans attendre onAuthStateChanged
    window.location.href = 'dashboard.html';
  } catch (err) {
    showError(handleAuthError(err.code));
    // Réactiver le bouton uniquement en cas d'erreur
    loginBtn.disabled        = false;
    btnText.textContent      = 'Se connecter';
    btnSpinner.style.display = 'none';
  }
});
