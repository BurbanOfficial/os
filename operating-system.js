/**
 * AGORA — operating-system.js
 * SPA intranet d'entreprise — Firebase Auth + Firestore
 * @module operating-system
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─────────────────────────────────────────────
// CONFIG FIREBASE
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAeQmIo2EEQNSvuBt54obS-qrRxn35WaT8",
  authDomain: "operating-system-ea358.firebaseapp.com",
  projectId: "operating-system-ea358",
  storageBucket: "operating-system-ea358.firebasestorage.app",
  messagingSenderId: "896027329219",
  appId: "1:896027329219:web:59d7ef893c8ee61c10d876",
  measurementId: "G-8KRMJJF1C8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─────────────────────────────────────────────
// UID de l'utilisateur courant (rempli après login)
// ─────────────────────────────────────────────
let currentUid = null;


/* ═══════════════════════════════════════════════════════════
   MODULE AUTH
═══════════════════════════════════════════════════════════ */

/**
 * Traduit un code d'erreur Firebase Auth en message français.
 * @param {string} code - Code d'erreur Firebase (ex: "auth/invalid-email")
 * @returns {string} Message lisible en français
 */
export function handleAuthError(code) {
  const map = {
    'auth/invalid-email':       'Adresse email invalide.',
    'auth/user-not-found':      'Aucun compte associé à cet email.',
    'auth/invalid-credential':  'Aucun compte associé à cet email.',
    'auth/wrong-password':      'Mot de passe incorrect.',
    'auth/too-many-requests':   'Trop de tentatives. Réessayez plus tard.',
    'auth/missing-password':    'Le mot de passe est requis.',
  };
  return map[code] ?? 'Une erreur est survenue. Veuillez réessayer.';
}

/**
 * Affiche un message d'erreur dans le conteneur donné.
 * @param {HTMLElement} container - Élément DOM cible
 * @param {string} message - Message à afficher
 */
export function showError(container, message) {
  if (!container) return;
  let el = container.querySelector('.error-message');
  if (!el) {
    el = document.createElement('div');
    el.className = 'error-message';
    container.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
}

/**
 * Masque le message d'erreur dans le conteneur donné.
 * @param {HTMLElement} container - Élément DOM cible
 */
export function hideError(container) {
  if (!container) return;
  const el = container.querySelector('.error-message');
  if (el) el.style.display = 'none';
}

/**
 * Initialise le formulaire de login (attache les écouteurs).
 */
function initAuth() {
  const form        = document.getElementById('login-form');
  const loginError  = document.getElementById('login-error');
  const loginBtn    = document.getElementById('login-btn');
  const btnText     = document.getElementById('login-btn-text');
  const btnSpinner  = document.getElementById('login-btn-spinner');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Récupération des valeurs
    const email    = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;

    // Masquer l'erreur précédente
    if (loginError) loginError.style.display = 'none';

    // Validation côté client
    if (!email) {
      loginError.textContent   = 'Adresse email invalide.';
      loginError.style.display = 'block';
      return;
    }
    if (!password) {
      loginError.textContent   = 'Le mot de passe est requis.';
      loginError.style.display = 'block';
      return;
    }

    // État de chargement du bouton
    loginBtn.disabled        = true;
    btnText.textContent      = 'Connexion…';
    btnSpinner.style.display = 'inline-block';

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Succès : onAuthStateChanged prend le relais — on ne réactive PAS le bouton
      // pour éviter que le formulaire réapparaisse pendant la transition
    } catch (err) {
      const message = handleAuthError(err.code);
      if (loginError) {
        loginError.textContent   = message;
        loginError.style.display = 'block';
      }
      // Échec uniquement : réactiver le bouton
      loginBtn.disabled        = false;
      btnText.textContent      = 'Se connecter';
      btnSpinner.style.display = 'none';
    }
  });
}

// ─── Surveillance de l'état d'authentification ───
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    showLoadingScreen();
    await loadInitialData(user.uid);
    hideLoadingScreen();
  } else {
    // Non connecté : afficher login, masquer app
    currentUid = null;
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    if (loginScreen)  loginScreen.style.display  = 'flex';
    if (appContainer) appContainer.style.display = 'none';
  }
});


/* ═══════════════════════════════════════════════════════════
   ÉCRAN DE CHARGEMENT
═══════════════════════════════════════════════════════════ */

/**
 * Affiche l'écran de chargement et masque l'écran de login.
 */
export function showLoadingScreen() {
  const loginScreen   = document.getElementById('login-screen');
  const loadingScreen = document.getElementById('loading-screen');

  if (loginScreen)  loginScreen.style.display  = 'none';
  if (loadingScreen) {
    loadingScreen.style.display = 'flex';
    loadingScreen.style.opacity = '1';
  }
}

/**
 * Cache l'écran de chargement avec un fondu (300ms) et révèle l'app.
 */
export function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  const appContainer  = document.getElementById('app-container');

  if (!loadingScreen) return;

  loadingScreen.style.transition = 'opacity 300ms ease';
  loadingScreen.style.opacity    = '0';

  setTimeout(() => {
    loadingScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
  }, 300);
}


/* ═══════════════════════════════════════════════════════════
   STRUCTURE SPA — INIT & CHARGEMENT DONNÉES
═══════════════════════════════════════════════════════════ */

/**
 * Charge le profil Firestore de l'utilisateur et initialise l'app.
 * @param {string} uid
 */
async function loadInitialData(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const profile = snap.data();

      // Mise à jour du DOM de la sidebar
      const nameEl   = document.getElementById('user-name');
      const avatarEl = document.getElementById('user-avatar-img');

      if (nameEl && profile.displayName) {
        nameEl.textContent = profile.displayName;
      }
      if (avatarEl && profile.photoURL) {
        avatarEl.src = profile.photoURL;
      }

      // Statut de présence initial (depuis users ou presence collection)
      const presenceSnap = await getDoc(doc(db, 'presence', uid));
      if (presenceSnap.exists()) {
        const { status } = presenceSnap.data();
        _applyPresenceUI(status);
      }
    }
  } catch (err) {
    console.warn('loadInitialData: impossible de charger le profil', err);
  }

  // Initialiser les composants de l'app shell
  initSidebar();
  initNavigation();
  initPresenceMenu();
  initGlobalSearch();

  // Charger la page d'accueil
  await renderPageContent('dashboard');
}

/**
 * Injecte le contenu d'une page dans .main-content avec transition opacity.
 * @param {string} pageName - Identifiant de la section
 */
export async function renderPageContent(pageName) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Fade out
  mainContent.style.opacity = '0';

  await new Promise(resolve => setTimeout(resolve, 150));

  // Mettre à jour l'item actif dans la nav
  document.querySelectorAll('.menu-item[data-target]').forEach(item => {
    item.classList.toggle('active', item.dataset.target === pageName);
  });

  // Injection du contenu selon la page
  switch (pageName) {
    case 'dashboard':
      mainContent.innerHTML = getDashboardHTML();
      await loadDashboardData(currentUid);
      scheduleMidnightRefresh();
      initGlobalSearch(); // Réattacher la recherche après injection
      break;

    default: {
      const labels = {
        clients:     'Clients',
        projets:     'Projets',
        messagerie:  'Messagerie',
        planning:    'Planning',
        documents:   'Documents',
        parametres:  'Paramètres',
      };
      const label = labels[pageName] ?? pageName;
      mainContent.innerHTML = `
        <section class="welcome-section">
          <div class="welcome-text">
            <h1>${label}</h1>
            <p>Section ${label} — en construction</p>
          </div>
        </section>
        <div class="card" style="margin-top:20px; text-align:center; padding:60px 24px; color:var(--text-secondary);">
          <i class="fa-solid fa-hammer" style="font-size:40px; margin-bottom:16px; display:block; opacity:0.4;"></i>
          <p>Ce module sera disponible prochainement.</p>
        </div>
      `;
    }
  }

  // Fade in
  mainContent.style.opacity = '1';
}


/* ═══════════════════════════════════════════════════════════
   SIDEBAR GAUCHE
═══════════════════════════════════════════════════════════ */

/**
 * Initialise le bouton toggle de la sidebar.
 */
function initSidebar() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
  }
}

/**
 * Déploie / rétracte la sidebar.
 */
export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
}

/**
 * Attache les clics de navigation sur chaque .menu-item[data-target].
 */
function initNavigation() {
  document.querySelectorAll('.menu-item[data-target]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.dataset.target;
      if (target) renderPageContent(target);
    });
  });
}

/**
 * Initialise le menu de présence (clic sur le profil utilisateur).
 */
function initPresenceMenu() {
  const trigger = document.getElementById('user-profile-trigger');
  const menu    = document.getElementById('presence-menu');

  if (!trigger || !menu) return;

  // Toggle au clic sur le bloc profil
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  // Boutons de statut
  menu.querySelectorAll('.presence-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const status = btn.dataset.status;
      menu.classList.remove('open');
      await updatePresenceStatus(status);
    });
  });

  // Fermer si clic en dehors
  document.addEventListener('click', () => {
    menu.classList.remove('open');
  });
}

/**
 * Met à jour le statut de présence en Firestore et dans le DOM.
 * @param {string} status - 'disponible' | 'en_pause' | 'indisponible'
 */
export async function updatePresenceStatus(status) {
  if (!currentUid) return;

  // Mise à jour immédiate de l'UI
  _applyPresenceUI(status);

  // Persistance Firestore
  try {
    await updateDoc(doc(db, 'presence', currentUid), {
      status,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('updatePresenceStatus: erreur Firestore', err);
  }
}

/**
 * Met à jour le point de couleur et le texte de statut dans la sidebar.
 * @param {string} status
 */
function _applyPresenceUI(status) {
  const dot      = document.getElementById('status-dot');
  const statusEl = document.getElementById('user-status-text');

  if (dot)      dot.style.background = getStatusColor(status);
  if (statusEl) statusEl.textContent = getStatusLabel(status);
}

/**
 * Retourne la couleur hex associée à un statut de présence.
 * @param {string} status
 * @returns {string} Couleur hex
 */
export function getStatusColor(status) {
  const colors = {
    disponible:   '#22c55e',
    en_pause:     '#f59e0b',
    indisponible: '#ef4444',
  };
  return colors[status] ?? '#22c55e';
}

/**
 * Retourne le libellé français d'un statut de présence.
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
  const labels = {
    disponible:   'Disponible',
    en_pause:     'En pause',
    indisponible: 'Indisponible',
  };
  return labels[status] ?? 'Disponible';
}


/* ═══════════════════════════════════════════════════════════
   DASHBOARD — HTML TEMPLATE
═══════════════════════════════════════════════════════════ */

function getDashboardHTML() {
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = today.toLocaleDateString('fr-FR', options);
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return `
    <header class="header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="global-search-input" placeholder="Rechercher un client, projet, tâche…">
        </div>
        <div class="search-dropdown" id="search-dropdown"></div>
      </div>
      <div class="header-actions">
        <i class="fa-regular fa-bell notification-icon"></i>
        <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=35"
             alt="User" class="avatar" id="header-avatar">
      </div>
    </header>

    <section class="welcome-section">
      <div class="welcome-text">
        <h1 id="welcome-heading">Bonjour !</h1>
        <p>Voici ce qui se passe aujourd'hui.</p>
      </div>
      <div class="date-picker">
        <span id="current-date">${dateCap}</span>
        <i class="fa-regular fa-calendar"></i>
      </div>
    </section>

    <div class="dashboard-grid" id="dashboard-grid">

      <!-- KPI : Chiffre d'affaires -->
      <div class="card stat-card" id="kpi-revenue">
        <div class="card-header">
          <h3>Chiffre d'affaires du mois</h3>
          <i class="fa-solid fa-arrow-trend-up" style="color:var(--accent-color);"></i>
        </div>
        <div class="stat-value" id="kpi-revenue-value">—</div>
        <div class="stat-change" id="kpi-revenue-change">—</div>
      </div>

      <!-- KPI : Projets en cours -->
      <div class="card projects-chart-card" id="kpi-projects">
        <h3>Projets en cours</h3>
        <div class="chart-container" style="display:flex; align-items:center; justify-content:space-between; gap:24px;">
          <div class="chart-stats" id="projects-stats">
            <p><span class="dot" style="background:#22c55e; width:8px; height:8px; border-radius:50%; display:inline-block;"></span> En avance <strong id="proj-en-avance">—</strong></p>
            <p style="margin-top:8px;"><span class="dot" style="background:#f97316; width:8px; height:8px; border-radius:50%; display:inline-block;"></span> À temps <strong id="proj-a-temps">—</strong></p>
            <p style="margin-top:8px;"><span class="dot" style="background:#ef4444; width:8px; height:8px; border-radius:50%; display:inline-block;"></span> En retard <strong id="proj-en-retard">—</strong></p>
          </div>
          <div class="progress-circle-placeholder" style="text-align:center;">
            <span class="percentage" id="proj-total" style="font-size:28px; font-weight:700;">—</span>
            <span class="subtext" style="display:block; font-size:12px; color:var(--text-secondary);">projets actifs</span>
          </div>
        </div>
      </div>

      <!-- Tâches urgentes -->
      <div class="card" id="card-urgent-tasks">
        <div class="card-header">
          <h3>Tâches urgentes</h3>
          <a href="#" class="see-all" data-target="projets">Voir tout</a>
        </div>
        <ul class="task-list" id="urgent-tasks-list">
          <li style="color:var(--text-secondary); font-size:14px;">Chargement…</li>
        </ul>
      </div>

      <!-- Activité récente (2 colonnes) -->
      <div class="card grid-col-2" id="card-activity">
        <h3>Activité récente</h3>
        <ul class="activity-log">
          <li>
            <i class="fa-solid fa-file-arrow-up" style="color:#22c55e;"></i>
            <p>Lucas a ajouté un fichier dans le projet <strong>Nike</strong></p>
            <span class="time">il y a 10 min</span>
          </li>
          <li>
            <i class="fa-solid fa-comment" style="color:#f97316;"></i>
            <p>Camille a commenté la tâche <strong>"Créer la bannière hero"</strong></p>
            <span class="time">il y a 1 h</span>
          </li>
        </ul>
      </div>

      <!-- Rendez-vous du jour -->
      <div class="card" id="card-today-rdv">
        <div class="card-header">
          <h3>Rendez-vous du jour</h3>
          <a href="#" class="see-all" data-target="planning">Planning</a>
        </div>
        <ul class="rdv-list" id="rdv-list">
          <li style="color:var(--text-secondary); font-size:14px;">Chargement…</li>
        </ul>
      </div>

    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
   DASHBOARD — DONNÉES FIRESTORE
═══════════════════════════════════════════════════════════ */

/**
 * Charge toutes les données du dashboard depuis Firestore.
 * @param {string} uid
 */
export async function loadDashboardData(uid) {
  if (!uid) return;

  // Mise à jour du titre de bienvenue avec le nom de l'utilisateur
  const nameEl   = document.getElementById('user-name');
  const headingEl = document.getElementById('welcome-heading');
  if (headingEl && nameEl && nameEl.textContent !== '—') {
    const firstName = nameEl.textContent.split(' ')[0];
    headingEl.textContent = `Bonjour, ${firstName} !`;
  }

  // Avatar header
  const avatarImg   = document.getElementById('user-avatar-img');
  const headerAvatar = document.getElementById('header-avatar');
  if (avatarImg && headerAvatar) {
    headerAvatar.src = avatarImg.src;
    headerAvatar.alt = avatarImg.alt;
  }

  // Charger en parallèle
  const [metrics, projects, tasks, appointments] = await Promise.allSettled([
    _loadMetrics(uid),
    _loadProjects(uid),
    _loadTasks(uid),
    _loadAppointments(uid),
  ]);

  // KPI — Chiffre d'affaires
  if (metrics.status === 'fulfilled' && metrics.value) {
    const { revenue, revenuePrev } = metrics.value;
    const revenueEl = document.getElementById('kpi-revenue-value');
    const changeEl  = document.getElementById('kpi-revenue-change');
    if (revenueEl) revenueEl.textContent = formatRevenue(revenue);
    if (changeEl) {
      const { percentage, colorClass } = computeVariation(revenue, revenuePrev);
      const sign = percentage >= 0 ? '+' : '';
      changeEl.textContent  = `${sign}${percentage}% vs mois dernier`;
      changeEl.className    = `stat-change ${colorClass}`;
    }
  }

  // Projets
  if (projects.status === 'fulfilled' && projects.value) {
    const projectsList = projects.value;
    const counts = countByStatus(projectsList);
    const totalEl   = document.getElementById('proj-total');
    const avanceEl  = document.getElementById('proj-en-avance');
    const tempsEl   = document.getElementById('proj-a-temps');
    const retardEl  = document.getElementById('proj-en-retard');
    if (totalEl)  totalEl.textContent  = projectsList.length;
    if (avanceEl) avanceEl.textContent = counts.en_avance;
    if (tempsEl)  tempsEl.textContent  = counts.a_temps;
    if (retardEl) retardEl.textContent = counts.en_retard;
  }

  // Tâches urgentes
  if (tasks.status === 'fulfilled' && tasks.value) {
    _renderUrgentTasks(tasks.value);
  }

  // RDV du jour
  if (appointments.status === 'fulfilled' && appointments.value) {
    _renderTodayAppointments(appointments.value);
  }
}

async function _loadMetrics(uid) {
  try {
    const now    = new Date();
    const key    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const snap   = await getDoc(doc(db, 'metrics', uid, 'monthly', key));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function _loadProjects(uid) {
  try {
    const q    = query(collection(db, 'projects'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

async function _loadTasks(uid) {
  try {
    const q = query(
      collection(db, 'tasks'),
      where('assignee', '==', uid),
      where('urgent', '==', true),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

async function _loadAppointments(uid) {
  try {
    const q = query(
      collection(db, 'appointments'),
      where('attendees', 'array-contains', uid),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

/**
 * @param {Array} tasks - Tableau de tâches urgentes
 */
function _renderUrgentTasks(tasks) {
  const list = document.getElementById('urgent-tasks-list');
  if (!list) return;

  const sorted = sortByUrgency(tasks);

  if (sorted.length === 0) {
    list.innerHTML = '<li style="color:var(--text-secondary); font-size:14px;">Aucune tâche urgente pour le moment.</li>';
    return;
  }

  list.innerHTML = sorted.map(task => {
    const level = task.urgencyLevel ?? 1;
    const dotColor = level >= 3 ? '#ef4444' : level === 2 ? '#f97316' : '#f59e0b';
    return `
      <li>
        <span class="dot" style="background:${dotColor}; width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0;"></span>
        <div class="task-info">
          <strong>${escapeHtml(task.title ?? 'Tâche sans titre')}</strong>
          <span class="text-muted" style="font-size:12px; color:var(--text-secondary);">${escapeHtml(task.projectId ?? '')}</span>
        </div>
        <span class="tag-today">Urgent</span>
      </li>
    `;
  }).join('');
}

/**
 * @param {Array} appointments
 */
function _renderTodayAppointments(appointments) {
  const list = document.getElementById('rdv-list');
  if (!list) return;

  const today  = filterTodayAppointments(appointments, new Date());

  if (today.length === 0) {
    list.innerHTML = '<li style="color:var(--text-secondary); font-size:14px;">Aucun rendez-vous aujourd\'hui.</li>';
    return;
  }

  list.innerHTML = today.map(rdv => {
    const date = rdv.date?.toDate ? rdv.date.toDate() : new Date(rdv.date);
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `
      <li class="rdv-item">
        <span class="rdv-time">${timeStr}</span>
        <div class="rdv-info">
          <strong>${escapeHtml(rdv.title ?? 'RDV')}</strong>
          ${rdv.location ? `<span class="rdv-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(rdv.location)}</span>` : ''}
        </div>
      </li>
    `;
  }).join('');
}


/* ═══════════════════════════════════════════════════════════
   FONCTIONS UTILITAIRES DASHBOARD (exportées pour tests PBT)
═══════════════════════════════════════════════════════════ */

/**
 * Formate un montant en centimes en chaîne €.
 * @param {number} amountInCents
 * @returns {string}
 */
export function formatRevenue(amountInCents) {
  const euros = amountInCents / 100;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(euros);
}

/**
 * Calcule la variation en % entre le CA actuel et le précédent.
 * @param {number} current - CA actuel (en centimes)
 * @param {number} prev    - CA précédent (en centimes)
 * @returns {{ percentage: number, colorClass: string }}
 */
export function computeVariation(current, prev) {
  if (!prev || prev === 0) {
    return { percentage: 0, colorClass: 'neutral' };
  }
  const percentage = Math.round(((current - prev) / prev) * 100);
  let colorClass;
  if (percentage > 0)      colorClass = 'positive';
  else if (percentage < 0) colorClass = 'negative';
  else                     colorClass = 'neutral';
  return { percentage, colorClass };
}

/**
 * Compte les projets par statut.
 * @param {Array<{status:string}>} projects
 * @returns {{ en_avance: number, a_temps: number, en_retard: number }}
 */
export function countByStatus(projects) {
  return projects.reduce((acc, p) => {
    const s = p.status;
    if (s === 'en_avance')  acc.en_avance++;
    else if (s === 'a_temps')   acc.a_temps++;
    else if (s === 'en_retard') acc.en_retard++;
    return acc;
  }, { en_avance: 0, a_temps: 0, en_retard: 0 });
}

/**
 * Trie les tâches par niveau d'urgence décroissant.
 * @param {Array<{urgencyLevel: number}>} tasks
 * @returns {Array}
 */
export function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => (b.urgencyLevel ?? 0) - (a.urgencyLevel ?? 0));
}

/**
 * Filtre les rendez-vous dont la date correspond à la date de référence.
 * @param {Array} appointments
 * @param {Date}  date - Date de référence
 * @returns {Array}
 */
export function filterTodayAppointments(appointments, date) {
  const ref = date.toDateString();
  return appointments.filter(rdv => {
    const d = rdv.date?.toDate ? rdv.date.toDate() : new Date(rdv.date);
    return d.toDateString() === ref;
  });
}

/**
 * Planifie un rechargement automatique du dashboard à minuit.
 */
export function scheduleMidnightRefresh() {
  const now       = new Date();
  const midnight  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const msUntil   = midnight.getTime() - now.getTime();

  setTimeout(() => {
    if (currentUid) {
      loadDashboardData(currentUid);
    }
    scheduleMidnightRefresh(); // Re-planifier pour le lendemain
  }, msUntil);
}


/* ═══════════════════════════════════════════════════════════
   RECHERCHE GLOBALE
═══════════════════════════════════════════════════════════ */

/**
 * Crée une fonction debounce.
 * @param {Function} fn
 * @param {number}   delay - Délai en ms
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Détermine si les suggestions doivent s'afficher.
 * @param {string} query
 * @returns {boolean}
 */
export function shouldShowSuggestions(query) {
  return typeof query === 'string' && query.trim().length >= 2;
}

/**
 * Initialise la barre de recherche globale.
 */
function initGlobalSearch() {
  const input    = document.getElementById('global-search-input');
  const dropdown = document.getElementById('search-dropdown');
  if (!input || !dropdown) return;

  const onInput = debounce(async (e) => {
    const q = e.target.value;

    if (!shouldShowSuggestions(q)) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      return;
    }

    const token = q.trim().toLowerCase();
    const [clients, projects, tasks] = await Promise.allSettled([
      searchClients(token),
      searchProjects(token),
      searchTasks(token),
    ]);

    const results = {
      Clients:  clients.status  === 'fulfilled' ? clients.value  : [],
      Projets:  projects.status === 'fulfilled' ? projects.value : [],
      Tâches:   tasks.status    === 'fulfilled' ? tasks.value    : [],
    };

    renderSuggestions(results, dropdown);
  }, 300);

  input.addEventListener('input', onInput);

  // Fermer le dropdown si clic en dehors
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      dropdown.classList.remove('open');
    }
  });
}

/**
 * @param {string} token - Query en minuscules
 * @returns {Promise<Array>}
 */
export async function searchClients(token) {
  const q    = query(collection(db, 'clients'), where('searchTokens', 'array-contains', token), limit(5));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data(), _type: 'client' }));
}

/**
 * @param {string} token
 * @returns {Promise<Array>}
 */
export async function searchProjects(token) {
  const q    = query(collection(db, 'projects'), where('searchTokens', 'array-contains', token), limit(5));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data(), _type: 'project' }));
}

/**
 * @param {string} token
 * @returns {Promise<Array>}
 */
export async function searchTasks(token) {
  const q    = query(collection(db, 'tasks'), where('searchTokens', 'array-contains', token), limit(5));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data(), _type: 'task' }));
}

/**
 * Rend les suggestions dans le dropdown.
 * @param {{ [category: string]: Array }} results
 * @param {HTMLElement} container
 */
export function renderSuggestions(results, container) {
  if (!container) return;

  const totalItems = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  if (totalItems === 0) {
    container.innerHTML = '<div class="search-no-result">Aucun résultat pour votre recherche.</div>';
    container.classList.add('open');
    return;
  }

  let html = '';
  for (const [category, items] of Object.entries(results)) {
    if (items.length === 0) continue;
    html += `<div class="search-category-label">${category}</div>`;
    html += items.map(item => {
      const name = item.name ?? item.title ?? item.email ?? 'Sans titre';
      const icon = item._type === 'client' ? 'fa-users'
                 : item._type === 'project' ? 'fa-folder'
                 : 'fa-check-square';
      const section = item._type === 'client'  ? 'clients'
                    : item._type === 'project' ? 'projets'
                    : 'projets';
      return `
        <div class="search-result-item" data-section="${section}">
          <i class="fa-solid ${icon}" style="color:var(--accent-color); width:16px;"></i>
          ${escapeHtml(name)}
        </div>
      `;
    }).join('');
  }

  container.innerHTML = html;
  container.classList.add('open');

  // Attacher les clics
  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      container.classList.remove('open');
      renderPageContent(section);
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   UTILITAIRE
═══════════════════════════════════════════════════════════ */

/**
 * Échappe les caractères HTML dangereux.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* ═══════════════════════════════════════════════════════════
   DÉMARRAGE
═══════════════════════════════════════════════════════════ */
initAuth();
