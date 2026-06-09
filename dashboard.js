/**
 * AGORA — dashboard.js
 * Script de la page dashboard.html.
 * Vérifie la session Firebase, charge les données et initialise l'app shell.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ── Config Firebase ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAeQmIo2EEQNSvuBt54obS-qrRxn35WaT8",
  authDomain: "operating-system-ea358.firebaseapp.com",
  projectId: "operating-system-ea358",
  storageBucket: "operating-system-ea358.firebasestorage.app",
  messagingSenderId: "896027329219",
  appId: "1:896027329219:web:59d7ef893c8ee61c10d876",
  measurementId: "G-8KRMJJF1C8"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

let currentUid  = null;
let currentRole = 'employee'; // 'admin' | 'employee'

// Sections de l'app et leurs permissions
const SECTIONS = [
  { key: 'dashboard',   label: 'Dashboard',   icon: 'fa-chart-pie' },
  { key: 'finances',    label: 'Finances',     icon: 'fa-coins' },
  { key: 'clients',     label: 'Clients',      icon: 'fa-users' },
  { key: 'projets',     label: 'Projets',      icon: 'fa-folder-open' },
  { key: 'messagerie',  label: 'Messagerie',   icon: 'fa-comment-dots' },
  { key: 'planning',    label: 'Planning',     icon: 'fa-calendar-days' },
  { key: 'documents',   label: 'Documents',    icon: 'fa-file-lines' },
  { key: 'parametres',  label: 'Paramètres',   icon: 'fa-gear' },
];

const PERMISSIONS = [
  { key: 'view',   label: 'Lecture',      desc: 'Voir le contenu de la section' },
  { key: 'edit',   label: 'Modification', desc: 'Créer et modifier des éléments' },
  { key: 'delete', label: 'Suppression',  desc: 'Supprimer des éléments' },
  { key: 'export', label: 'Export',       desc: 'Exporter des données' },
];

// ── Vérification de session au chargement ─────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Pas de session → retour au login
    window.location.replace('operating-system.html');
    return;
  }
  currentUid = user.uid;
  await loadInitialData(user.uid);
  hideLoadingScreen();
});


/* ═══════════════════════════════════════════════════════════
   ÉCRAN DE CHARGEMENT
═══════════════════════════════════════════════════════════ */

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  const appContainer  = document.getElementById('app-container');

  loadingScreen.style.transition = 'opacity 300ms ease';
  loadingScreen.style.opacity    = '0';

  setTimeout(() => {
    loadingScreen.style.display = 'none';
    appContainer.style.display  = 'flex';
  }, 300);
}


/* ═══════════════════════════════════════════════════════════
   INIT DONNÉES & APP SHELL
═══════════════════════════════════════════════════════════ */

async function loadInitialData(uid) {
  try {
    // Charger en parallèle : profil, présence, et données critiques
    const [userSnap, presenceSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'presence', uid))
    ]);

    // Profil utilisateur
    if (userSnap.exists()) {
      const profile = userSnap.data();
      const nameEl   = document.getElementById('user-name');
      const avatarEl = document.getElementById('user-avatar-img');

      if (nameEl && profile.displayName) {
        nameEl.textContent = profile.displayName;
        const initials = profile.displayName.split(' ').map(n => n[0]).join('').toUpperCase();
        if (avatarEl) {
          avatarEl.src = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=4f46e5&color=fff&size=40`;
        }
      }

      // Stocker le rôle et afficher le menu admin si nécessaire
      currentRole = profile.role ?? 'employee';
      if (currentRole === 'admin') {
        injectAdminNavItem();
      }
    }

    // Statut de présence
    if (presenceSnap.exists()) {
      applyPresenceUI(presenceSnap.data().status);
    }
  } catch (err) {
    console.warn('loadInitialData:', err);
  }

  // Initialiser les composants
  initSidebar();
  initNavigation();
  initPresenceMenu();

  // Précharger les données critiques en arrière-plan
  preloadCriticalData(uid).catch(() => {});

  // Charger le dashboard immédiatement (les données seront mises à jour)
  await renderPageContent('dashboard');
}

function injectAdminNavItem() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  // Ajouter Finances dans la section Principal (avant la section Outils)
  if (!nav.querySelector('[data-target="finances"]')) {
    const toolsLabel = Array.from(nav.querySelectorAll('.nav-section-label')).find(el => el.textContent === 'Outils');
    const financesItem = document.createElement('a');
    financesItem.href = '#';
    financesItem.className = 'menu-item admin-only';
    financesItem.dataset.target = 'finances';
    financesItem.innerHTML = `
      <i class="fa-solid fa-coins"></i>
      <span class="nav-label">Finances</span>
    `;
    if (toolsLabel) {
      nav.insertBefore(financesItem, toolsLabel);
    } else {
      nav.appendChild(financesItem);
    }
  }

  // Ajouter un séparateur "Administration" s'il n'existe pas
  if (!nav.querySelector('[data-target="utilisateurs"]')) {
    const adminSection = document.createElement('span');
    adminSection.className = 'nav-section-label';
    adminSection.textContent = 'Administration';

    const adminItem = document.createElement('a');
    adminItem.href = '#';
    adminItem.className = 'menu-item admin-only';
    adminItem.dataset.target = 'utilisateurs';
    adminItem.innerHTML = `
      <i class="fa-solid fa-shield-halved"></i>
      <span class="nav-label">Utilisateurs</span>
    `;

    nav.appendChild(adminSection);
    nav.appendChild(adminItem);
  }
}


/* ═══════════════════════════════════════════════════════════
   NAVIGATION SPA
═══════════════════════════════════════════════════════════ */

// Cache pour les données chargées
const dataCache = {
  projects: null,
  clients: null,
  users: null,
  tasks: null,
  appointments: null,
  lastFetch: {}
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Préchargement des données critiques au démarrage
async function preloadCriticalData(uid) {
  if (!uid) return;

  // Charger en parallèle les données dont on a besoin rapidement
  const promises = [
    loadUserProfile(uid),
    loadProjectsData().catch(() => {}),
    loadClientsData().catch(() => {}),
  ];

  await Promise.allSettled(promises);
}

// Réinitialiser le cache quand on crée/modifie des données
function invalidateCache(type) {
  dataCache[type] = null;
  dataCache.lastFetch[type] = null;
}

// Fonction utilitaire pour charger avec cache
async function loadWithCache(cacheKey, fetchFn, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && dataCache[cacheKey] && dataCache.lastFetch[cacheKey] && 
      (now - dataCache.lastFetch[cacheKey]) < CACHE_DURATION) {
    return dataCache[cacheKey];
  }

  const data = await fetchFn();
  dataCache[cacheKey] = data;
  dataCache.lastFetch[cacheKey] = now;
  return data;
}

function showLoading() {
  let loader = document.getElementById('global-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = `
      <div class="loader-overlay">
        <div class="loader-spinner"></div>
        <p class="loader-text">Chargement...</p>
      </div>
    `;
    document.body.appendChild(loader);
  }
  loader.style.display = 'flex';
}

function hideLoading() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.style.display = 'none';
}

async function renderPageContent(pageName) {
  const main = document.getElementById('main-content');
  if (!main) return;

  // Afficher le loader immédiatement
  showLoading();

  // Fade out rapide
  main.style.opacity = '0';
  await new Promise(r => setTimeout(r, 80));

  // Marquer l'item actif
  document.querySelectorAll('.menu-item[data-target]').forEach(item => {
    item.classList.toggle('active', item.dataset.target === pageName);
  });

  switch (pageName) {
    case 'dashboard':
      main.innerHTML = getDashboardHTML();
      // Dashboard data loading is parallelized
      loadDashboardData(currentUid).then(() => {
        scheduleMidnightRefresh();
        initGlobalSearch();
      });
      break;

    case 'finances':
      if (currentRole !== 'admin') {
        showToast('Accès réservé aux administrateurs', 'error');
        renderPageContent('dashboard');
        return;
      }
      main.innerHTML = getFinancesHTML();
      await loadFinancesData();
      initFinances();
      break;

    case 'projets':
      main.innerHTML = getProjectsHTML();
      // Load projects with cache check
      const now = Date.now();
      if (!dataCache.projects || !dataCache.lastFetch.projects || 
          (now - dataCache.lastFetch.projects) > CACHE_DURATION) {
        await loadProjectsData();
        dataCache.lastFetch.projects = now;
      } else {
        // Use cached data, just render
        renderProjectsContent();
        const subtitle = document.getElementById('projects-subtitle');
        if (subtitle) subtitle.textContent = `${projectsState.projects.length} projet${projectsState.projects.length > 1 ? 's' : ''}`;
      }
      initProjectsTabs();
      break;

    case 'clients':
      main.innerHTML = getClientsHTML();
      // Load clients with cache check
      const nowClients = Date.now();
      if (!dataCache.clients || !dataCache.lastFetch.clients || 
          (nowClients - dataCache.lastFetch.clients) > CACHE_DURATION) {
        await loadClientsData();
        dataCache.lastFetch.clients = nowClients;
      }
      initClientsSection();
      break;

    case 'messagerie':
      main.innerHTML = getMessagerieHTML();
      initMessagerie();
      break;

    case 'utilisateurs':
      if (currentRole !== 'admin') {
        main.innerHTML = `<div class="page-body"><div class="section-placeholder"><i class="fa-solid fa-lock"></i><p>Accès réservé aux administrateurs.</p></div></div>`;
        main.style.opacity = '1';
        hideLoading();
        return;
      }
      main.innerHTML = getUsersAdminHTML();
      // Load users with cache check
      const nowUsers = Date.now();
      if (!dataCache.users || !dataCache.lastFetch.users || 
          (nowUsers - dataCache.lastFetch.users) > CACHE_DURATION) {
        await loadUsersData();
        dataCache.lastFetch.users = nowUsers;
      }
      initUsersAdmin();
      break;

    case 'parametres':
      main.innerHTML = getParametresHTML();
      await loadParametresData(currentUid);
      initParametres();
      break;

    case 'planning':
      main.innerHTML = getPlanningHTML();
      await loadPlanningData(currentUid);
      initPlanning();
      break;

    case 'documents':
      main.innerHTML = getDocumentsHTML();
      await loadDocumentsData(currentUid);
      initDocuments();
      break;

    default: {
      const labels = {
        clients:    'Clients',
        projets:    'Projets',
        messagerie: 'Messagerie',
        planning:   'Planning',
        documents:  'Documents',
        parametres: 'Paramètres',
      };
      const label = labels[pageName] ?? pageName;
      main.innerHTML = `
        <div class="page-header">
          <div class="search-wrapper">
            <div class="search-bar">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" placeholder="Rechercher…">
            </div>
          </div>
          <div class="header-actions">
            <button class="header-btn"><i class="fa-regular fa-bell"></i></button>
            <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32" class="header-avatar" id="header-avatar">
          </div>
        </div>
        <div class="page-body">
          <div class="page-title-row">
            <div>
              <h1 class="page-title">${label}</h1>
              <p class="page-subtitle">Ce module sera disponible prochainement</p>
            </div>
          </div>
          <div class="card col-12">
            <div class="section-placeholder">
              <i class="fa-solid fa-clock"></i>
              <p>Le module <strong>${label}</strong> sera disponible dans une prochaine mise à jour.</p>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Fade in et cacher le loader
  main.style.opacity = '1';
  hideLoading();
}


/* ═══════════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════════ */

function initSidebar() {
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.addEventListener('click', toggleSidebar);
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
}

function initNavigation() {
  document.querySelectorAll('.menu-item[data-target]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.dataset.target;
      if (target) renderPageContent(target);
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   STATUT DE PRÉSENCE
═══════════════════════════════════════════════════════════ */

function initPresenceMenu() {
  const trigger = document.getElementById('user-profile-trigger');
  const menu    = document.getElementById('presence-menu');
  if (!trigger || !menu) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  menu.querySelectorAll('.presence-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      menu.classList.remove('open');
      await updatePresenceStatus(btn.dataset.status);
    });
  });

  document.addEventListener('click', () => menu.classList.remove('open'));
}

async function updatePresenceStatus(status) {
  if (!currentUid) return;
  applyPresenceUI(status);
  try {
    await setDoc(doc(db, 'presence', currentUid), {
      status,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('updatePresenceStatus:', err);
  }
}

function applyPresenceUI(status) {
  const dot      = document.getElementById('status-dot');
  const statusEl = document.getElementById('user-status-text');
  if (dot)      dot.style.background = getStatusColor(status);
  if (statusEl) statusEl.textContent  = getStatusLabel(status);
}

export function getStatusColor(status) {
  return { disponible: '#22c55e', en_pause: '#f59e0b', indisponible: '#ef4444' }[status] ?? '#22c55e';
}

export function getStatusLabel(status) {
  return { disponible: 'Disponible', en_pause: 'En pause', indisponible: 'Indisponible' }[status] ?? 'Disponible';
}


/* ═══════════════════════════════════════════════════════════
   DASHBOARD — TEMPLATE HTML
═══════════════════════════════════════════════════════════ */

function getDashboardHTML() {
  const today   = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return `
    <!-- Header sticky -->
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="global-search-input" placeholder="Rechercher un client, projet, tâche…">
        </div>
        <div class="search-dropdown" id="search-dropdown"></div>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="Notifications">
          <i class="fa-regular fa-bell"></i>
          <span class="notif-dot"></span>
        </button>
        <button class="header-btn" title="Aide">
          <i class="fa-regular fa-circle-question"></i>
        </button>
        <img
          src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32"
          alt="Avatar"
          class="header-avatar"
          id="header-avatar"
        >
      </div>
    </div>

    <!-- Corps -->
    <div class="page-body">

      <div class="page-title-row">
        <div>
          <h1 class="page-title" id="welcome-heading">Bonjour !</h1>
          <p class="page-subtitle">Voici un aperçu de votre activité aujourd'hui.</p>
        </div>
        <span class="page-date">
          <i class="fa-regular fa-calendar"></i>
          ${dateCap}
        </span>
      </div>

      <div class="dashboard-grid">

        <!-- KPI Chiffre d'affaires -->
        <div class="card col-4">
          <div class="card-header">
            <span class="card-title">Chiffre d'affaires</span>
            <i class="fa-solid fa-arrow-trend-up" style="color:var(--accent); font-size:14px;"></i>
          </div>
          <div class="kpi-value" id="kpi-revenue-value">—</div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <span class="kpi-badge neutral" id="kpi-revenue-badge">— %</span>
            <span class="kpi-label">vs mois précédent</span>
          </div>
        </div>

        <!-- KPI Projets -->
        <div class="card col-4">
          <div class="card-header">
            <span class="card-title">Projets en cours</span>
            <a href="#" class="card-action" data-target="projets">Voir tout</a>
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <div class="projects-stats">
              <div class="project-stat-row">
                <span class="project-stat-label">
                  <span class="stat-dot" style="background:#10b981;"></span>
                  En avance
                </span>
                <span class="project-stat-value" id="proj-en-avance">—</span>
              </div>
              <div class="project-stat-row">
                <span class="project-stat-label">
                  <span class="stat-dot" style="background:#f59e0b;"></span>
                  À temps
                </span>
                <span class="project-stat-value" id="proj-a-temps">—</span>
              </div>
              <div class="project-stat-row">
                <span class="project-stat-label">
                  <span class="stat-dot" style="background:#ef4444;"></span>
                  En retard
                </span>
                <span class="project-stat-value" id="proj-en-retard">—</span>
              </div>
            </div>
            <div class="projects-total-block">
              <div class="projects-total-number" id="proj-total">—</div>
              <div class="projects-total-label">total</div>
            </div>
          </div>
        </div>

        <!-- RDV du jour -->
        <div class="card col-4">
          <div class="card-header">
            <span class="card-title">Rendez-vous du jour</span>
            <a href="#" class="card-action" data-target="planning">Planning</a>
          </div>
          <ul class="rdv-list" id="rdv-list">
            <li style="color:var(--text-muted); font-size:13px; padding:8px 0;">Chargement…</li>
          </ul>
        </div>

        <!-- Tâches urgentes -->
        <div class="card col-5">
          <div class="card-header">
            <span class="card-title">Tâches urgentes</span>
            <a href="#" class="card-action" data-target="projets">Voir tout</a>
          </div>
          <ul class="task-list" id="urgent-tasks-list">
            <li style="color:var(--text-muted); font-size:13px; padding:10px 0;">Chargement…</li>
          </ul>
        </div>

        <!-- Activité récente -->
        <div class="card col-7">
          <div class="card-header">
            <span class="card-title">Activité récente</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0;">
            <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
              <img src="https://ui-avatars.com/api/?name=LM&background=0ea5e9&color=fff&size=28" style="width:28px;height:28px;border-radius:50%;">
              <div style="flex:1;">
                <p style="font-size:13px;"><strong>Lucas Martin</strong> a ajouté un fichier dans <strong>Nike</strong></p>
                <p style="font-size:11px; color:var(--text-muted); margin-top:2px;">Il y a 10 min</p>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
              <img src="https://ui-avatars.com/api/?name=CB&background=a78bfa&color=fff&size=28" style="width:28px;height:28px;border-radius:50%;">
              <div style="flex:1;">
                <p style="font-size:13px;"><strong>Camille B.</strong> a commenté <strong>"Créer la bannière hero"</strong></p>
                <p style="font-size:11px; color:var(--text-muted); margin-top:2px;">Il y a 1 h</p>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
              <div style="width:28px;height:28px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-circle-check" style="color:#10b981;font-size:13px;"></i>
              </div>
              <div style="flex:1;">
                <p style="font-size:13px;">Tâche <strong>"Maquette homepage"</strong> marquée terminée</p>
                <p style="font-size:11px; color:var(--text-muted); margin-top:2px;">Il y a 2 h</p>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px; padding:10px 0;">
              <div style="width:28px;height:28px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;font-size:12px;"></i>
              </div>
              <div style="flex:1;">
                <p style="font-size:13px;">Délai dépassé sur le projet <strong>Renault</strong></p>
                <p style="font-size:11px; color:var(--text-muted); margin-top:2px;">Il y a 3 h</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
   DASHBOARD — DONNÉES FIRESTORE
═══════════════════════════════════════════════════════════ */

export async function loadDashboardData(uid) {
  if (!uid) return;

  // Titre de bienvenue
  const nameEl    = document.getElementById('user-name');
  const headingEl = document.getElementById('welcome-heading');
  if (headingEl && nameEl && nameEl.textContent !== '—') {
    headingEl.textContent = `Bonjour, ${nameEl.textContent.split(' ')[0]} !`;
  }

  // Avatar dans le header
  const sidebarAvatar = document.getElementById('user-avatar-img');
  const headerAvatar  = document.getElementById('header-avatar');
  if (sidebarAvatar && headerAvatar) headerAvatar.src = sidebarAvatar.src;

  const [metrics, projects, tasks, appointments] = await Promise.allSettled([
    _loadMetrics(uid),
    _loadProjects(),
    _loadTasks(uid),
    _loadAppointments(uid),
  ]);

  // CA
  if (metrics.status === 'fulfilled' && metrics.value) {
    const { revenue, revenuePrev } = metrics.value;
    const el    = document.getElementById('kpi-revenue-value');
    const badge = document.getElementById('kpi-revenue-badge');
    if (el) el.textContent = formatRevenue(revenue);
    if (badge) {
      const { percentage, colorClass } = computeVariation(revenue, revenuePrev);
      const sign = percentage >= 0 ? '+' : '';
      badge.textContent = `${sign}${percentage} %`;
      badge.className   = `kpi-badge ${colorClass}`;
    }
  }

  // Projets
  if (projects.status === 'fulfilled' && projects.value) {
    const list   = projects.value;
    const counts = countByStatus(list);
    const get    = id => document.getElementById(id);
    if (get('proj-total'))     get('proj-total').textContent     = list.length;
    if (get('proj-en-avance')) get('proj-en-avance').textContent = counts.en_avance;
    if (get('proj-a-temps'))   get('proj-a-temps').textContent   = counts.a_temps;
    if (get('proj-en-retard')) get('proj-en-retard').textContent = counts.en_retard;
  }

  // Tâches urgentes
  if (tasks.status === 'fulfilled') renderUrgentTasks(tasks.value);

  // RDV
  if (appointments.status === 'fulfilled') renderTodayAppointments(appointments.value);
}

async function _loadMetrics(uid) {
  try {
    const now  = new Date();
    const key  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const snap = await getDoc(doc(db, 'metrics', uid, 'monthly', key));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function _loadProjects() {
  try {
    const snap = await getDocs(query(collection(db, 'projects'), limit(100)));
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

async function _loadTasks(uid) {
  try {
    const q    = query(collection(db, 'tasks'), where('assignee', '==', uid), where('urgent', '==', true), limit(10));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

async function _loadAppointments(uid) {
  try {
    const q    = query(collection(db, 'appointments'), where('attendees', 'array-contains', uid), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

function renderUrgentTasks(tasks) {
  const list = document.getElementById('urgent-tasks-list');
  if (!list) return;
  const sorted = sortByUrgency(tasks ?? []);
  if (sorted.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted); font-size:13px; padding:10px 0;">Aucune tâche urgente.</li>';
    return;
  }
  list.innerHTML = sorted.map(t => {
    const level    = t.urgencyLevel ?? 1;
    const barColor = level >= 3 ? 'var(--red)' : level === 2 ? 'var(--orange)' : '#f59e0b';
    return `
      <li class="task-item">
        <span class="task-priority-bar" style="background:${barColor};"></span>
        <div class="task-body">
          <p class="task-title">${escapeHtml(t.title ?? 'Tâche sans titre')}</p>
          <p class="task-meta">${escapeHtml(t.projectId ?? '')}</p>
        </div>
        <span class="task-tag urgent">Urgent</span>
      </li>`;
  }).join('');
}

function renderTodayAppointments(appointments) {
  const list = document.getElementById('rdv-list');
  if (!list) return;
  const today = filterTodayAppointments(appointments ?? [], new Date());
  if (today.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted); font-size:13px; padding:8px 0;">Aucun rendez-vous aujourd\'hui.</li>';
    return;
  }
  list.innerHTML = today.map(rdv => {
    const d       = rdv.date?.toDate ? rdv.date.toDate() : new Date(rdv.date);
    const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `
      <li class="rdv-item">
        <div class="rdv-time-block">
          <span class="rdv-hour">${timeStr}</span>
        </div>
        <div class="rdv-body">
          <p class="rdv-title">${escapeHtml(rdv.title ?? 'RDV')}</p>
          ${rdv.location ? `<p class="rdv-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(rdv.location)}</p>` : ''}
        </div>
      </li>`;
  }).join('');
}


/* ═══════════════════════════════════════════════════════════
   UTILITAIRES DASHBOARD (exportés pour les tests PBT)
═══════════════════════════════════════════════════════════ */

export function formatRevenue(amountInCents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amountInCents / 100);
}

export function computeVariation(current, prev) {
  if (!prev) return { percentage: 0, colorClass: 'neutral' };
  const percentage = Math.round(((current - prev) / prev) * 100);
  return { percentage, colorClass: percentage > 0 ? 'positive' : percentage < 0 ? 'negative' : 'neutral' };
}

export function countByStatus(projects) {
  return projects.reduce((acc, p) => {
    if (p.status === 'en_avance')  acc.en_avance++;
    else if (p.status === 'a_temps')   acc.a_temps++;
    else if (p.status === 'en_retard') acc.en_retard++;
    return acc;
  }, { en_avance: 0, a_temps: 0, en_retard: 0 });
}

export function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => (b.urgencyLevel ?? 0) - (a.urgencyLevel ?? 0));
}

export function filterTodayAppointments(appointments, date) {
  const ref = date.toDateString();
  return appointments.filter(rdv => {
    const d = rdv.date?.toDate ? rdv.date.toDate() : new Date(rdv.date);
    return d.toDateString() === ref;
  });
}

export function scheduleMidnightRefresh() {
  const now      = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  setTimeout(() => {
    if (currentUid) loadDashboardData(currentUid);
    scheduleMidnightRefresh();
  }, midnight.getTime() - now.getTime());
}


/* ═══════════════════════════════════════════════════════════
   PARAMÈTRES — TEMPLATE HTML
═══════════════════════════════════════════════════════════ */

function getParametresHTML() {
  return `
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Rechercher un paramètre…">
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="Notifications">
          <i class="fa-regular fa-bell"></i>
        </button>
        <button class="header-btn" title="Aide">
          <i class="fa-regular fa-circle-question"></i>
        </button>
        <img
          src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32"
          alt="Avatar"
          class="header-avatar"
          id="header-avatar"
        >
      </div>
    </div>

    <div class="page-body">
      <div class="page-title-row">
        <div>
          <h1 class="page-title">Paramètres</h1>
          <p class="page-subtitle">Gérez votre profil et vos préférences</p>
        </div>
      </div>

      <div class="settings-layout">
        <!-- Settings Sidebar -->
        <div class="settings-sidebar">
          <div class="settings-nav-list">
            <div class="settings-nav-item active" data-tab="profile">
              <i class="fa-solid fa-user"></i>
              <span>Profil</span>
            </div>
            <div class="settings-nav-item" data-tab="preferences">
              <i class="fa-solid fa-sliders"></i>
              <span>Préférences</span>
            </div>
            <div class="settings-nav-item" data-tab="notifications">
              <i class="fa-solid fa-bell"></i>
              <span>Notifications</span>
            </div>
            <div class="settings-nav-item" data-tab="security">
              <i class="fa-solid fa-shield-halved"></i>
              <span>Sécurité</span>
            </div>
            <div class="settings-nav-item" data-tab="appearance">
              <i class="fa-solid fa-palette"></i>
              <span>Apparence</span>
            </div>
          </div>
        </div>

        <!-- Settings Content -->
        <div class="settings-content">
          <!-- Tab: Profile -->
          <div class="settings-tab active" id="tab-profile">
            <div class="settings-section">
              <h3 class="settings-section-title">Informations personnelles</h3>
              <div class="profile-card">
                <div class="profile-avatar-section">
                  <div class="profile-avatar-large">
                    <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=100" alt="Avatar" id="settings-avatar">
                    <button class="avatar-edit-btn" id="avatar-edit-btn">
                      <i class="fa-solid fa-camera"></i>
                    </button>
                  </div>
                  <div class="profile-info-main">
                    <div class="profile-name" id="settings-name">—</div>
                    <div class="profile-email" id="settings-email">—</div>
                    <div class="profile-role" id="settings-role">—</div>
                  </div>
                </div>
                <div class="profile-form">
                  <div class="form-row">
                    <div class="form-group">
                      <label>Prénom</label>
                      <input type="text" id="profile-firstname" placeholder="Prénom">
                    </div>
                    <div class="form-group">
                      <label>Nom</label>
                      <input type="text" id="profile-lastname" placeholder="Nom">
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Email professionnel</label>
                    <input type="email" id="profile-email-input" placeholder="email@entreprise.com" disabled>
                    <span class="form-hint">L'email ne peut pas être modifié</span>
                  </div>
                  <div class="form-group">
                    <label>Téléphone</label>
                    <input type="tel" id="profile-phone" placeholder="+33 6 12 34 56 78">
                  </div>
                  <div class="form-group">
                    <label>Fonction / Poste</label>
                    <input type="text" id="profile-job" placeholder="ex: Chef de projet">
                  </div>
                  <div class="form-group">
                    <label>Biographie</label>
                    <textarea id="profile-bio" rows="3" placeholder="Une courte description de vous..."></textarea>
                  </div>
                  <div class="form-actions">
                    <button class="btn-primary" id="save-profile-btn">
                      <i class="fa-solid fa-check"></i> Enregistrer les modifications
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3 class="settings-section-title">Statut de présence</h3>
              <div class="presence-card">
                <div class="presence-current-large">
                  <span class="presence-dot-large" id="settings-presence-dot"></span>
                  <div class="presence-info">
                    <div class="presence-label-large" id="settings-presence-label">—</div>
                    <div class="presence-sublabel">Votre statut actuel</div>
                  </div>
                </div>
                <div class="presence-options-grid">
                  <button class="presence-option-btn" data-status="disponible">
                    <span class="presence-dot" style="background:#10b981;"></span>
                    <div class="presence-option-info">
                      <div class="presence-option-label">Disponible</div>
                      <div class="presence-option-desc">Prêt à travailler</div>
                    </div>
                  </button>
                  <button class="presence-option-btn" data-status="en_pause">
                    <span class="presence-dot" style="background:#f59e0b;"></span>
                    <div class="presence-option-info">
                      <div class="presence-option-label">En pause</div>
                      <div class="presence-option-desc">De retour bientôt</div>
                    </div>
                  </button>
                  <button class="presence-option-btn" data-status="indisponible">
                    <span class="presence-dot" style="background:#ef4444;"></span>
                    <div class="presence-option-info">
                      <div class="presence-option-label">Indisponible</div>
                      <div class="presence-option-desc">Ne pas déranger</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab: Preferences -->
          <div class="settings-tab" id="tab-preferences" style="display:none;">
            <div class="settings-section">
              <h3 class="settings-section-title">Langue et région</h3>
              <div class="settings-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Langue</div>
                    <div class="setting-desc">Langue de l'interface</div>
                  </div>
                  <select class="settings-select" id="language-select">
                    <option value="fr" selected>Français</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Format de date</div>
                    <div class="setting-desc">Format d'affichage des dates</div>
                  </div>
                  <select class="settings-select" id="date-format-select">
                    <option value="fr" selected>JJ/MM/AAAA</option>
                    <option value="us">MM/JJ/AAAA</option>
                    <option value="iso">AAAA-MM-JJ</option>
                  </select>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Fuseau horaire</div>
                    <div class="setting-desc">Europe/Paris (UTC+1)</div>
                  </div>
                  <button class="btn-ghost-sm">Modifier</button>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3 class="settings-section-title">Paramètres de l'application</h3>
              <div class="settings-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Démarrage rapide</div>
                    <div class="setting-desc">Ouvrir le dernier projet au démarrage</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="pref-autostart" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Son des notifications</div>
                    <div class="setting-desc">Émettre un son lors des notifications</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="pref-sound" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Réduction automatique</div>
                    <div class="setting-desc">Réduire dans la barre des tâches</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="pref-minimize">
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab: Notifications -->
          <div class="settings-tab" id="tab-notifications" style="display:none;">
            <div class="settings-section">
              <h3 class="settings-section-title">Notifications par email</h3>
              <div class="settings-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Notifications générales</div>
                    <div class="setting-desc">Recevoir les notifications importantes</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="notif-email" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Mises à jour de projets</div>
                    <div class="setting-desc">Notifications sur les projets suivis</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="notif-projects" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Rappels de tâches</div>
                    <div class="setting-desc">Rappels pour les tâches à échéance</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="notif-tasks" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Rappels de rendez-vous</div>
                    <div class="setting-desc">Notifications avant les rendez-vous</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="notif-rdv" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Mentions et commentaires</div>
                    <div class="setting-desc">Quand quelqu'un vous mentionne</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="notif-mentions" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3 class="settings-section-title">Notifications push</h3>
              <div class="settings-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Activer les notifications push</div>
                    <div class="setting-desc">Recevoir des notifications sur le navigateur</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="notif-push">
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab: Security -->
          <div class="settings-tab" id="tab-security" style="display:none;">
            <div class="settings-section">
              <h3 class="settings-section-title">Mot de passe</h3>
              <div class="settings-card">
                <div class="password-form">
                  <div class="form-group">
                    <label>Mot de passe actuel</label>
                    <input type="password" id="current-password" placeholder="••••••••">
                  </div>
                  <div class="form-group">
                    <label>Nouveau mot de passe</label>
                    <input type="password" id="new-password" placeholder="Min. 8 caractères">
                    <div class="password-strength" id="password-strength">
                      <div class="strength-bar"></div>
                      <span class="strength-text">Force du mot de passe</span>
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Confirmer le nouveau mot de passe</label>
                    <input type="password" id="confirm-password" placeholder="••••••••">
                  </div>
                  <button class="btn-primary" id="change-password-btn">
                    <i class="fa-solid fa-key"></i> Mettre à jour le mot de passe
                  </button>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3 class="settings-section-title">Sécurité du compte</h3>
              <div class="settings-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Authentification à deux facteurs (2FA)</div>
                    <div class="setting-desc">Ajouter une couche de sécurité supplémentaire</div>
                  </div>
                  <button class="btn-ghost-sm" id="setup-2fa-btn">Configurer</button>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Sessions actives</div>
                    <div class="setting-desc" id="active-sessions">1 appareil connecté</div>
                  </div>
                  <button class="btn-ghost-sm" id="view-sessions-btn">Gérer</button>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Historique de connexion</div>
                    <div class="setting-desc" id="last-login">—</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-section danger-zone">
              <h3 class="settings-section-title">Zone de danger</h3>
              <div class="settings-card danger">
                <div class="danger-item">
                  <div class="danger-info">
                    <div class="danger-label">Supprimer le compte</div>
                    <div class="danger-desc">Cette action est irréversible et supprimera toutes vos données</div>
                  </div>
                  <button class="btn-danger-outline" id="delete-account-btn">Supprimer</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab: Appearance -->
          <div class="settings-tab" id="tab-appearance" style="display:none;">
            <div class="settings-section">
              <h3 class="settings-section-title">Thème</h3>
              <div class="theme-options">
                <div class="theme-option active" data-theme="light">
                  <div class="theme-preview light"></div>
                  <span>Clair</span>
                </div>
                <div class="theme-option" data-theme="dark">
                  <div class="theme-preview dark"></div>
                  <span>Sombre</span>
                </div>
                <div class="theme-option" data-theme="auto">
                  <div class="theme-preview auto"></div>
                  <span>Automatique</span>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3 class="settings-section-title">Affichage</h3>
              <div class="settings-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Densité de l'interface</div>
                    <div class="setting-desc">Espacement entre les éléments</div>
                  </div>
                  <select class="settings-select" id="density-select">
                    <option value="compact">Compacte</option>
                    <option value="normal" selected>Normale</option>
                    <option value="comfortable">Confortable</option>
                  </select>
                </div>
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Animations</div>
                    <div class="setting-desc">Activer les animations de l'interface</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="pref-animations" checked>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="settings-footer">
            <button class="btn-ghost" id="settings-cancel-btn">Annuler</button>
            <button class="btn-danger" id="signout-btn">
              <i class="fa-solid fa-right-from-bracket"></i> Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
   PARAMÈTRES — DONNÉES & FONCTIONNALITÉS
═══════════════════════════════════════════════════════════ */

async function loadParametresData(uid) {
  if (!uid) return;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const profile = snap.data();

      // Profile display
      const nameEl = document.getElementById('settings-name');
      const emailEl = document.getElementById('settings-email');
      const roleEl = document.getElementById('settings-role');
      const avatarEl = document.getElementById('settings-avatar');
      const headerAvatar = document.getElementById('header-avatar');

      if (nameEl && profile.displayName) nameEl.textContent = profile.displayName;
      if (emailEl && profile.email) emailEl.textContent = profile.email;
      if (roleEl) roleEl.textContent = profile.role === 'admin' ? 'Administrateur' : 'Employé';

      const avatarUrl = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || 'U')}&background=4f46e5&color=fff&size=100`;
      if (avatarEl) avatarEl.src = avatarUrl;
      if (headerAvatar) headerAvatar.src = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || 'U')}&background=4f46e5&color=fff&size=32`;

      // Profile form fields
      if (profile.displayName) {
        const parts = profile.displayName.split(' ');
        const firstNameInput = document.getElementById('profile-firstname');
        const lastNameInput = document.getElementById('profile-lastname');
        if (firstNameInput) firstNameInput.value = parts[0] || '';
        if (lastNameInput) lastNameInput.value = parts.slice(1).join(' ') || '';
      }
      const emailInput = document.getElementById('profile-email-input');
      const phoneInput = document.getElementById('profile-phone');
      const jobInput = document.getElementById('profile-job');
      const bioInput = document.getElementById('profile-bio');

      if (emailInput && profile.email) emailInput.value = profile.email;
      if (phoneInput && profile.phone) phoneInput.value = profile.phone;
      if (jobInput && profile.jobTitle) jobInput.value = profile.jobTitle;
      if (bioInput && profile.bio) bioInput.value = profile.bio;

      // Notification preferences
      if (profile.preferences) {
        const prefs = profile.preferences;
        const setToggle = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.checked = val !== false;
        };
        setToggle('notif-email', prefs.email);
        setToggle('notif-tasks', prefs.tasks);
        setToggle('notif-rdv', prefs.rdv);
        setToggle('notif-projects', prefs.projects);
        setToggle('notif-mentions', prefs.mentions);
        setToggle('notif-push', prefs.push);
        setToggle('pref-autostart', prefs.autostart);
        setToggle('pref-sound', prefs.sound);
        setToggle('pref-minimize', prefs.minimize);
        setToggle('pref-animations', prefs.animations);
      }

      // Language and date format
      if (profile.language) {
        const langSelect = document.getElementById('language-select');
        if (langSelect) langSelect.value = profile.language;
      }
      if (profile.dateFormat) {
        const dateSelect = document.getElementById('date-format-select');
        if (dateSelect) dateSelect.value = profile.dateFormat;
      }

      // Last login
      const lastLoginEl = document.getElementById('last-login');
      if (lastLoginEl && profile.lastLogin) {
        const date = profile.lastLogin.toDate ? profile.lastLogin.toDate() : new Date(profile.lastLogin);
        lastLoginEl.textContent = date.toLocaleString('fr-FR');
      }
    }

    // Presence status
    const presenceSnap = await getDoc(doc(db, 'presence', uid));
    if (presenceSnap.exists()) {
      const { status } = presenceSnap.data();
      applySettingsPresenceUI(status);
    }
  } catch (err) {
    console.warn('loadParametresData:', err);
  }
}

function applySettingsPresenceUI(status) {
  const dot = document.getElementById('settings-presence-dot');
  const label = document.getElementById('settings-presence-label');
  if (dot) dot.style.background = getStatusColor(status);
  if (label) label.textContent = getStatusLabel(status);
}

function initParametres() {
  // Tab navigation
  const settingsNavItems = document.querySelectorAll('.settings-nav-item');
  const settingsTabs = document.querySelectorAll('.settings-tab');

  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.dataset.tab;

      // Update nav items
      settingsNavItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Update tabs
      settingsTabs.forEach(tab => {
        tab.style.display = tab.id === `tab-${tabName}` ? 'block' : 'none';
        if (tab.id === `tab-${tabName}`) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
    });
  });

  // Save profile
  const saveProfileBtn = document.getElementById('save-profile-btn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const firstName = document.getElementById('profile-firstname')?.value.trim();
      const lastName = document.getElementById('profile-lastname')?.value.trim();
      const phone = document.getElementById('profile-phone')?.value.trim();
      const job = document.getElementById('profile-job')?.value.trim();
      const bio = document.getElementById('profile-bio')?.value.trim();

      const displayName = `${firstName || ''} ${lastName || ''}`.trim();

      if (!displayName) {
        showToast('Le nom est requis', 'error');
        return;
      }

      try {
        await updateDoc(doc(db, 'users', currentUid), {
          displayName,
          phone: phone || null,
          jobTitle: job || null,
          bio: bio || null,
          updatedAt: serverTimestamp()
        });

        await loadParametresData(currentUid);

        // Update sidebar
        const sidebarName = document.getElementById('user-name');
        if (sidebarName) sidebarName.textContent = displayName;

        showToast('Profil mis à jour avec succès', 'success');
      } catch (err) {
        console.error('Erreur lors de la sauvegarde du profil:', err);
        showToast('Erreur lors de la sauvegarde du profil', 'error');
      }
    });
  }

  // Avatar edit button
  const avatarEditBtn = document.getElementById('avatar-edit-btn');
  if (avatarEditBtn) {
    avatarEditBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const storageRef = ref(storage, `avatars/${currentUid}/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);

          await updateDoc(doc(db, 'users', currentUid), {
            photoURL: downloadURL,
            updatedAt: serverTimestamp()
          });

          const avatarEl = document.getElementById('settings-avatar');
          const sidebarAvatar = document.getElementById('user-avatar-img');
          if (avatarEl) avatarEl.src = downloadURL;
          if (sidebarAvatar) sidebarAvatar.src = downloadURL;

          showToast('Photo de profil mise à jour', 'success');
        } catch (err) {
          console.error('Erreur lors de l\'upload:', err);
          showToast('Erreur lors de l\'upload de l\'image', 'error');
        }
      };
      input.click();
    });
  }

  // Presence options
  document.querySelectorAll('.presence-option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      await updatePresenceStatus(status);
      applySettingsPresenceUI(status);
    });
  });

  // Notification preferences - using debounced save
  const notificationIds = ['notif-email', 'notif-tasks', 'notif-rdv', 'notif-projects', 'notif-mentions', 'notif-push'];
  const saveNotifPrefs = debounce(async () => {
    const prefs = {};
    notificationIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) prefs[id.replace('notif-', '').replace('pref-', '')] = el.checked;
    });

    try {
      await updateDoc(doc(db, 'users', currentUid), {
        'preferences': { ...(await getDoc(doc(db, 'users', currentUid))).data()?.preferences, ...prefs },
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Erreur lors de la sauvegarde des préférences:', err);
    }
  }, 500);

  notificationIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveNotifPrefs);
  });

  // Preferences toggles
  const prefIds = ['pref-autostart', 'pref-sound', 'pref-minimize', 'pref-animations'];
  const saveAppPrefs = debounce(async () => {
    const prefs = {};
    prefIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) prefs[id.replace('pref-', '')] = el.checked;
    });

    try {
      await updateDoc(doc(db, 'users', currentUid), {
        'preferences': { ...(await getDoc(doc(db, 'users', currentUid))).data()?.preferences, ...prefs },
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Erreur lors de la sauvegarde des préférences:', err);
    }
  }, 500);

  prefIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveAppPrefs);
  });

  // Language and date format
  const languageSelect = document.getElementById('language-select');
  const dateFormatSelect = document.getElementById('date-format-select');
  const densitySelect = document.getElementById('density-select');

  const saveSettings = async () => {
    try {
      const update = {};
      if (languageSelect) update.language = languageSelect.value;
      if (dateFormatSelect) update.dateFormat = dateFormatSelect.value;
      if (densitySelect) update.density = densitySelect.value;

      await updateDoc(doc(db, 'users', currentUid), {
        ...update,
        updatedAt: serverTimestamp()
      });
      showToast('Paramètres enregistrés', 'success');
    } catch (err) {
      console.warn('Erreur lors de la sauvegarde:', err);
    }
  };

  languageSelect?.addEventListener('change', saveSettings);
  dateFormatSelect?.addEventListener('change', saveSettings);
  densitySelect?.addEventListener('change', saveSettings);

  // Theme options
  document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      const theme = option.dataset.theme;
      // Apply theme logic here
      updateDoc(doc(db, 'users', currentUid), { theme, updatedAt: serverTimestamp() }).catch(console.warn);
    });
  });

  // Change password button
  const changePasswordBtn = document.getElementById('change-password-btn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
      const currentPwd = document.getElementById('current-password')?.value;
      const newPwd = document.getElementById('new-password')?.value;
      const confirmPwd = document.getElementById('confirm-password')?.value;

      if (!currentPwd || !newPwd || !confirmPwd) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
      }

      if (newPwd !== confirmPwd) {
        showToast('Les mots de passe ne correspondent pas', 'error');
        return;
      }

      if (newPwd.length < 8) {
        showToast('Le mot de passe doit faire au moins 8 caractères', 'error');
        return;
      }

      try {
        const user = auth.currentUser;
        if (!user || !user.email) {
          showToast('Utilisateur non authentifié', 'error');
          return;
        }

        // Ré-authentification requise avant changement de mot de passe
        const credential = EmailAuthProvider.credential(user.email, currentPwd);
        await reauthenticateWithCredential(user, credential);

        // Mise à jour du mot de passe
        await updatePassword(user, newPwd);

        // Effacer les champs
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

        showToast('Mot de passe mis à jour avec succès', 'success');
      } catch (err) {
        console.error('Erreur changement mot de passe:', err);
        if (err.code === 'auth/wrong-password') {
          showToast('Mot de passe actuel incorrect', 'error');
        } else if (err.code === 'auth/weak-password') {
          showToast('Le nouveau mot de passe est trop faible', 'error');
        } else if (err.code === 'auth/requires-recent-login') {
          showToast('Veuillez vous reconnecter pour changer votre mot de passe', 'error');
        } else {
          showToast('Erreur lors du changement de mot de passe', 'error');
        }
      }
    });
  }

  // 2FA setup button - feature disabled for now
  document.getElementById('setup-2fa-btn')?.addEventListener('click', () => {
    showToast('L\'authentification à deux facteurs sera disponible prochainement', 'info');
  });

  // View sessions button - feature disabled for now
  document.getElementById('view-sessions-btn')?.addEventListener('click', () => {
    showToast('Gestion des sessions active - Fonctionnalité en développement', 'info');
  });

  // Delete account button
  document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) return;
    if (!confirm('Cette action supprimera définitivement toutes vos données. Confirmer ?')) return;

    // Account deletion requires careful implementation with data cleanup
    // For production safety, this is disabled until full data deletion logic is implemented
    showToast('Cette fonctionnalité nécessite une validation administrative', 'info');
  });

  // Cancel button - reset form
  document.getElementById('settings-cancel-btn')?.addEventListener('click', () => {
    loadParametresData(currentUid);
    showToast('Modifications annulées', 'info');
  });

  // Sign out button
  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
        try {
          await signOut(auth);
          window.location.replace('operating-system.html');
        } catch (err) {
          console.error('Erreur lors de la déconnexion:', err);
          showToast('Erreur lors de la déconnexion', 'error');
        }
      }
    });
  }
}


/* ═══════════════════════════════════════════════════════════
   PLANNING — TEMPLATE HTML
═══════════════════════════════════════════════════════════ */

function getPlanningHTML() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return `
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Rechercher un rendez-vous…">
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="Notifications">
          <i class="fa-regular fa-bell"></i>
        </button>
        <button class="header-btn" title="Aide">
          <i class="fa-regular fa-circle-question"></i>
        </button>
        <img
          src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32"
          alt="Avatar"
          class="header-avatar"
          id="header-avatar"
        >
      </div>
    </div>

    <div class="page-body">
      <div class="page-title-row">
        <div>
          <h1 class="page-title">Planning</h1>
          <p class="page-subtitle">Gérez vos rendez-vous et votre agenda</p>
        </div>
        <div class="page-date">
          <i class="fa-regular fa-calendar"></i>
          ${dateCap}
        </div>
      </div>

      <div class="planning-grid">
        <!-- Calendrier -->
        <div class="card col-8">
          <div class="card-header">
            <span class="card-title">Calendrier</span>
            <button class="btn-primary-sm" id="add-rdv-btn">
              <i class="fa-solid fa-plus"></i> Nouveau RDV
            </button>
          </div>
          <div class="planning-calendar" id="planning-calendar">
            <div class="calendar-header">
              <button class="calendar-nav" id="calendar-prev"><i class="fa-solid fa-chevron-left"></i></button>
              <span class="calendar-title" id="calendar-title">Juin 2026</span>
              <button class="calendar-nav" id="calendar-next"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
            <div class="calendar-grid" id="calendar-grid">
              <div class="calendar-day-header">Lun</div>
              <div class="calendar-day-header">Mar</div>
              <div class="calendar-day-header">Mer</div>
              <div class="calendar-day-header">Jeu</div>
              <div class="calendar-day-header">Ven</div>
              <div class="calendar-day-header">Sam</div>
              <div class="calendar-day-header">Dim</div>
            </div>
          </div>
        </div>

        <!-- Rendez-vous du jour -->
        <div class="card col-4">
          <div class="card-header">
            <span class="card-title">Rendez-vous du jour</span>
          </div>
          <div class="planning-today" id="planning-today">
            <div class="empty-state">
              <i class="fa-regular fa-calendar-check"></i>
              <p>Aucun rendez-vous aujourd'hui</p>
            </div>
          </div>
        </div>

        <!-- Liste des rendez-vous à venir -->
        <div class="card col-12">
          <div class="card-header">
            <span class="card-title">Rendez-vous à venir</span>
            <div class="card-filters">
              <button class="filter-btn active" data-filter="all">Tous</button>
              <button class="filter-btn" data-filter="today">Aujourd'hui</button>
              <button class="filter-btn" data-filter="week">Cette semaine</button>
            </div>
          </div>
          <div class="planning-list" id="planning-list">
            <div class="empty-state">
              <i class="fa-regular fa-calendar"></i>
              <p>Aucun rendez-vous à venir</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
   PLANNING — DONNÉES & FONCTIONNALITÉS
═══════════════════════════════════════════════════════════ */

async function loadPlanningData(uid) {
  if (!uid) return;

  try {
    // Charger les rendez-vous depuis Firestore
    const q = query(
      collection(db, 'appointments'),
      where('attendees', 'array-contains', uid),
      where('date', '>=', new Date()),
      limit(50)
    );
    const snap = await getDocs(q);
    const appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderPlanningCalendar(new Date(), appointments);
    renderPlanningToday(appointments);
    renderPlanningList(appointments);
  } catch (err) {
    console.warn('loadPlanningData:', err);
  }
}

function renderPlanningCalendar(date, appointments) {
  const grid = document.getElementById('calendar-grid');
  const title = document.getElementById('calendar-title');
  if (!grid || !title) return;

  const year = date.getFullYear();
  const month = date.getMonth();
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  title.textContent = `${monthNames[month]} ${year}`;

  // Premier jour du mois
  const firstDay = new Date(year, month, 1);
  const startingDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Lundi = 0

  // Nombre de jours dans le mois
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Générer les jours
  let html = `
    <div class="calendar-day-header">Lun</div>
    <div class="calendar-day-header">Mar</div>
    <div class="calendar-day-header">Mer</div>
    <div class="calendar-day-header">Jeu</div>
    <div class="calendar-day-header">Ven</div>
    <div class="calendar-day-header">Sam</div>
    <div class="calendar-day-header">Dim</div>
  `;

  // Jours vides avant le premier jour
  for (let i = 0; i < startingDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  // Jours du mois
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);
    const isToday = currentDate.toDateString() === today.toDateString();
    const hasAppointment = appointments.some(app => {
      const appDate = app.date?.toDate ? app.date.toDate() : new Date(app.date);
      return appDate.toDateString() === currentDate.toDateString();
    });

    html += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${hasAppointment ? 'has-event' : ''}" data-date="${currentDate.toISOString()}">
        <span class="calendar-day-number">${day}</span>
        ${hasAppointment ? '<span class="calendar-event-dot"></span>' : ''}
      </div>
    `;
  }

  grid.innerHTML = html;
}

function renderPlanningToday(appointments) {
  const container = document.getElementById('planning-today');
  if (!container) return;

  const today = new Date();
  const todayAppointments = appointments.filter(app => {
    const appDate = app.date?.toDate ? app.date.toDate() : new Date(app.date);
    return appDate.toDateString() === today.toDateString();
  }).sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateA - dateB;
  });

  if (todayAppointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-calendar-check"></i>
        <p>Aucun rendez-vous aujourd'hui</p>
      </div>
    `;
    return;
  }

  container.innerHTML = todayAppointments.map(app => {
    const date = app.date?.toDate ? app.date.toDate() : new Date(app.date);
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="planning-rdv-item">
        <div class="rdv-time">${timeStr}</div>
        <div class="rdv-info">
          <div class="rdv-title">${escapeHtml(app.title ?? 'RDV')}</div>
          ${app.location ? `<div class="rdv-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(app.location)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderPlanningList(appointments) {
  const container = document.getElementById('planning-list');
  if (!container) return;

  if (appointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-calendar"></i>
        <p>Aucun rendez-vous à venir</p>
      </div>
    `;
    return;
  }

  const sorted = [...appointments].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateA - dateB;
  });

  container.innerHTML = sorted.map(app => {
    const date = app.date?.toDate ? app.date.toDate() : new Date(app.date);
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `
      <div class="planning-list-item">
        <div class="rdv-date-block">
          <span class="rdv-day">${dateStr}</span>
          <span class="rdv-time">${timeStr}</span>
        </div>
        <div class="rdv-body">
          <div class="rdv-title">${escapeHtml(app.title ?? 'RDV')}</div>
          ${app.location ? `<div class="rdv-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(app.location)}</div>` : ''}
          ${app.description ? `<div class="rdv-desc">${escapeHtml(app.description)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function initPlanning() {
  // Navigation calendrier
  const prevBtn = document.getElementById('calendar-prev');
  const nextBtn = document.getElementById('calendar-next');
  let currentDate = new Date();

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      await loadPlanningData(currentUid);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      await loadPlanningData(currentUid);
    });
  }

  // Bouton nouveau RDV
  const addRdvBtn = document.getElementById('add-rdv-btn');
  if (addRdvBtn) {
    addRdvBtn.addEventListener('click', () => {
      showToast('Création de rendez-vous - En développement', 'info');
    });
  }

  // Filtres - visuel uniquement pour le moment
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   DOCUMENTS — TEMPLATE HTML
═══════════════════════════════════════════════════════════ */

function getDocumentsHTML() {
  return `
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="docs-search-input" placeholder="Rechercher un document…">
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="Notifications">
          <i class="fa-regular fa-bell"></i>
        </button>
        <button class="header-btn" title="Aide">
          <i class="fa-regular fa-circle-question"></i>
        </button>
        <img
          src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32"
          alt="Avatar"
          class="header-avatar"
          id="header-avatar"
        >
      </div>
    </div>

    <div class="page-body">
      <div class="page-title-row">
        <div>
          <h1 class="page-title">Documents</h1>
          <p class="page-subtitle">Gérez vos fichiers et ressources</p>
        </div>
        <div class="page-title-actions">
          <input type="file" id="file-upload-input" multiple style="display:none;">
          <button class="btn-ghost-sm" id="new-folder-btn">
            <i class="fa-solid fa-folder-plus"></i> Nouveau dossier
          </button>
          <button class="btn-primary-sm" id="upload-doc-btn">
            <i class="fa-solid fa-cloud-arrow-up"></i> Téléverser
          </button>
        </div>
      </div>

      <div class="documents-layout">
        <!-- Sidebar Navigation -->
        <div class="docs-sidebar">
          <div class="docs-nav-section">
            <div class="docs-nav-title">Emplacements</div>
            <div class="docs-nav-list">
              <div class="docs-nav-item active" data-folder="root">
                <i class="fa-solid fa-house"></i>
                <span>Accueil</span>
                <span class="docs-nav-count" id="root-count">0</span>
              </div>
              <div class="docs-nav-item" data-folder="my-files">
                <i class="fa-solid fa-user"></i>
                <span>Mes fichiers</span>
                <span class="docs-nav-count" id="my-files-count">0</span>
              </div>
              <div class="docs-nav-item" data-folder="shared">
                <i class="fa-solid fa-share-nodes"></i>
                <span>Partagés avec moi</span>
                <span class="docs-nav-count" id="shared-count">0</span>
              </div>
            </div>
          </div>

          <div class="docs-nav-section">
            <div class="docs-nav-title">Types</div>
            <div class="docs-nav-list">
              <div class="docs-nav-item" data-type="images">
                <i class="fa-solid fa-image" style="color:#3b82f6;"></i>
                <span>Images</span>
                <span class="docs-nav-count" id="images-count">0</span>
              </div>
              <div class="docs-nav-item" data-type="pdf">
                <i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i>
                <span>PDF</span>
                <span class="docs-nav-count" id="pdf-count">0</span>
              </div>
              <div class="docs-nav-item" data-type="documents">
                <i class="fa-solid fa-file-word" style="color:#2563eb;"></i>
                <span>Documents</span>
                <span class="docs-nav-count" id="documents-count">0</span>
              </div>
              <div class="docs-nav-item" data-type="spreadsheets">
                <i class="fa-solid fa-file-excel" style="color:#10b981;"></i>
                <span>Tableurs</span>
                <span class="docs-nav-count" id="spreadsheets-count">0</span>
              </div>
            </div>
          </div>

          <div class="docs-storage-info">
            <div class="storage-header">
              <span>Stockage</span>
              <span id="storage-used">0 MB / 1 GB</span>
            </div>
            <div class="storage-bar">
              <div class="storage-progress" id="storage-progress" style="width: 0%;"></div>
            </div>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="docs-main">
          <!-- Breadcrumb -->
          <div class="docs-breadcrumb" id="docs-breadcrumb">
            <span class="breadcrumb-item active">Documents</span>
          </div>

          <!-- Toolbar -->
          <div class="docs-toolbar">
            <div class="docs-view-toggle">
              <button class="view-btn active" data-view="grid" title="Vue grille">
                <i class="fa-solid fa-border-all"></i>
              </button>
              <button class="view-btn" data-view="list" title="Vue liste">
                <i class="fa-solid fa-list"></i>
              </button>
            </div>
            <div class="docs-sort">
              <select id="docs-sort-select">
                <option value="name">Nom</option>
                <option value="date">Date de modification</option>
                <option value="size">Taille</option>
                <option value="type">Type</option>
              </select>
            </div>
          </div>

          <!-- Content Grid/List -->
          <div class="docs-content" id="docs-content">
            <div class="docs-empty-state" id="docs-empty-state">
              <div class="empty-icon">
                <i class="fa-regular fa-folder-open"></i>
              </div>
              <h3>Dossier vide</h3>
              <p>Commencez par téléverser des fichiers ou créer un dossier</p>
              <button class="btn-primary-sm" id="empty-upload-btn">
                <i class="fa-solid fa-cloud-arrow-up"></i> Téléverser des fichiers
              </button>
            </div>
            <div class="docs-grid" id="docs-grid" style="display:none;"></div>
            <div class="docs-list-view" id="docs-list-view" style="display:none;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: New Folder -->
    <div class="modal-overlay" id="folder-modal" style="display:none;">
      <div class="modal">
        <div class="modal-header">
          <h3>Nouveau dossier</h3>
          <button class="modal-close" id="folder-modal-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nom du dossier</label>
            <input type="text" id="folder-name-input" placeholder="Nouveau dossier">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" id="folder-cancel-btn">Annuler</button>
          <button class="btn-primary-sm" id="folder-create-btn">Créer</button>
        </div>
      </div>
    </div>

    <!-- Modal: File Preview -->
    <div class="modal-overlay" id="preview-modal" style="display:none;">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3 id="preview-filename">Fichier</h3>
          <button class="modal-close" id="preview-modal-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="file-preview-area" id="file-preview-area">
            <div class="preview-placeholder">
              <i class="fa-solid fa-file"></i>
              <p>L'aperçu n'est pas disponible pour ce type de fichier</p>
            </div>
          </div>
          <div class="file-details" id="file-details"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-danger" id="file-delete-btn">
            <i class="fa-solid fa-trash"></i> Supprimer
          </button>
          <button class="btn-primary-sm" id="file-download-btn">
            <i class="fa-solid fa-download"></i> Télécharger
          </button>
        </div>
      </div>
    </div>
  `;
}


/* ═══════════════════════════════════════════════════════════
   DOCUMENTS — DONNÉES & FONCTIONNALITÉS
═══════════════════════════════════════════════════════════ */

async function loadDocumentsData(uid) {
  if (!uid) return;

  try {
    // Charger les documents depuis Firestore
    const q = query(collection(db, 'documents'), limit(100));
    const snap = await getDocs(q);
    const documents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderDocumentsStats(documents);
    renderDocumentsFolders(documents);
    renderDocumentsRecent(documents);
    renderDocumentsList(documents);
  } catch (err) {
    console.warn('loadDocumentsData:', err);
  }
}

function renderDocumentsStats(documents) {
  const totalEl = document.getElementById('docs-total');
  const sizeEl = document.getElementById('docs-size');

  if (totalEl) totalEl.textContent = documents.length;

  // Calculer la taille totale (simulée)
  const totalSize = documents.reduce((acc, doc) => acc + (doc.size || 0), 0);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  if (sizeEl) sizeEl.textContent = `${sizeMB} MB`;
}

function renderDocumentsFolders(documents) {
  const container = document.getElementById('docs-folders');
  if (!container) return;

  // Grouper par dossier
  const folders = {};
  documents.forEach(doc => {
    const folder = doc.folder || 'Racine';
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push(doc);
  });

  const folderNames = Object.keys(folders);
  if (folderNames.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-folder"></i>
        <p>Aucun dossier</p>
      </div>
    `;
    return;
  }

  container.innerHTML = folderNames.map(folder => {
    const count = folders[folder].length;
    return `
      <div class="docs-folder-item">
        <div class="folder-icon">
          <i class="fa-solid fa-folder"></i>
        </div>
        <div class="folder-info">
          <div class="folder-name">${escapeHtml(folder)}</div>
          <div class="folder-count">${count} fichier${count > 1 ? 's' : ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDocumentsRecent(documents) {
  const container = document.getElementById('docs-recent');
  if (!container) return;

  const recent = [...documents]
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB - dateA;
    })
    .slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-file"></i>
        <p>Aucun fichier récent</p>
      </div>
    `;
    return;
  }

  container.innerHTML = recent.map(doc => {
    const icon = getFileIcon(doc.type);
    const date = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt || 0);
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `
      <div class="docs-recent-item">
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(doc.name)}</div>
          <div class="file-meta">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDocumentsList(documents) {
  const container = document.getElementById('docs-list');
  if (!container) return;

  if (documents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-folder-open"></i>
        <p>Aucun document</p>
      </div>
    `;
    return;
  }

  container.innerHTML = documents.map(doc => {
    const icon = getFileIcon(doc.type);
    const date = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt || 0);
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const size = formatFileSize(doc.size || 0);
    return `
      <div class="docs-list-item">
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(doc.name)}</div>
          <div class="file-meta">${dateStr} • ${size}</div>
        </div>
        <div class="file-actions">
          <button class="file-action-btn" title="Télécharger">
            <i class="fa-solid fa-download"></i>
          </button>
          <button class="file-action-btn" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Documents state management
let docsState = {
  documents: [],
  folders: ['Mes documents', 'Projets', 'Clients', 'Templates', 'Archives'],
  currentFolder: 'root',
  currentFilter: 'all',
  viewMode: 'grid',
  sortBy: 'name',
  searchQuery: '',
  selectedFile: null
};

function getFileIcon(type, name, mimeType) {
  if (type === 'image' || mimeType?.startsWith('image/')) {
    return '<i class="fa-solid fa-file-image" style="color:#3b82f6;"></i>';
  }
  if (type === 'pdf' || name?.toLowerCase().endsWith('.pdf')) {
    return '<i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i>';
  }
  if (/\.(doc|docx)$/i.test(name || '')) {
    return '<i class="fa-solid fa-file-word" style="color:#2563eb;"></i>';
  }
  if (/\.(xls|xlsx|csv)$/i.test(name || '')) {
    return '<i class="fa-solid fa-file-excel" style="color:#10b981;"></i>';
  }
  if (/\.(ppt|pptx)$/i.test(name || '')) {
    return '<i class="fa-solid fa-file-powerpoint" style="color:#f59e0b;"></i>';
  }
  if (/\.(zip|rar|7z)$/i.test(name || '')) {
    return '<i class="fa-solid fa-file-zipper" style="color:#8b5cf6;"></i>';
  }
  return '<i class="fa-solid fa-file" style="color:#6b7280;"></i>';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateDocumentsStats() {
  const docs = docsState.documents;
  const counts = {
    root: docs.filter(d => !d.folder || d.folder === 'root').length,
    myFiles: docs.filter(d => d.ownerId === currentUid).length,
    shared: docs.filter(d => d.shared === true).length,
    images: docs.filter(d => d.type === 'image' || d.mimeType?.startsWith('image/')).length,
    pdf: docs.filter(d => d.type === 'pdf' || d.name?.toLowerCase().endsWith('.pdf')).length,
    documents: docs.filter(d => /\.(doc|docx|txt|rtf)$/i.test(d.name || '')).length,
    spreadsheets: docs.filter(d => /\.(xls|xlsx|csv)$/i.test(d.name || '')).length
  };

  const totalSize = docs.reduce((acc, doc) => acc + (doc.size || 0), 0);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

  ['root', 'my-files', 'shared', 'images', 'pdf', 'documents', 'spreadsheets'].forEach(key => {
    const el = document.getElementById(`${key}-count`);
    if (el) el.textContent = counts[key.replace('-', '')] || 0;
  });

  const usedEl = document.getElementById('storage-used');
  if (usedEl) usedEl.textContent = `${sizeMB} MB / 1 GB`;

  const progressEl = document.getElementById('storage-progress');
  if (progressEl) {
    const percentage = Math.min((totalSize / (1024 * 1024 * 1024)) * 100, 100);
    progressEl.style.width = `${percentage}%`;
  }
}

function renderDocumentsContent() {
  const emptyState = document.getElementById('docs-empty-state');
  const gridView = document.getElementById('docs-grid');
  const listView = document.getElementById('docs-list-view');

  let filtered = filterDocuments(docsState.documents);
  filtered = sortDocuments(filtered);

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    if (gridView) gridView.style.display = 'none';
    if (listView) listView.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  if (docsState.viewMode === 'grid') {
    if (gridView) {
      gridView.style.display = 'grid';
      gridView.innerHTML = filtered.map(doc => renderDocGridItem(doc)).join('');
    }
    if (listView) listView.style.display = 'none';
  } else {
    if (listView) {
      listView.style.display = 'block';
      listView.innerHTML = filtered.map(doc => renderDocListItem(doc)).join('');
    }
    if (gridView) gridView.style.display = 'none';
  }
  attachDocumentEventListeners();
}

function filterDocuments(docs) {
  let filtered = [...docs];
  if (docsState.searchQuery) {
    const q = docsState.searchQuery.toLowerCase();
    filtered = filtered.filter(d => (d.name || '').toLowerCase().includes(q));
  }
  if (docsState.currentFolder === 'root') {
    filtered = filtered.filter(d => !d.folder || d.folder === 'root');
  } else if (docsState.currentFolder === 'my-files') {
    filtered = filtered.filter(d => d.ownerId === currentUid);
  } else if (docsState.currentFolder === 'shared') {
    filtered = filtered.filter(d => d.shared === true);
  } else if (docsState.currentFolder.startsWith('folder-')) {
    filtered = filtered.filter(d => d.folder === docsState.currentFolder.replace('folder-', ''));
  }
  if (docsState.currentFilter === 'images') {
    filtered = filtered.filter(d => d.type === 'image' || d.mimeType?.startsWith('image/'));
  } else if (docsState.currentFilter === 'pdf') {
    filtered = filtered.filter(d => d.type === 'pdf' || d.name?.toLowerCase().endsWith('.pdf'));
  } else if (docsState.currentFilter === 'documents') {
    filtered = filtered.filter(d => /\.(doc|docx|txt|rtf)$/i.test(d.name || ''));
  } else if (docsState.currentFilter === 'spreadsheets') {
    filtered = filtered.filter(d => /\.(xls|xlsx|csv)$/i.test(d.name || ''));
  }
  return filtered;
}

function sortDocuments(docs) {
  return [...docs].sort((a, b) => {
    if (docsState.sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (docsState.sortBy === 'date') {
      const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt || 0);
      const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt || 0);
      return dateB - dateA;
    }
    if (docsState.sortBy === 'size') return (b.size || 0) - (a.size || 0);
    if (docsState.sortBy === 'type') return (a.type || '').localeCompare(b.type || '');
    return 0;
  });
}

function renderDocGridItem(doc) {
  const icon = getFileIcon(doc.type, doc.name, doc.mimeType);
  const date = formatRelativeDate(doc.updatedAt?.toDate ? doc.updatedAt.toDate() : new Date(doc.updatedAt || Date.now()));
  const size = formatFileSize(doc.size || 0);
  const name = escapeHtml(doc.name || 'Sans nom');
  return `
    <div class="doc-grid-item" data-id="${doc.id}">
      <div class="doc-item-preview">
        ${doc.type === 'image' || doc.mimeType?.startsWith('image/')
          ? `<img src="${doc.url || ''}" alt="" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='${icon.replace(/"/g, '&quot;')}';">`
          : icon}
      </div>
      <div class="doc-item-info">
        <div class="doc-item-name" title="${name}">${truncateText(name, 22)}</div>
        <div class="doc-item-meta">${size} • ${date}</div>
      </div>
      <div class="doc-item-actions">
        <button class="doc-action-btn doc-download" data-id="${doc.id}" title="Télécharger"><i class="fa-solid fa-download"></i></button>
        <button class="doc-action-btn doc-delete" data-id="${doc.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function renderDocListItem(doc) {
  const icon = getFileIcon(doc.type, doc.name, doc.mimeType);
  const date = doc.updatedAt?.toDate ? doc.updatedAt.toDate() : new Date(doc.updatedAt || Date.now());
  return `
    <div class="doc-list-item" data-id="${doc.id}">
      <div class="doc-list-icon">${icon}</div>
      <div class="doc-list-name">${escapeHtml(doc.name || 'Sans nom')}</div>
      <div class="doc-list-type">${doc.type || 'Fichier'}</div>
      <div class="doc-list-size">${formatFileSize(doc.size || 0)}</div>
      <div class="doc-list-date">${date.toLocaleDateString('fr-FR')}</div>
      <div class="doc-list-actions">
        <button class="doc-action-btn doc-download" data-id="${doc.id}" title="Télécharger"><i class="fa-solid fa-download"></i></button>
        <button class="doc-action-btn doc-delete" data-id="${doc.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function attachDocumentEventListeners() {
  document.querySelectorAll('.doc-download').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadDocument(btn.dataset.id);
    });
  });
  document.querySelectorAll('.doc-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDocument(btn.dataset.id);
    });
  });
  document.querySelectorAll('.doc-grid-item, .doc-list-item').forEach(item => {
    item.addEventListener('click', () => openDocumentPreview(item.dataset.id));
  });
}

async function uploadDocument(file) {
  if (!file || !currentUid) return;
  const uploadBtn = document.getElementById('upload-doc-btn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }
  try {
    const storageRef = ref(storage, `documents/${currentUid}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    await addDoc(collection(db, 'documents'), {
      name: file.name, size: file.size, type: getDocumentType(file.name, file.type),
      mimeType: file.type, url: downloadURL, storagePath: snapshot.ref.fullPath,
      folder: docsState.currentFolder, ownerId: currentUid,
      ownerName: document.getElementById('user-name')?.textContent || 'Utilisateur',
      shared: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await loadDocumentsData(currentUid);
    showToast('Fichier téléversé avec succès', 'success');
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Erreur lors du téléversement', 'error');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Téléverser';
    }
  }
}

async function downloadDocument(docId) {
  const doc = docsState.documents.find(d => d.id === docId);
  if (!doc?.url) return showToast('Document non trouvé', 'error');
  const link = document.createElement('a');
  link.href = doc.url;
  link.download = doc.name || 'document';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Téléchargement démarré', 'success');
}

async function deleteDocument(docId) {
  const doc = docsState.documents.find(d => d.id === docId);
  if (!doc) return;
  if (!confirm(`Supprimer "${doc.name}" ?`)) return;
  try {
    if (doc.storagePath) await deleteObject(ref(storage, doc.storagePath)).catch(() => {});
    await deleteDoc(doc(db, 'documents', docId));
    await loadDocumentsData(currentUid);
    showToast('Document supprimé', 'success');
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Erreur lors de la suppression', 'error');
  }
}

async function createFolder(folderName) {
  if (!folderName || !currentUid) return;
  try {
    const userRef = doc(db, 'users', currentUid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const folders = userSnap.data().folders || [];
      if (!folders.includes(folderName)) {
        folders.push(folderName);
        await updateDoc(userRef, { folders });
        showToast('Dossier créé', 'success');
      }
    }
  } catch (err) {
    console.error('Folder error:', err);
    showToast('Erreur lors de la création du dossier', 'error');
  }
}

function openDocumentPreview(docId) {
  const doc = docsState.documents.find(d => d.id === docId);
  if (!doc) return;
  docsState.selectedFile = doc;
  const modal = document.getElementById('preview-modal');
  const filenameEl = document.getElementById('preview-filename');
  const previewArea = document.getElementById('file-preview-area');
  const detailsEl = document.getElementById('file-details');

  if (filenameEl) filenameEl.textContent = doc.name || 'Fichier';
  if (previewArea) {
    if (doc.type === 'image' || doc.mimeType?.startsWith('image/')) {
      previewArea.innerHTML = `<img src="${doc.url}" alt="" style="max-width:100%;max-height:400px;border-radius:8px;">`;
    } else {
      previewArea.innerHTML = `<div class="preview-placeholder">${getFileIcon(doc.type, doc.name, doc.mimeType)}<p>Aperçu non disponible</p><a href="${doc.url}" target="_blank" class="btn-primary-sm" style="margin-top:16px;"><i class="fa-solid fa-external-link-alt"></i> Ouvrir</a></div>`;
    }
  }
  if (detailsEl) {
    const date = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt || Date.now());
    detailsEl.innerHTML = `
      <div class="file-detail-row"><span class="detail-label">Nom:</span><span class="detail-value">${escapeHtml(doc.name || '-')}</span></div>
      <div class="file-detail-row"><span class="detail-label">Type:</span><span class="detail-value">${doc.type || 'Inconnu'}</span></div>
      <div class="file-detail-row"><span class="detail-label">Taille:</span><span class="detail-value">${formatFileSize(doc.size || 0)}</span></div>
      <div class="file-detail-row"><span class="detail-label">Créé le:</span><span class="detail-value">${date.toLocaleString('fr-FR')}</span></div>`;
  }
  if (modal) modal.style.display = 'flex';
}

function getDocumentType(name, mimeType) {
  if (mimeType?.startsWith('image/')) return 'image';
  if (name?.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (/\.(doc|docx)$/i.test(name || '')) return 'document';
  if (/\.(xls|xlsx|csv)$/i.test(name || '')) return 'spreadsheet';
  if (/\.(ppt|pptx)$/i.test(name || '')) return 'presentation';
  return 'file';
}

function formatRelativeDate(date) {
  if (!date) return '-';
  const now = new Date();
  const diffMins = Math.floor((now - date) / 60000);
  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function truncateText(text, max) {
  if (!text || text.length <= max) return text;
  return text.substring(0, max) + '...';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'circle-exclamation' : 'info-circle'}"></i><span>${message}</span>`;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999',
    background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6',
    color: 'white', padding: '12px 20px', borderRadius: '8px', display: 'flex',
    alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideIn 0.3s ease'
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

function initDocuments() {
  const uploadBtn = document.getElementById('upload-doc-btn');
  const emptyUploadBtn = document.getElementById('empty-upload-btn');
  const fileInput = document.getElementById('file-upload-input');
  const triggerUpload = () => fileInput?.click();
  uploadBtn?.addEventListener('click', triggerUpload);
  emptyUploadBtn?.addEventListener('click', triggerUpload);
  fileInput?.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => uploadDocument(file));
    fileInput.value = '';
  });

  const folderModal = document.getElementById('folder-modal');
  const folderInput = document.getElementById('folder-name-input');
  document.getElementById('new-folder-btn')?.addEventListener('click', () => {
    if (folderModal) { folderModal.style.display = 'flex'; folderInput?.focus(); }
  });
  const closeFolderModal = () => { if (folderModal) folderModal.style.display = 'none'; if (folderInput) folderInput.value = ''; };
  document.getElementById('folder-modal-close')?.addEventListener('click', closeFolderModal);
  document.getElementById('folder-cancel-btn')?.addEventListener('click', closeFolderModal);
  document.getElementById('folder-create-btn')?.addEventListener('click', async () => {
    const name = folderInput?.value.trim();
    if (name) { await createFolder(name); closeFolderModal(); }
  });
  folderInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('folder-create-btn')?.click(); });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      docsState.viewMode = btn.dataset.view;
      renderDocumentsContent();
    });
  });

  document.getElementById('docs-sort-select')?.addEventListener('change', (e) => {
    docsState.sortBy = e.target.value;
    renderDocumentsContent();
  });

  document.querySelectorAll('.docs-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.docs-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      docsState.currentFolder = item.dataset.folder || 'root';
      docsState.currentFilter = item.dataset.type || 'all';
      renderDocumentsContent();
    });
  });

  document.getElementById('docs-search-input')?.addEventListener('input', debounce((e) => {
    docsState.searchQuery = e.target.value;
    renderDocumentsContent();
  }, 300));

  document.getElementById('preview-modal-close')?.addEventListener('click', () => {
    document.getElementById('preview-modal').style.display = 'none';
  });
  document.getElementById('file-delete-btn')?.addEventListener('click', () => {
    if (docsState.selectedFile) deleteDocument(docsState.selectedFile.id);
    document.getElementById('preview-modal').style.display = 'none';
  });
  document.getElementById('file-download-btn')?.addEventListener('click', () => {
    if (docsState.selectedFile) downloadDocument(docsState.selectedFile.id);
  });
}


/* ═══════════════════════════════════════════════════════════
   RECHERCHE GLOBALE
═══════════════════════════════════════════════════════════ */

export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function shouldShowSuggestions(q) {
  return typeof q === 'string' && q.trim().length >= 2;
}

function initGlobalSearch() {
  const input    = document.getElementById('global-search-input');
  const dropdown = document.getElementById('search-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', debounce(async (e) => {
    const q = e.target.value;
    if (!shouldShowSuggestions(q)) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      return;
    }
    const token = q.trim().toLowerCase();
    const [clients, projects, tasks] = await Promise.allSettled([
      searchFirestore('clients', token),
      searchFirestore('projects', token),
      searchFirestore('tasks', token),
    ]);
    renderSuggestions({
      Clients: clients.status  === 'fulfilled' ? clients.value  : [],
      Projets: projects.status === 'fulfilled' ? projects.value : [],
      Tâches:  tasks.status    === 'fulfilled' ? tasks.value    : [],
    }, dropdown);
  }, 300));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) dropdown.classList.remove('open');
  });
}

async function searchFirestore(collectionName, token) {
  const q    = query(collection(db, collectionName), where('searchTokens', 'array-contains', token), limit(5));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: collectionName }));
}

export function renderSuggestions(results, container) {
  if (!container) return;
  const total = Object.values(results).reduce((s, a) => s + a.length, 0);
  if (total === 0) {
    container.innerHTML = '<div class="search-no-result">Aucun résultat pour votre recherche.</div>';
    container.classList.add('open');
    return;
  }
  const sectionMap = { clients: 'clients', projects: 'projets', tasks: 'projets' };
  const iconMap    = { clients: 'fa-users', projects: 'fa-folder', tasks: 'fa-check-square' };
  let html = '';
  for (const [cat, items] of Object.entries(results)) {
    if (!items.length) continue;
    html += `<div class="search-category-label">${cat}</div>`;
    html += items.map(item => {
      const name    = item.name ?? item.title ?? item.email ?? 'Sans titre';
      const icon    = iconMap[item._collection]    ?? 'fa-circle';
      const section = sectionMap[item._collection] ?? 'dashboard';
      return `<div class="search-result-item" data-section="${section}"><i class="fa-solid ${icon}" style="color:var(--accent-color);width:16px;"></i>${escapeHtml(name)}</div>`;
    }).join('');
  }
  container.innerHTML = html;
  container.classList.add('open');
  container.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      container.classList.remove('open');
      renderPageContent(el.dataset.section);
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   SECTION FINANCES — Pilotage financier
═══════════════════════════════════════════════════════════ */

const financesState = {
  metrics: { caMois: 0, caTrimestre: 0, caAnnee: 0, margeBrute: 0, margeNette: 0, resultatExploitation: 0, budgetTotal: 0, depensesEngagees: 0, tresorerie: 0, delaiPaiementMoyen: 0 },
  invoices: [],
  expenses: [],
  budget: { categories: {} },
  currentTab: 'overview'
};

async function loadFinancesData(forceRefresh = false) {
  if (!currentUid) return;
  if (!forceRefresh && dataCache.finances && dataCache.lastFetch.finances && (Date.now() - dataCache.lastFetch.finances) < CACHE_DURATION) {
    Object.assign(financesState, dataCache.finances);
    renderFinancesContent();
    return;
  }
  try {
    const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1, quarter = Math.ceil(month / 3);
    const metricsSnap = await getDoc(doc(db, 'finances', 'metrics', String(year), 'summary'));
    if (metricsSnap.exists()) {
      const d = metricsSnap.data();
      financesState.metrics = {
        caMois: d.monthly?.[month-1]?.revenue || 0, caTrimestre: d.quarterly?.[quarter-1]?.revenue || 0, caAnnee: d.annual?.revenue || 0,
        margeBrute: d.monthly?.[month-1]?.grossMargin || 0, margeNette: d.monthly?.[month-1]?.netMargin || 0,
        resultatExploitation: d.monthly?.[month-1]?.operatingResult || 0, budgetTotal: d.annual?.budget || 0,
        depensesEngagees: d.annual?.spent || 0, tresorerie: d.current?.cashFlow || 0, delaiPaiementMoyen: d.current?.avgPaymentDelay || 0
      };
    }
    const invSnap = await getDocs(query(collection(db, 'invoices'), where('year', '==', year), orderBy('date', 'desc'), limit(50)));
    financesState.invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const expSnap = await getDocs(query(collection(db, 'expenses'), where('year', '==', year), orderBy('date', 'desc'), limit(50)));
    financesState.expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const budSnap = await getDoc(doc(db, 'finances', 'budget', String(year), 'details'));
    if (budSnap.exists()) financesState.budget = budSnap.data();
    dataCache.finances = { ...financesState };
    dataCache.lastFetch.finances = Date.now();
    renderFinancesContent();
  } catch (err) { console.warn('loadFinancesData:', err); showToast('Erreur chargement finances', 'error'); }
}

function renderFinancesContent() {
  const tabContent = document.getElementById('finances-tab-content');
  if (!tabContent) return;
  const activeTab = document.querySelector('.finances-tab.active')?.dataset.tab || 'overview';
  switch (activeTab) {
    case 'overview': tabContent.innerHTML = getFinancesOverviewHTML(); break;
    case 'invoices': tabContent.innerHTML = getFinancesInvoicesHTML(); initInvoicesEvents(); break;
    case 'budget': tabContent.innerHTML = getFinancesBudgetHTML(); initBudgetEvents(); break;
    case 'reports': tabContent.innerHTML = getFinancesReportsHTML(); break;
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION PROJETS — Données & Fonctionnalités
═══════════════════════════════════════════════════════════ */

const projectsState = {
  projects: [],
  tasks: { todo: [], doing: [], review: [], done: [] },
  currentTab: 'liste'
};

async function loadProjectsData(forceRefresh = false) {
  if (!currentUid) return;

  // Check cache first
  if (!forceRefresh && dataCache.projects && dataCache.lastFetch.projects &&
      (Date.now() - dataCache.lastFetch.projects) < CACHE_DURATION) {
    projectsState.projects = dataCache.projects;
    // Still need to load tasks as they're user-specific
  }

  try {
    // Load projects if not cached
    if (!projectsState.projects.length || forceRefresh) {
      const projectsQuery = query(collection(db, 'projects'), limit(50));
      const projectsSnap = await getDocs(projectsQuery);
      projectsState.projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      dataCache.projects = projectsState.projects;
      dataCache.lastFetch.projects = Date.now();
    }

    // Load tasks (always user-specific, not cached)
    const tasksQuery = query(collection(db, 'tasks'), where('assignees', 'array-contains', currentUid), limit(100));
    const tasksSnap = await getDocs(tasksQuery);
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Organize tasks by status
    projectsState.tasks = {
      todo: tasks.filter(t => t.status === 'todo'),
      doing: tasks.filter(t => t.status === 'doing'),
      review: tasks.filter(t => t.status === 'review'),
      done: tasks.filter(t => t.status === 'done')
    };

    // Update UI if on projects page
    const tabContent = document.getElementById('tab-content');
    const subtitle = document.getElementById('projects-subtitle');
    if (subtitle) subtitle.textContent = `${projectsState.projects.length} projet${projectsState.projects.length > 1 ? 's' : ''}`;
    if (tabContent && document.querySelector('.projects-tabs')) {
      renderProjectsContent();
    }
  } catch (err) {
    console.warn('loadProjectsData:', err);
  }
}

function renderProjectsContent() {
  const tabContent = document.getElementById('tab-content');
  const activeTab = document.querySelector('.projects-tab.active')?.dataset.tab || 'liste';

  if (!tabContent) return;

  switch (activeTab) {
    case 'liste':
      tabContent.innerHTML = getListeHTML();
      break;
    case 'kanban':
      tabContent.innerHTML = getKanbanHTML();
      break;
    case 'gantt':
      tabContent.innerHTML = getGanttHTML();
      break;
  }
}

// ── HTML de la page Projets ──────────────────────────────────────────────────

function getProjectsHTML() {
  return `
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Rechercher un projet…">
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="Notifications">
          <i class="fa-regular fa-bell"></i>
          <span class="notif-dot"></span>
        </button>
        <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32" class="header-avatar" id="header-avatar">
      </div>
    </div>

    <div class="page-body">
      <div class="page-title-row">
        <div>
          <h1 class="page-title">Projets</h1>
          <p class="page-subtitle" id="projects-subtitle">Chargement...</p>
        </div>
        <button class="btn-new-project" id="btn-open-project-modal">
          <i class="fa-solid fa-plus"></i>
          Nouveau projet
        </button>
      </div>

      <!-- Onglets -->
      <div class="projects-tabs">
        <button class="projects-tab active" data-tab="liste">
          <i class="fa-solid fa-list"></i> Liste
        </button>
        <button class="projects-tab" data-tab="kanban">
          <i class="fa-solid fa-table-columns"></i> Kanban
        </button>
        <button class="projects-tab" data-tab="gantt">
          <i class="fa-solid fa-chart-gantt"></i> Gantt
        </button>
      </div>

      <!-- Contenu des onglets -->
      <div id="tab-content">
        ${getListeHTML()}
      </div>
    </div>
  `;
}

// ── Vue Liste ────────────────────────────────────────────────────────────────

function getListeHTML() {
  const projects = projectsState.projects;
  if (projects.length === 0) {
    return `<div class="project-list-card"><div class="section-placeholder"><i class="fa-solid fa-folder-open"></i><p>Aucun projet. Créez votre premier projet pour commencer.</p></div></div>`;
  }
  const rows = projects.map(p => {
    const statusLabel = { en_avance: 'En avance', a_temps: 'À temps', en_retard: 'En retard' }[p.status] ?? p.status;
    const statusClass = { en_avance: 'status-ahead', a_temps: 'status-ontime', en_retard: 'status-late' }[p.status] ?? '';
    const totalTasks  = (p.tasks?.todo || 0) + (p.tasks?.doing || 0) + (p.tasks?.done || 0);
    const doneTasks = p.tasks?.done || 0;

    return `
      <tr class="project-row">
        <td>
          <div class="project-name-cell">
            <span class="project-color-dot" style="background:${projectColor(p.id)};"></span>
            <span class="project-name">${escapeHtml(p.name)}</span>
          </div>
        </td>
        <td class="td-secondary">${escapeHtml(p.client)}</td>
        <td><span class="project-status-badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <div class="progress-cell">
            <div class="progress-track">
              <div class="progress-fill" style="width:${p.progress}%; background:${progressColor(p.status)};"></div>
            </div>
            <span class="progress-pct">${p.progress}%</span>
          </div>
        </td>
        <td class="td-secondary">${p.lead}</td>
        <td class="td-secondary">${formatDate(p.endDate)}</td>
        <td class="td-secondary">${doneTasks}/${totalTasks} tâches</td>
      </tr>`;
  }).join('');

  return `
    <div class="project-list-card">
      <table class="project-table">
        <thead>
          <tr>
            <th>Projet</th>
            <th>Client</th>
            <th>Statut</th>
            <th>Avancement</th>
            <th>Responsable</th>
            <th>Échéance</th>
            <th>Tâches</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Vue Kanban ───────────────────────────────────────────────────────────────

function getKanbanHTML() {
  const tasks = projectsState.tasks;
  const cols = [
    { key: 'todo',   label: 'À faire',     color: '#94a3b8', count: tasks.todo.length },
    { key: 'doing',  label: 'En cours',    color: '#4f46e5', count: tasks.doing.length },
    { key: 'review', label: 'En révision', color: '#f59e0b', count: tasks.review.length },
    { key: 'done',   label: 'Terminé',     color: '#10b981', count: tasks.done.length },
  ];

  const columns = cols.map(col => {
    const cards = (tasks[col.key] ?? []).map(t => `
      <div class="kanban-card">
        <div class="kanban-card-top">
          <span class="kanban-priority ${t.priority}">${priorityLabel(t.priority)}</span>
        </div>
        <p class="kanban-card-title">${escapeHtml(t.title)}</p>
        <p class="kanban-card-project">${escapeHtml(t.projectName || t.project || '')}</p>
        <div class="kanban-card-footer">
          <div class="kanban-assignee" title="${t.assignee}">${t.assignee}</div>
        </div>
      </div>`).join('');

    return `
      <div class="kanban-column">
        <div class="kanban-col-header">
          <div class="kanban-col-title">
            <span class="kanban-col-dot" style="background:${col.color};"></span>
            ${col.label}
          </div>
          <span class="kanban-col-count">${col.count}</span>
        </div>
        <div class="kanban-cards">${cards}</div>
      </div>`;
  }).join('');

  return `<div class="kanban-board">${columns}</div>`;
}

// ── Vue Gantt ────────────────────────────────────────────────────────────────

function getGanttHTML() {
  const projects = projectsState.projects;
  if (projects.length === 0) {
    return `<div class="section-placeholder"><i class="fa-solid fa-chart-gantt"></i><p>Aucun projet à afficher sur le diagramme de Gantt.</p></div>`;
  }

  // Calculer la fenêtre temporelle basée sur les projets réels
  const today     = new Date();
  const dates     = projects.map(p => new Date(p.startDate)).filter(d => !isNaN(d));
  const startRef  = dates.length > 0 ? new Date(Math.min(...dates)) : new Date();
  startRef.setDate(startRef.getDate() - 7); // Marge avant
  const endDates  = projects.map(p => new Date(p.endDate)).filter(d => !isNaN(d));
  const maxEnd    = endDates.length > 0 ? new Date(Math.max(...endDates)) : new Date();
  maxEnd.setDate(maxEnd.getDate() + 14); // Marge après
  const totalDays = Math.max(30, Math.round((maxEnd - startRef) / 86400000));

  // Génération des semaines pour l'en-tête
  const weekHeaders = [];
  for (let i = 0; i < totalDays; i += 7) {
    const d = new Date(startRef);
    d.setDate(d.getDate() + i);
    weekHeaders.push(`<div class="gantt-week-label">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>`);
  }

  // Indicateur "aujourd'hui"
  const todayOffset = Math.max(0, Math.round((today - startRef) / 86400000));
  const todayPct    = Math.min(100, (todayOffset / totalDays) * 100);

  const rows = projects.map(p => {
    const start    = p.startDate ? new Date(p.startDate) : new Date();
    const end      = p.endDate ? new Date(p.endDate) : new Date();
    const offsetD  = Math.max(0, Math.round((start - startRef) / 86400000));
    const durationD = Math.max(1, Math.round((end - start) / 86400000));
    const leftPct  = (offsetD / totalDays) * 100;
    const widthPct = Math.min((durationD / totalDays) * 100, 100 - leftPct);
    const barColor = progressColor(p.status);
    const progress = p.progress || 0;

    return `
      <div class="gantt-row">
        <div class="gantt-row-label">
          <span class="project-color-dot" style="background:${projectColor(p.id)};"></span>
          <span class="gantt-row-name">${escapeHtml(p.name)}</span>
        </div>
        <div class="gantt-row-bar-area">
          <div class="gantt-today-line" style="left:${todayPct.toFixed(1)}%;"></div>
          <div class="gantt-bar" style="left:${leftPct.toFixed(1)}%; width:${widthPct.toFixed(1)}%; background:${barColor};">
            <span class="gantt-bar-label">${progress}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="gantt-wrapper">
      <div class="gantt-container">
        <div class="gantt-labels-col">
          <div class="gantt-header-spacer"></div>
          ${projects.map(p => `
            <div class="gantt-row-label-only">
              <span class="project-color-dot" style="background:${projectColor(p.id)};"></span>
              <span class="gantt-row-name">${escapeHtml(p.name)}</span>
            </div>`).join('')}
        </div>
        <div class="gantt-chart-col">
          <div class="gantt-weeks-header">${weekHeaders.join('')}</div>
          ${projects.map(p => {
            const start    = p.startDate ? new Date(p.startDate) : new Date();
            const end      = p.endDate ? new Date(p.endDate) : new Date();
            const offsetD  = Math.max(0, Math.round((start - startRef) / 86400000));
            const durationD = Math.max(1, Math.round((end - start) / 86400000));
            const leftPct  = (offsetD / totalDays) * 100;
            const widthPct = Math.min((durationD / totalDays) * 100, 100 - leftPct);
            const barColor = progressColor(p.status);
            const progress = p.progress || 0;
            return `
              <div class="gantt-bar-row">
                <div class="gantt-today-line" style="left:${todayPct.toFixed(1)}%;"></div>
                <div class="gantt-bar" style="left:${leftPct.toFixed(1)}%; width:${widthPct.toFixed(1)}%; background:${barColor};" title="${escapeHtml(p.name)} · ${formatDate(p.startDate)} → ${formatDate(p.endDate)}">
                  <span class="gantt-bar-label">${progress}%</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function projectColor(id) {
  const palette = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#a78bfa'];
  const idx = parseInt(id.replace(/\D/g, ''), 10) % palette.length;
  return palette[idx] ?? '#4f46e5';
}

function progressColor(status) {
  return { en_avance: '#10b981', a_temps: '#4f46e5', en_retard: '#ef4444' }[status] ?? '#4f46e5';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function priorityLabel(p) {
  return { high: 'Haute', medium: 'Moyenne', low: 'Basse' }[p] ?? p;
}

// ── Init onglets ─────────────────────────────────────────────────────────────

function initProjectsTabs() {
  // Bouton "Nouveau projet" → ouvre le modal
  const btnModal = document.getElementById('btn-open-project-modal');
  if (btnModal) btnModal.addEventListener('click', openProjectModal);

  document.querySelectorAll('.projects-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.projects-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      const content = document.getElementById('tab-content');
      if (!content) return;

      content.style.opacity = '0';
      setTimeout(() => {
        if (tab === 'liste')  content.innerHTML = getListeHTML();
        if (tab === 'kanban') content.innerHTML = getKanbanHTML();
        if (tab === 'gantt')  content.innerHTML = getGanttHTML();
        content.style.opacity = '1';
      }, 120);
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   MODAL CRÉATION PROJET
═══════════════════════════════════════════════════════════ */

async function openProjectModal() {
  // Supprimer un modal existant
  document.getElementById('project-modal-overlay')?.remove();

  // Ensure clients are loaded
  if (clientsState.clients.length === 0) {
    await loadClientsData();
  }

  const clientOptions = clientsState.clients.map(c =>
    `<option value="${c.id}">${escapeHtml(c.company || `${c.firstName} ${c.lastName}`)}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'project-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">Nouveau projet</h3>
        <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Nom du projet <span class="required">*</span></label>
          <input type="text" id="pm-name" placeholder="Ex : Refonte Site Web">
        </div>
        <div class="form-group">
          <label>Client <span class="required">*</span></label>
          <select id="pm-client">
            <option value="">— Sélectionner un client —</option>
            ${clientOptions}
          </select>
          <div class="field-hint">Le projet sera visible dans la fiche du client sélectionné.</div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Date de début <span class="required">*</span></label>
            <input type="date" id="pm-start">
          </div>
          <div class="form-group">
            <label>Date de fin <span class="required">*</span></label>
            <input type="date" id="pm-end">
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Statut</label>
            <select id="pm-status">
              <option value="a_temps">À temps</option>
              <option value="en_avance">En avance</option>
              <option value="en_retard">En retard</option>
            </select>
          </div>
          <div class="form-group">
            <label>Responsable</label>
            <input type="text" id="pm-lead" placeholder="Ex : Lucas M.">
          </div>
        </div>
        <div id="pm-error" class="modal-error" style="display:none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" id="modal-cancel-btn">Annuler</button>
        <button class="btn-primary-sm" id="modal-save-btn">
          <i class="fa-solid fa-plus"></i> Créer le projet
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Fermeture
  const close = () => overlay.remove();
  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('modal-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Sauvegarde
  document.getElementById('modal-save-btn').addEventListener('click', async () => {
    const name   = document.getElementById('pm-name').value.trim();
    const client = document.getElementById('pm-client').value;
    const start  = document.getElementById('pm-start').value;
    const end    = document.getElementById('pm-end').value;
    const status = document.getElementById('pm-status').value;
    const lead   = document.getElementById('pm-lead').value.trim();
    const errEl  = document.getElementById('pm-error');

    if (!name)   { errEl.textContent = 'Le nom du projet est requis.';   errEl.style.display='block'; return; }
    if (!client) { errEl.textContent = 'Vous devez sélectionner un client.'; errEl.style.display='block'; return; }
    if (!start)  { errEl.textContent = 'La date de début est requise.';  errEl.style.display='block'; return; }
    if (!end)    { errEl.textContent = 'La date de fin est requise.';    errEl.style.display='block'; return; }
    if (end < start) { errEl.textContent = 'La date de fin doit être après la date de début.'; errEl.style.display='block'; return; }

    try {
      const clientObj = clientsState.clients.find(c => c.id === client);
      const projectData = {
        name,
        client: clientObj ? (clientObj.company || `${clientObj.firstName} ${clientObj.lastName}`) : client,
        clientId: client,
        status,
        progress: 0,
        startDate: start,
        endDate: end,
        lead: lead || '—',
        tasks: { todo: 0, doing: 0, done: 0 },
        createdBy: currentUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'projects'), projectData);
      showToast('Projet créé avec succès', 'success');

      close();
      invalidateCache('projects');
      await loadProjectsData(true); // Force refresh
      renderProjectsContent();
      document.querySelectorAll('.projects-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'liste'));
    } catch (err) {
      console.error('Erreur création projet:', err);
      errEl.textContent = 'Erreur lors de la création du projet';
      errEl.style.display = 'block';
    }
  });
}


/* ═══════════════════════════════════════════════════════════
   SECTION CLIENTS — Données & Fonctionnalités
═══════════════════════════════════════════════════════════ */

const clientsState = {
  clients: [],
  selectedId: null
};

async function loadClientsData(forceRefresh = false) {
  if (!currentUid) return;

  // Check cache first
  if (!forceRefresh && dataCache.clients && dataCache.lastFetch.clients &&
      (Date.now() - dataCache.lastFetch.clients) < CACHE_DURATION) {
    clientsState.clients = dataCache.clients;
    // Update UI with cached data
    const clientsList = document.getElementById('clients-list');
    if (clientsList) {
      clientsList.innerHTML = renderClientListItems(clientsState.clients);
      const countEl = document.getElementById('clients-count');
      if (countEl) countEl.textContent = clientsState.clients.length;
    }
    return;
  }

  try {
    const q = query(collection(db, 'clients'), limit(100));
    const snap = await getDocs(q);
    clientsState.clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    dataCache.clients = clientsState.clients;
    dataCache.lastFetch.clients = Date.now();

    // Update UI if on clients page
    const clientsList = document.getElementById('clients-list');
    if (clientsList) {
      clientsList.innerHTML = renderClientListItems(clientsState.clients);
      const countEl = document.getElementById('clients-count');
      if (countEl) countEl.textContent = clientsState.clients.length;

      // Select first client if none selected
      if (!clientsState.selectedId && clientsState.clients.length > 0) {
        clientsState.selectedId = clientsState.clients[0].id;
        renderClientDetail(clientsState.selectedId);
      }
    }
  } catch (err) {
    console.warn('loadClientsData:', err);
  }
}

let selectedClientId = null;

// ── HTML de la page Clients ──────────────────────────────────────────────────

function getClientsHTML() {
  return `
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="client-search-input" placeholder="Rechercher un client…">
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn"><i class="fa-regular fa-bell"></i><span class="notif-dot"></span></button>
        <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32" class="header-avatar">
      </div>
    </div>

    <div class="clients-layout">

      <!-- Liste des clients -->
      <div class="clients-sidebar">
        <div class="clients-sidebar-header">
          <span class="clients-sidebar-title">Clients <span class="clients-count" id="clients-count">0</span></span>
          <button class="btn-icon" id="btn-new-client" title="Nouveau client">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
        <div class="clients-list" id="clients-list">
          <div class="clients-list-empty">Chargement...</div>
        </div>
      </div>

      <!-- Fiche client -->
      <div class="client-detail" id="client-detail">
        <div class="client-detail-empty">
          <i class="fa-solid fa-user-tie"></i>
          <p>Sélectionnez un client pour voir sa fiche</p>
        </div>
      </div>

    </div>
  `;
}

function renderClientListItems(clients) {
  if (clients.length === 0) {
    return '<div class="clients-list-empty">Aucun client trouvé</div>';
  }
  return clients.map(c => `
    <div class="client-list-item ${c.id === selectedClientId ? 'active' : ''}" data-client-id="${c.id}">
      <div class="client-list-avatar" style="background:${c.color}20; color:${c.color};">
        ${(c.company || c.firstName).charAt(0).toUpperCase()}
      </div>
      <div class="client-list-info">
        <p class="client-list-name">${escapeHtml(c.company || `${c.firstName} ${c.lastName}`)}</p>
        <p class="client-list-sub">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</p>
      </div>
    </div>
  `).join('');
}

function renderClientDetail(clientId) {
  const c = clientsState.clients.find(x => x.id === clientId);
  if (!c) return;

  const clientProjects = projectsState.projects.filter(p => p.clientId === clientId || p.client === (c.company || `${c.firstName} ${c.lastName}`));

  const projectsHTML = clientProjects.length === 0
    ? `<p class="client-no-projects">Aucun projet associé à ce client.</p>`
    : clientProjects.map(p => {
        const statusLabel = { en_avance: 'En avance', a_temps: 'À temps', en_retard: 'En retard' }[p.status] ?? p.status;
        const statusClass = { en_avance: 'status-ahead', a_temps: 'status-ontime', en_retard: 'status-late' }[p.status] ?? '';
        return `
          <div class="client-project-card">
            <div class="client-project-card-header">
              <span class="project-color-dot" style="background:${projectColor(p.id)};"></span>
              <span class="client-project-name">${escapeHtml(p.name)}</span>
              <span class="project-status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="progress-cell" style="margin-top:10px;">
              <div class="progress-track">
                <div class="progress-fill" style="width:${p.progress}%; background:${progressColor(p.status)};"></div>
              </div>
              <span class="progress-pct">${p.progress}%</span>
            </div>
            <div class="client-project-meta">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.startDate)} → ${formatDate(p.endDate)}</span>
              <span><i class="fa-solid fa-user"></i> ${escapeHtml(p.lead)}</span>
            </div>
          </div>`;
      }).join('');

  const detail = document.getElementById('client-detail');
  if (!detail) return;

  detail.innerHTML = `
    <div class="client-fiche">

      <!-- En-tête fiche -->
      <div class="client-fiche-header">
        <div class="client-fiche-avatar" style="background:${c.color}20; color:${c.color};">
          ${(c.company || c.firstName).charAt(0).toUpperCase()}
        </div>
        <div class="client-fiche-title">
          <h2>${escapeHtml(c.company || `${c.firstName} ${c.lastName}`)}</h2>
          <p>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</p>
        </div>
        <div class="client-fiche-actions">
          <button class="btn-ghost-sm" id="btn-edit-client" data-id="${c.id}">
            <i class="fa-solid fa-pen"></i> Modifier
          </button>
          <button class="btn-ghost-sm danger" id="btn-delete-client" data-id="${c.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <!-- Infos de contact -->
      <div class="client-fiche-section">
        <h4 class="client-fiche-section-title">Informations</h4>
        <div class="client-info-grid">
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-user"></i> Prénom</span>
            <span class="client-info-value">${escapeHtml(c.firstName)}</span>
          </div>
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-user"></i> Nom</span>
            <span class="client-info-value">${escapeHtml(c.lastName)}</span>
          </div>
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-building"></i> Entreprise</span>
            <span class="client-info-value">${escapeHtml(c.company || '—')}</span>
          </div>
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-envelope"></i> Email</span>
            <a href="mailto:${escapeHtml(c.email)}" class="client-info-link">${escapeHtml(c.email)}</a>
          </div>
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-phone"></i> Téléphone</span>
            <span class="client-info-value">${escapeHtml(c.phone || '—')}</span>
          </div>
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-id-card"></i> SIRET</span>
            <span class="client-info-value">${escapeHtml(c.siret || '—')}</span>
          </div>
          <div class="client-info-item">
            <span class="client-info-label"><i class="fa-solid fa-briefcase"></i> Responsable projet</span>
            <span class="client-info-value">${escapeHtml(c.projectManager || '—')}</span>
          </div>
        </div>
      </div>

      <!-- Projets associés -->
      <div class="client-fiche-section">
        <div class="client-fiche-section-header">
          <h4 class="client-fiche-section-title">Projets associés <span class="clients-count">${clientProjects.length}</span></h4>
          <button class="btn-ghost-sm" id="btn-new-project-for-client" data-client-id="${c.id}">
            <i class="fa-solid fa-plus"></i> Nouveau projet
          </button>
        </div>
        <div class="client-projects-list">${projectsHTML}</div>
      </div>

    </div>
  `;

  // Modifier client
  document.getElementById('btn-edit-client')?.addEventListener('click', () => openClientModal(c.id));

  // Supprimer client
  document.getElementById('btn-delete-client')?.addEventListener('click', async () => {
    if (confirm(`Supprimer le client "${c.company || c.firstName + ' ' + c.lastName}" ?`)) {
      try {
        await deleteDoc(doc(db, 'clients', c.id));
        invalidateCache('clients');
        await loadClientsData(true);
        selectedClientId = null;
        document.getElementById('client-detail').innerHTML = `<div class="client-detail-empty"><i class="fa-solid fa-user-tie"></i><p>Sélectionnez un client pour voir sa fiche</p></div>`;
        showToast('Client supprimé', 'success');
      } catch (err) {
        console.error('Erreur suppression client:', err);
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  });

  // Nouveau projet pour ce client
  document.getElementById('btn-new-project-for-client')?.addEventListener('click', () => {
    renderPageContent('projets').then(() => {
      setTimeout(() => openProjectModalForClient(c.id), 200);
    });
  });
}

function initClientsSection() {
  // Clic sur un client
  document.getElementById('clients-list')?.addEventListener('click', e => {
    const item = e.target.closest('.client-list-item');
    if (!item) return;
    selectedClientId = item.dataset.clientId;
    document.querySelectorAll('.client-list-item').forEach(el => el.classList.toggle('active', el.dataset.clientId === selectedClientId));
    renderClientDetail(selectedClientId);
  });

  // Nouveau client
  document.getElementById('btn-new-client')?.addEventListener('click', () => openClientModal(null));

  // Recherche
  document.getElementById('client-search-input')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = clientsState.clients.filter(c =>
      `${c.firstName} ${c.lastName} ${c.company} ${c.email}`.toLowerCase().includes(q)
    );
    document.getElementById('clients-list').innerHTML = renderClientListItems(filtered);
    document.getElementById('clients-count').textContent = filtered.length;
  });

  // Load clients data
  loadClientsData();
}

function openClientModal(clientId) {
  const existing = clientId ? clientsState.clients.find(c => c.id === clientId) : null;
  document.getElementById('client-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'client-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${existing ? 'Modifier le client' : 'Nouveau client'}</h3>
        <button class="modal-close" id="cm-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-row-2">
          <div class="form-group">
            <label>Prénom <span class="required">*</span></label>
            <input type="text" id="cm-firstname" placeholder="Marie" value="${escapeHtml(existing?.firstName ?? '')}">
          </div>
          <div class="form-group">
            <label>Nom <span class="required">*</span></label>
            <input type="text" id="cm-lastname" placeholder="Dupont" value="${escapeHtml(existing?.lastName ?? '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Entreprise</label>
          <input type="text" id="cm-company" placeholder="Nom de la société" value="${escapeHtml(existing?.company ?? '')}">
        </div>
        <div class="form-group">
          <label>Adresse email <span class="required">*</span></label>
          <input type="email" id="cm-email" placeholder="contact@entreprise.fr" value="${escapeHtml(existing?.email ?? '')}">
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Téléphone</label>
            <input type="tel" id="cm-phone" placeholder="06 00 00 00 00" value="${escapeHtml(existing?.phone ?? '')}">
          </div>
          <div class="form-group">
            <label>SIRET <span class="optional">(facultatif)</span></label>
            <input type="text" id="cm-siret" placeholder="000 000 000 00000" value="${escapeHtml(existing?.siret ?? '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Responsable projet</label>
          <input type="text" id="cm-pm" placeholder="Ex : Lucas Martin" value="${escapeHtml(existing?.projectManager ?? '')}">
        </div>
        <div id="cm-error" class="modal-error" style="display:none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" id="cm-cancel">Annuler</button>
        <button class="btn-primary-sm" id="cm-save">
          <i class="fa-solid fa-check"></i> ${existing ? 'Enregistrer' : 'Créer le client'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('cm-close').addEventListener('click', close);
  document.getElementById('cm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('cm-save').addEventListener('click', async () => {
    const firstName = document.getElementById('cm-firstname').value.trim();
    const lastName  = document.getElementById('cm-lastname').value.trim();
    const email     = document.getElementById('cm-email').value.trim();
    const errEl     = document.getElementById('cm-error');

    if (!firstName) { errEl.textContent = 'Le prénom est requis.'; errEl.style.display='block'; return; }
    if (!lastName)  { errEl.textContent = 'Le nom est requis.';    errEl.style.display='block'; return; }
    if (!email)     { errEl.textContent = 'L\'email est requis.';  errEl.style.display='block'; return; }

    const colors = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#a78bfa','#ef4444'];

    try {
      const clientData = {
        firstName,
        lastName,
        company:        document.getElementById('cm-company').value.trim(),
        email,
        phone:          document.getElementById('cm-phone').value.trim(),
        siret:          document.getElementById('cm-siret').value.trim(),
        projectManager: document.getElementById('cm-pm').value.trim(),
        updatedAt: serverTimestamp()
      };

      if (existing) {
        await updateDoc(doc(db, 'clients', clientId), clientData);
        showToast('Client mis à jour', 'success');
      } else {
        clientData.color = colors[clientsState.clients.length % colors.length];
        clientData.createdAt = serverTimestamp();
        const newClientRef = await addDoc(collection(db, 'clients'), clientData);
        selectedClientId = newClientRef.id;
        showToast('Client créé', 'success');
      }

      close();
      invalidateCache('clients');
      await loadClientsData(true);

      // Select the client
      document.querySelectorAll('.client-list-item').forEach(el => el.classList.toggle('active', el.dataset.clientId === selectedClientId));
      renderClientDetail(selectedClientId);
    } catch (err) {
      console.error('Erreur sauvegarde client:', err);
      errEl.textContent = 'Erreur lors de la sauvegarde';
      errEl.style.display = 'block';
    }
  });
}

function openProjectModalForClient(clientId) {
  openProjectModal();
  setTimeout(() => {
    const sel = document.getElementById('pm-client');
    if (sel) sel.value = clientId;
  }, 50);
}


/* ═══════════════════════════════════════════════════════════
   SECTION MESSAGERIE — En développement
═══════════════════════════════════════════════════════════ */

let activeConvId = null;

async function loadMessagerieData() {
  // Messaging module is in development
  // This will load real conversations from Firestore when implemented
}

function getMessagerieHTML() {
  return `
    <div class="page-header">
      <div class="header-actions" style="margin-left:auto;">
        <button class="header-btn" title="Notifications">
          <i class="fa-regular fa-bell"></i>
          <span class="notif-dot"></span>
        </button>
        <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32" class="header-avatar" id="header-avatar">
      </div>
    </div>
    <div class="page-body">
      <div class="page-title-row">
        <div>
          <h1 class="page-title">Messagerie</h1>
          <p class="page-subtitle">Communiquez avec votre équipe</p>
        </div>
      </div>
      <div class="card col-12">
        <div class="section-placeholder">
          <i class="fa-solid fa-comments"></i>
          <p>La messagerie interne sera disponible dans une prochaine mise à jour.</p>
          <p style="font-size:13px;color:var(--text-muted);margin-top:8px;">Utilisez les commentaires sur les projets et tâches en attendant.</p>
        </div>
      </div>
    </div>
  `;
}

function renderConvList(convs) {
  return convs.map(conv => {
    const user = DEMO_TEAM.find(u => u.id === conv.userId);
    const statusColor = { disponible: '#10b981', en_pause: '#f59e0b', indisponible: '#ef4444' }[user?.status] ?? '#94a3b8';
    return `
      <div class="msg-conv-item ${conv.id === activeConvId ? 'active' : ''}" data-conv-id="${conv.id}">
        <div class="msg-conv-avatar" style="background:${user?.color}20; color:${user?.color};">
          ${user?.initials}
          <span class="msg-conv-dot" style="background:${statusColor};"></span>
        </div>
        <div class="msg-conv-body">
          <div class="msg-conv-top">
            <span class="msg-conv-name">${user?.name ?? '—'}</span>
            <span class="msg-conv-time">${conv.lastTime}</span>
          </div>
          <p class="msg-conv-preview">${escapeHtml(conv.lastMsg)}</p>
        </div>
        ${conv.unread > 0 ? `<span class="msg-unread-badge">${conv.unread}</span>` : ''}
      </div>`;
  }).join('');
}

function openConversation(convId) {
  activeConvId = convId;
  const conv = DEMO_CONVS.find(c => c.id === convId);
  const user = DEMO_TEAM.find(u => u.id === conv?.userId);
  if (!conv || !user) return;

  conv.unread = 0;
  document.querySelectorAll('.msg-conv-item').forEach(el => el.classList.toggle('active', el.dataset.convId === convId));
  // Recalculer le badge total
  const totalUnread = DEMO_CONVS.reduce((s,c) => s + c.unread, 0);
  const badge = document.querySelector('.msg-unread-total');
  if (badge) badge.textContent = totalUnread > 0 ? totalUnread : '';

  const statusColor = { disponible: '#10b981', en_pause: '#f59e0b', indisponible: '#ef4444' }[user.status] ?? '#94a3b8';
  const statusLabel = { disponible: 'Disponible', en_pause: 'En pause', indisponible: 'Indisponible' }[user.status] ?? user.status;

  const chatCol = document.getElementById('msg-chat-col');
  if (!chatCol) return;

  const messagesHTML = conv.messages.map(m => {
    const isMe = m.from === 'me';
    return `
      <div class="msg-bubble-row ${isMe ? 'me' : 'other'}">
        ${!isMe ? `<div class="msg-bubble-avatar" style="background:${user.color}20;color:${user.color};">${user.initials}</div>` : ''}
        <div class="msg-bubble ${isMe ? 'bubble-me' : 'bubble-other'}">
          <p>${escapeHtml(m.text)}</p>
          <span class="msg-bubble-time">${m.time}</span>
        </div>
      </div>`;
  }).join('');

  chatCol.innerHTML = `
    <div class="msg-chat-header">
      <div class="msg-chat-header-left">
        <div class="msg-chat-avatar" style="background:${user.color}20; color:${user.color};">${user.initials}</div>
        <div>
          <p class="msg-chat-name">${user.name}</p>
          <p class="msg-chat-role">${user.role} · <span style="color:${statusColor};">${statusLabel}</span></p>
        </div>
      </div>
      <div class="msg-chat-actions">
        <button class="header-btn" title="Appel vidéo"><i class="fa-solid fa-video"></i></button>
        <button class="header-btn" title="Infos"><i class="fa-solid fa-circle-info"></i></button>
      </div>
    </div>
    <div class="msg-messages" id="msg-messages">
      ${messagesHTML}
    </div>
    <div class="msg-input-area">
      <input type="text" id="msg-input" class="msg-input" placeholder="Écrire un message…">
      <button class="msg-send-btn" id="msg-send-btn">
        <i class="fa-solid fa-paper-plane"></i>
      </button>
    </div>
  `;

  // Scroll en bas
  const messagesEl = document.getElementById('msg-messages');
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;

  // Envoi de message
  const sendMsg = () => {
    const input = document.getElementById('msg-input');
    const text = input?.value.trim();
    if (!text) return;
    conv.messages.push({ from: 'me', text, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
    conv.lastMsg = text;
    conv.lastTime = 'Maintenant';
    input.value = '';
    // Re-render les messages
    const msgs = document.getElementById('msg-messages');
    if (msgs) {
      msgs.innerHTML = conv.messages.map(m => {
        const isMe = m.from === 'me';
        return `
          <div class="msg-bubble-row ${isMe ? 'me' : 'other'}">
            ${!isMe ? `<div class="msg-bubble-avatar" style="background:${user.color}20;color:${user.color};">${user.initials}</div>` : ''}
            <div class="msg-bubble ${isMe ? 'bubble-me' : 'bubble-other'}">
              <p>${escapeHtml(m.text)}</p>
              <span class="msg-bubble-time">${m.time}</span>
            </div>
          </div>`;
      }).join('');
      msgs.scrollTop = msgs.scrollHeight;
    }
    // Mettre à jour la liste des convs
    document.getElementById('msg-convs-list').innerHTML = renderConvList(DEMO_CONVS);
    attachConvClicks();
  };

  document.getElementById('msg-send-btn')?.addEventListener('click', sendMsg);
  document.getElementById('msg-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
}

function attachConvClicks() {
  document.querySelectorAll('.msg-conv-item').forEach(el => {
    el.addEventListener('click', () => openConversation(el.dataset.convId));
  });
}

function initMessagerie() {
  attachConvClicks();

  // Recherche dans les conversations
  document.getElementById('msg-search-input')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = DEMO_CONVS.filter(conv => {
      const user = DEMO_TEAM.find(u => u.id === conv.userId);
      return user?.name.toLowerCase().includes(q) || conv.lastMsg.toLowerCase().includes(q);
    });
    document.getElementById('msg-convs-list').innerHTML = renderConvList(filtered);
    attachConvClicks();
  });

  // Clic sur membre équipe → ouvrir sa conversation
  document.querySelectorAll('.msg-team-item').forEach(el => {
    el.addEventListener('click', () => {
      const userId = el.dataset.userId;
      const conv = DEMO_CONVS.find(c => c.userId === userId);
      if (conv) {
        document.getElementById('msg-convs-list').innerHTML = renderConvList(DEMO_CONVS);
        attachConvClicks();
        openConversation(conv.id);
      }
    });
  });

  // Ouvrir la première conversation
  if (DEMO_CONVS.length > 0) openConversation(DEMO_CONVS[0].id);
}


/* ═══════════════════════════════════════════════════════════
   SECTION UTILISATEURS (ADMIN)
═══════════════════════════════════════════════════════════ */

const usersState = {
  users: [],
  selectedId: null
};

let selectedUserId = null;

async function loadUsersData(forceRefresh = false) {
  if (!currentUid || currentRole !== 'admin') return;

  // Check cache first
  if (!forceRefresh && dataCache.users && dataCache.lastFetch.users &&
      (Date.now() - dataCache.lastFetch.users) < CACHE_DURATION) {
    usersState.users = dataCache.users;
    // Update UI with cached data
    const usersList = document.getElementById('users-list');
    if (usersList) {
      usersList.innerHTML = renderUserListItems(usersState.users);
      updateUserStats();
    }
    return;
  }

  try {
    const q = query(collection(db, 'users'), limit(100));
    const snap = await getDocs(q);
    usersState.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    dataCache.users = usersState.users;
    dataCache.lastFetch.users = Date.now();

    // Update UI if on users page
    const usersList = document.getElementById('users-list');
    if (usersList) {
      usersList.innerHTML = renderUserListItems(usersState.users);
      updateUserStats();

      if (!selectedUserId && usersState.users.length > 0) {
        selectedUserId = usersState.users[0].id;
        document.querySelectorAll('.users-list-item').forEach(el => el.classList.toggle('active', el.dataset.userId === selectedUserId));
        renderUserDetail(selectedUserId);
      }
    }
  } catch (err) {
    console.warn('loadUsersData:', err);
  }
}

// ── HTML principal ───────────────────────────────────────────────────────────

function getUsersAdminHTML() {
  const adminCount    = usersState.users.filter(u => u.role === 'admin').length;
  const employeeCount = usersState.users.filter(u => u.role === 'employee').length;

  return `
    <div class="page-header">
      <div class="search-wrapper">
        <div class="search-bar">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="users-search-input" placeholder="Rechercher un utilisateur…">
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn"><i class="fa-regular fa-bell"></i><span class="notif-dot"></span></button>
        <img src="https://ui-avatars.com/api/?name=U&background=4f46e5&color=fff&size=32" class="header-avatar">
      </div>
    </div>

    <div class="users-admin-layout">

      <!-- Colonne gauche : liste -->
      <div class="users-admin-sidebar">
        <div class="users-admin-sidebar-header">
          <span class="users-admin-title">Utilisateurs</span>
          <button class="btn-icon" id="btn-new-user" title="Nouvel utilisateur">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>

        <!-- Résumé -->
        <div class="users-admin-stats">
          <div class="users-stat-pill">
            <span class="users-stat-num" id="users-total-count">0</span>
            <span class="users-stat-label">Total</span>
          </div>
          <div class="users-stat-pill accent">
            <span class="users-stat-num">${adminCount}</span>
            <span class="users-stat-label">Admins</span>
          </div>
          <div class="users-stat-pill">
            <span class="users-stat-num">${employeeCount}</span>
            <span class="users-stat-label">Employés</span>
          </div>
        </div>

        <div class="users-list" id="users-list">
          <div class="clients-list-empty">Chargement...</div>
        </div>
      </div>

      <!-- Colonne droite : fiche + permissions -->
      <div class="users-admin-detail" id="users-admin-detail">
        <div class="client-detail-empty">
          <i class="fa-solid fa-shield-halved"></i>
          <p>Sélectionnez un utilisateur pour gérer ses accès</p>
        </div>
      </div>

    </div>
  `;
}

// ── Liste utilisateurs ───────────────────────────────────────────────────────

function renderUserListItems(users) {
  const statusColor = s => ({ disponible: '#10b981', en_pause: '#f59e0b', indisponible: '#ef4444' }[s] ?? '#94a3b8');
  return users.map(u => `
    <div class="users-list-item ${u.id === selectedUserId ? 'active' : ''}" data-user-id="${u.id}">
      <div class="users-list-avatar" style="background:${roleColor(u.role)}20; color:${roleColor(u.role)};">
        ${u.displayName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
        <span class="users-list-dot" style="background:${statusColor(u.status)};"></span>
      </div>
      <div class="users-list-info">
        <p class="users-list-name">${escapeHtml(u.displayName)}</p>
        <p class="users-list-sub">${escapeHtml(u.email)}</p>
      </div>
      <span class="role-pill ${u.role}">${u.role === 'admin' ? 'Admin' : 'Employé'}</span>
    </div>
  `).join('');
}

function roleColor(role) {
  return role === 'admin' ? '#4f46e5' : '#10b981';
}

// ── Fiche utilisateur + permissions ─────────────────────────────────────────

function renderUserDetail(userId) {
  const u = usersState.users.find(x => x.id === userId);
  if (!u) return;

  const statusColor = { disponible: '#10b981', en_pause: '#f59e0b', indisponible: '#ef4444' }[u.status] ?? '#94a3b8';
  const statusLabel = { disponible: 'Disponible', en_pause: 'En pause', indisponible: 'Indisponible' }[u.status] ?? u.status;

  // Tableau des permissions par section
  const permRows = SECTIONS.map(sec => {
    const userPerms = u.permissions[sec.key] ?? [];
    const cells = PERMISSIONS.map(perm => {
      const checked = userPerms.includes(perm.key);
      // L'admin a tout, lecture seule sur ses propres permissions
      const isDisabled = u.role === 'admin' ? 'disabled' : '';
      return `
        <td class="perm-cell">
          <label class="perm-toggle ${isDisabled ? 'disabled' : ''}">
            <input
              type="checkbox"
              class="perm-checkbox"
              data-user-id="${u.id}"
              data-section="${sec.key}"
              data-perm="${perm.key}"
              ${checked ? 'checked' : ''}
              ${isDisabled}
            >
            <span class="perm-toggle-track"></span>
          </label>
        </td>`;
    }).join('');
    return `
      <tr class="perm-row">
        <td class="perm-section-label">
          <i class="fa-solid ${sec.icon}" style="color:var(--accent); width:14px;"></i>
          ${sec.label}
        </td>
        ${cells}
      </tr>`;
  }).join('');

  const detail = document.getElementById('users-admin-detail');
  if (!detail) return;

  detail.innerHTML = `
    <div class="user-fiche">

      <!-- En-tête -->
      <div class="user-fiche-header">
        <div class="user-fiche-avatar" style="background:${roleColor(u.role)}20; color:${roleColor(u.role)};">
          ${u.displayName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
          <span class="user-fiche-status-dot" style="background:${statusColor};"></span>
        </div>
        <div class="user-fiche-info">
          <h2>${escapeHtml(u.displayName)}</h2>
          <p>${escapeHtml(u.email)} · <span style="color:${statusColor};">${statusLabel}</span></p>
        </div>
        <div class="user-fiche-actions-row">
          <span class="role-pill ${u.role}">${u.role === 'admin' ? 'Administrateur' : 'Employé'}</span>
          <button class="btn-ghost-sm" id="btn-edit-user" data-id="${u.id}">
            <i class="fa-solid fa-pen"></i> Modifier
          </button>
          ${u.id !== 'usr1' ? `
          <button class="btn-ghost-sm danger" id="btn-delete-user" data-id="${u.id}">
            <i class="fa-solid fa-trash"></i>
          </button>` : ''}
        </div>
      </div>

      <!-- Méta -->
      <div class="user-fiche-meta-row">
        <div class="user-meta-item">
          <span class="client-info-label"><i class="fa-regular fa-calendar"></i> Créé le</span>
          <span class="client-info-value">${formatDate(u.createdAt)}</span>
        </div>
        <div class="user-meta-item">
          <span class="client-info-label"><i class="fa-solid fa-shield-halved"></i> Rôle</span>
          <span class="client-info-value">${u.role === 'admin' ? 'Administrateur' : 'Employé'}</span>
        </div>
        <div class="user-meta-item">
          <span class="client-info-label"><i class="fa-solid fa-circle-dot"></i> Statut</span>
          <span class="client-info-value" style="color:${statusColor};">${statusLabel}</span>
        </div>
      </div>

      <!-- Tableau des permissions -->
      <div class="perm-section">
        <div class="perm-section-title-row">
          <h4 class="client-fiche-section-title" style="margin-bottom:0;">Accès aux sections & droits</h4>
          ${u.role !== 'admin' ? `
          <div class="perm-quick-actions">
            <button class="btn-ghost-sm" id="btn-perm-all">Tout accorder</button>
            <button class="btn-ghost-sm" id="btn-perm-none">Tout révoquer</button>
          </div>` : `<span style="font-size:12px; color:var(--text-muted);">L'administrateur a accès complet à tout.</span>`}
        </div>

        <div class="perm-table-wrapper">
          <table class="perm-table">
            <thead>
              <tr>
                <th class="perm-th-section">Section</th>
                ${PERMISSIONS.map(p => `
                  <th class="perm-th" title="${p.desc}">
                    <span>${p.label}</span>
                  </th>`).join('')}
              </tr>
            </thead>
            <tbody>${permRows}</tbody>
          </table>
        </div>

        ${u.role !== 'admin' ? `
        <div class="perm-save-row">
          <span class="perm-save-hint" id="perm-hint" style="display:none;">
            <i class="fa-solid fa-circle-info"></i> Modifications non sauvegardées
          </span>
          <button class="btn-primary-sm" id="btn-save-perms" data-user-id="${u.id}">
            <i class="fa-solid fa-check"></i> Sauvegarder les permissions
          </button>
        </div>` : ''}
      </div>

    </div>
  `;

  // Attacher les événements
  document.getElementById('btn-edit-user')?.addEventListener('click', () => openUserModal(u.id));
  document.getElementById('btn-delete-user')?.addEventListener('click', async () => {
    if (confirm(`Supprimer l'utilisateur "${u.displayName}" ?`)) {
      try {
        await deleteDoc(doc(db, 'users', u.id));
        await loadUsersData();
        selectedUserId = null;
        document.getElementById('users-admin-detail').innerHTML = `<div class="client-detail-empty"><i class="fa-solid fa-shield-halved"></i><p>Sélectionnez un utilisateur pour gérer ses accès</p></div>`;
        showToast('Utilisateur supprimé', 'success');
      } catch (err) {
        console.error('Erreur suppression utilisateur:', err);
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  });

  // Toggle permissions
  document.querySelectorAll('.perm-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const hint = document.getElementById('perm-hint');
      if (hint) hint.style.display = 'inline-flex';
    });
  });

  // Tout accorder
  document.getElementById('btn-perm-all')?.addEventListener('click', () => {
    document.querySelectorAll('.perm-checkbox:not(:disabled)').forEach(cb => { cb.checked = true; });
    const hint = document.getElementById('perm-hint');
    if (hint) hint.style.display = 'inline-flex';
  });

  // Tout révoquer (garde lecture dashboard)
  document.getElementById('btn-perm-none')?.addEventListener('click', () => {
    document.querySelectorAll('.perm-checkbox:not(:disabled)').forEach(cb => {
      cb.checked = cb.dataset.section === 'dashboard' && cb.dataset.perm === 'view';
    });
    const hint = document.getElementById('perm-hint');
    if (hint) hint.style.display = 'inline-flex';
  });

  // Sauvegarder
  document.getElementById('btn-save-perms')?.addEventListener('click', async () => {
    const targetUser = usersState.users.find(x => x.id === userId);
    if (!targetUser) return;
    // Reconstruire les permissions depuis les checkboxes
    const newPerms = {};
    SECTIONS.forEach(sec => { newPerms[sec.key] = []; });
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
      if (cb.checked) newPerms[cb.dataset.section].push(cb.dataset.perm);
    });
    targetUser.permissions = newPerms;
    const hint = document.getElementById('perm-hint');
    if (hint) { hint.style.display = 'none'; }
    // Feedback visuel
    const btn = document.getElementById('btn-save-perms');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Sauvegardé !';
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Sauvegarder les permissions';
        btn.style.background = '';
      }, 2000);
    }
  });
}

// ── Init section ─────────────────────────────────────────────────────────────

function initUsersAdmin() {
  // Clic sur un utilisateur
  document.getElementById('users-list')?.addEventListener('click', e => {
    const item = e.target.closest('.users-list-item');
    if (!item) return;
    selectedUserId = item.dataset.userId;
    document.querySelectorAll('.users-list-item').forEach(el => el.classList.toggle('active', el.dataset.userId === selectedUserId));
    renderUserDetail(selectedUserId);
  });

  // Nouvel utilisateur
  document.getElementById('btn-new-user')?.addEventListener('click', () => openUserModal(null));

  // Recherche
  document.getElementById('users-search-input')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = usersState.users.filter(u =>
      `${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(q)
    );
    document.getElementById('users-list').innerHTML = renderUserListItems(filtered);
    reattachUserListClicks();
  });

  // Load users data
  loadUsersData();
}

function reattachUserListClicks() {
  document.querySelectorAll('.users-list-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedUserId = el.dataset.userId;
      document.querySelectorAll('.users-list-item').forEach(x => x.classList.toggle('active', x.dataset.userId === selectedUserId));
      renderUserDetail(selectedUserId);
    });
  });
}

function updateUserStats() {
  const adminCount    = usersState.users.filter(u => u.role === 'admin').length;
  const employeeCount = usersState.users.filter(u => u.role === 'employee').length;
  const totalEl = document.getElementById('users-total-count');
  const pills = document.querySelectorAll('.users-stat-num');
  if (totalEl) totalEl.textContent = usersState.users.length;
  if (pills[1]) pills[1].textContent = adminCount;
  if (pills[2]) pills[2].textContent = employeeCount;
}

// ── Modal utilisateur ────────────────────────────────────────────────────────

function openUserModal(userId) {
  const existing = userId ? usersState.users.find(u => u.id === userId) : null;
  document.getElementById('user-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'user-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${existing ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h3>
        <button class="modal-close" id="um-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Nom complet <span class="required">*</span></label>
          <input type="text" id="um-name" placeholder="Prénom Nom" value="${escapeHtml(existing?.displayName ?? '')}">
        </div>
        <div class="form-group">
          <label>Adresse email <span class="required">*</span></label>
          <input type="email" id="um-email" placeholder="prenom.nom@agora.fr" value="${escapeHtml(existing?.email ?? '')}">
        </div>
        ${!existing ? `
        <div class="form-group">
          <label>Mot de passe temporaire <span class="required">*</span></label>
          <input type="password" id="um-password" placeholder="Minimum 8 caractères">
          <div class="field-hint">L'utilisateur devra le changer à la première connexion.</div>
        </div>` : ''}
        <div class="form-row-2">
          <div class="form-group">
            <label>Rôle <span class="required">*</span></label>
            <select id="um-role">
              <option value="employee" ${existing?.role === 'employee' ? 'selected' : ''}>Employé</option>
              <option value="admin"    ${existing?.role === 'admin'    ? 'selected' : ''}>Administrateur</option>
            </select>
          </div>
          <div class="form-group">
            <label>Statut initial</label>
            <select id="um-status">
              <option value="disponible"   ${existing?.status === 'disponible'   ? 'selected' : ''}>Disponible</option>
              <option value="en_pause"     ${existing?.status === 'en_pause'     ? 'selected' : ''}>En pause</option>
              <option value="indisponible" ${existing?.status === 'indisponible' ? 'selected' : ''}>Indisponible</option>
            </select>
          </div>
        </div>
        <div id="um-error" class="modal-error" style="display:none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" id="um-cancel">Annuler</button>
        <button class="btn-primary-sm" id="um-save">
          <i class="fa-solid fa-check"></i> ${existing ? 'Enregistrer' : 'Créer l\'utilisateur'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('um-close').addEventListener('click', close);
  document.getElementById('um-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('um-save').addEventListener('click', async () => {
    const name     = document.getElementById('um-name').value.trim();
    const email    = document.getElementById('um-email').value.trim();
    const role     = document.getElementById('um-role').value;
    const status   = document.getElementById('um-status').value;
    const password = document.getElementById('um-password')?.value ?? '';
    const errEl    = document.getElementById('um-error');

    if (!name)  { errEl.textContent = 'Le nom est requis.';   errEl.style.display='block'; return; }
    if (!email) { errEl.textContent = 'L\'email est requis.'; errEl.style.display='block'; return; }
    if (!existing && password.length < 8) { errEl.textContent = 'Le mot de passe doit faire au moins 8 caractères.'; errEl.style.display='block'; return; }

    try {
      // Permissions par défaut pour un nouvel employé
      const defaultPerms = {};
      SECTIONS.forEach(sec => { defaultPerms[sec.key] = ['view']; });

      const userData = {
        displayName: name,
        email,
        role,
        status,
        updatedAt: serverTimestamp()
      };

      if (existing) {
        await updateDoc(doc(db, 'users', userId), userData);
        showToast('Utilisateur mis à jour', 'success');
      } else {
        userData.permissions = role === 'admin'
          ? Object.fromEntries(SECTIONS.map(s => [s.key, ['view','edit','delete','export']]))
          : defaultPerms;
        userData.createdAt = serverTimestamp();
        // Note: Creating users with passwords requires Firebase Auth Admin SDK
        // For now, we just create the user document
        const newUserRef = await addDoc(collection(db, 'users'), userData);
        selectedUserId = newUserRef.id;
        showToast('Utilisateur créé (pensez à créer le compte dans Firebase Auth)', 'success');
      }

      close();
      invalidateCache('users');
      await loadUsersData(true);
      document.querySelectorAll('.users-list-item').forEach(el => el.classList.toggle('active', el.dataset.userId === selectedUserId));
      reattachUserListClicks();
      renderUserDetail(selectedUserId);
    } catch (err) {
      console.error('Erreur sauvegarde utilisateur:', err);
      errEl.textContent = 'Erreur lors de la sauvegarde';
      errEl.style.display = 'block';
    }
  });
}


/* ═══════════════════════════════════════════════════════════
   SECTION FINANCES — Fonctions HTML et événements
═══════════════════════════════════════════════════════════ */

function getFinancesHTML() {
  return `
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="fa-solid fa-coins"></i> Finances</h1>
        <span class="page-subtitle">Pilotage financier et trésorerie</span>
      </div>
      <div class="header-actions">
        <select id="finances-period" class="filter-select">
          <option value="month">Mois en cours</option>
          <option value="quarter">Trimestre</option>
          <option value="year">Année</option>
        </select>
      </div>
    </div>

    <div class="finances-tabs">
      <button class="finances-tab active" data-tab="overview"><i class="fa-solid fa-chart-pie"></i> Vue d'ensemble</button>
      <button class="finances-tab" data-tab="invoices"><i class="fa-solid fa-file-invoice-dollar"></i> Facturation</button>
      <button class="finances-tab" data-tab="budget"><i class="fa-solid fa-bullseye"></i> Budget</button>
      <button class="finances-tab" data-tab="reports"><i class="fa-solid fa-file-contract"></i> Rapports</button>
    </div>

    <div id="finances-tab-content" class="finances-tab-content">
      <!-- Content injected here -->
    </div>
  `;
}

function getFinancesOverviewHTML() {
  const m = financesState.metrics;
  const budgetUsed = m.budgetTotal > 0 ? (m.depensesEngagees / m.budgetTotal * 100).toFixed(1) : 0;
  const budgetRemaining = m.budgetTotal - m.depensesEngagees;

  const alerts = [];
  if (budgetUsed > 90) alerts.push({ type: 'danger', message: `Budget à ${budgetUsed}% épuisé` });
  if (m.margeNette < 10) alerts.push({ type: 'warning', message: 'Marge nette faible' });
  if (m.delaiPaiementMoyen > 45) alerts.push({ type: 'warning', message: 'Délai de paiement élevé' });

  return `
    <div class="finances-overview">
      <div class="finances-kpi-grid">
        <div class="kpi-card ca">
          <div class="kpi-icon"><i class="fa-solid fa-euro-sign"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">CA du mois</span>
            <span class="kpi-value">${formatCurrency(m.caMois)}</span>
            <span class="kpi-sub">Trimestre: ${formatCurrency(m.caTrimestre)}</span>
          </div>
        </div>
        <div class="kpi-card margin">
          <div class="kpi-icon"><i class="fa-solid fa-percent"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">Marge nette</span>
            <span class="kpi-value">${m.margeNette.toFixed(1)}%</span>
            <span class="kpi-sub">Brute: ${m.margeBrute.toFixed(1)}%</span>
          </div>
        </div>
        <div class="kpi-card result">
          <div class="kpi-icon"><i class="fa-solid fa-chart-line"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">Résultat d'exploitation</span>
            <span class="kpi-value ${m.resultatExploitation >= 0 ? 'positive' : 'negative'}">${formatCurrency(m.resultatExploitation)}</span>
          </div>
        </div>
        <div class="kpi-card treasury">
          <div class="kpi-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">Trésorerie</span>
            <span class="kpi-value ${m.tresorerie >= 0 ? 'positive' : 'negative'}">${formatCurrency(m.tresorerie)}</span>
            <span class="kpi-sub">Délai paiement: ${m.delaiPaiementMoyen.toFixed(0)}j</span>
          </div>
        </div>
      </div>

      ${alerts.length > 0 ? `
        <div class="finances-alerts">
          ${alerts.map(a => `
            <div class="alert alert-${a.type}">
              <i class="fa-solid ${a.type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i>
              <span>${a.message}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="finances-budget-card">
        <div class="budget-header">
          <h3><i class="fa-solid fa-bullseye"></i> Budget annuel</h3>
          <span class="budget-period">${new Date().getFullYear()}</span>
        </div>
        <div class="budget-progress">
          <div class="budget-bar">
            <div class="budget-fill ${budgetUsed > 90 ? 'danger' : budgetUsed > 75 ? 'warning' : ''}" style="width: ${Math.min(budgetUsed, 100)}%"></div>
          </div>
          <div class="budget-stats">
            <span class="budget-used">Utilisé: <strong>${formatCurrency(m.depensesEngagees)}</strong> (${budgetUsed}%)</span>
            <span class="budget-remaining ${budgetRemaining < 0 ? 'negative' : ''}">Restant: <strong>${formatCurrency(budgetRemaining)}</strong></span>
          </div>
        </div>
      </div>

      <div class="finances-charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h4>Évolution du CA</h4>
          </div>
          <div class="chart-container" id="revenue-chart-container">
            ${renderFallbackRevenueChart()}
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h4>Répartition des dépenses</h4>
          </div>
          <div class="chart-container" id="expenses-chart-container">
            ${renderFallbackExpensesChart()}
          </div>
        </div>
      </div>

      <div class="finances-activity">
        <h4><i class="fa-solid fa-clock-rotate-left"></i> Factures récentes</h4>
        <div class="activity-list">
          ${financesState.invoices.slice(0, 5).map(inv => `
            <div class="activity-item ${inv.status}">
              <div class="activity-icon">
                <i class="fa-solid ${inv.status === 'paid' ? 'fa-check-circle' : inv.status === 'pending' ? 'fa-clock' : 'fa-file-invoice'}"></i>
              </div>
              <div class="activity-details">
                <span class="activity-title">${escapeHtml(inv.clientName || 'Client')}</span>
                <span class="activity-meta">${formatCurrency(inv.amount)} • ${formatDate(inv.date)}</span>
              </div>
              <span class="activity-status status-${inv.status}">${getInvoiceStatusLabel(inv.status)}</span>
            </div>
          `).join('') || '<p class="no-activity">Aucune facture récente</p>'}
        </div>
      </div>
    </div>
  `;
}

function renderFallbackRevenueChart() {
  const data = financesState.chartData?.monthly || [];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  const max = Math.max(...data.map(d => d?.revenue || 0), 1);

  if (data.length === 0) {
    return '<p class="no-data">Aucune donnée disponible</p>';
  }

  return `
    <div class="fallback-chart">
      ${data.map((d, i) => `
        <div class="chart-bar-wrapper">
          <div class="chart-bar" style="height: ${((d?.revenue || 0) / max * 80 + 5)}%">
            <span class="chart-tooltip">${formatCurrency(d?.revenue || 0)}</span>
          </div>
          <span class="chart-label">${months[i] || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderFallbackExpensesChart() {
  const categories = financesState.budget.categories || {};
  const entries = Object.entries(categories);
  if (entries.length === 0) return '<p class="no-data">Aucune donnée</p>';

  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const total = entries.reduce((sum, [, cat]) => sum + (cat.spent || 0), 0);

  return `
    <div class="fallback-doughnut">
      <div class="doughnut-legend">
        ${entries.map(([key, cat], i) => `
          <div class="legend-item">
            <span class="legend-color" style="background: ${colors[i % colors.length]}"></span>
            <span class="legend-label">${escapeHtml(cat.name || key)}</span>
            <span class="legend-value">${formatCurrency(cat.spent || 0)} (${total > 0 ? ((cat.spent || 0) / total * 100).toFixed(0) : 0}%)</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getFinancesInvoicesHTML() {
  const filtered = getFilteredInvoices();
  const totalAmount = filtered.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const paidAmount = filtered.filter(i => i.status === 'paid').reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const pendingAmount = filtered.filter(i => i.status === 'pending').reduce((sum, inv) => sum + (inv.amount || 0), 0);

  return `
    <div class="finances-invoices">
      <div class="invoices-stats">
        <div class="stat-card">
          <span class="stat-value">${formatCurrency(totalAmount)}</span>
          <span class="stat-label">Total facturé</span>
        </div>
        <div class="stat-card success">
          <span class="stat-value">${formatCurrency(paidAmount)}</span>
          <span class="stat-label">Encaissé</span>
        </div>
        <div class="stat-card warning">
          <span class="stat-value">${formatCurrency(pendingAmount)}</span>
          <span class="stat-label">En attente</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${filtered.filter(i => i.status === 'pending').length}</span>
          <span class="stat-label">Factures en attente</span>
        </div>
      </div>

      <div class="invoices-filters">
        <div class="filter-group">
          <input type="text" id="invoice-search" placeholder="Rechercher un client..." class="filter-input">
          <select id="invoice-status-filter" class="filter-select">
            <option value="all">Tous les statuts</option>
            <option value="paid">Payée</option>
            <option value="pending">En attente</option>
            <option value="draft">Brouillon</option>
            <option value="overdue">En retard</option>
          </select>
        </div>
        <button class="btn-primary-sm" id="btn-new-invoice">
          <i class="fa-solid fa-plus"></i> Nouvelle facture
        </button>
      </div>

      <div class="invoices-table-container">
        <table class="invoices-table">
          <thead>
            <tr>
              <th>N° Facture</th>
              <th>Client</th>
              <th>Date</th>
              <th>Échéance</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(inv => `
              <tr data-id="${inv.id}">
                <td><span class="invoice-num">${inv.number || '-'}</span></td>
                <td>${escapeHtml(inv.clientName || '-')}</td>
                <td>${formatDate(inv.date)}</td>
                <td>${formatDate(inv.dueDate)}</td>
                <td class="amount">${formatCurrency(inv.amount)}</td>
                <td><span class="invoice-status-badge ${inv.status}">${getInvoiceStatusLabel(inv.status)}</span></td>
                <td>
                  <button class="btn-icon" title="Voir" onclick="viewInvoice('${inv.id}')"><i class="fa-solid fa-eye"></i></button>
                  <button class="btn-icon" title="Télécharger PDF" onclick="downloadInvoice('${inv.id}')"><i class="fa-solid fa-download"></i></button>
                  ${inv.status !== 'paid' ? `<button class="btn-icon" title="Marquer payée" onclick="markInvoicePaid('${inv.id}')"><i class="fa-solid fa-check"></i></button>` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="no-data">Aucune facture</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getFinancesBudgetHTML() {
  const b = financesState.budget;
  const categories = b.categories || {};
  const totalBudget = Object.values(categories).reduce((sum, cat) => sum + (cat.budget || 0), 0);
  const totalSpent = Object.values(categories).reduce((sum, cat) => sum + (cat.spent || 0), 0);

  return `
    <div class="finances-budget">
      <div class="budget-overview-card">
        <div class="budget-overview-header">
          <h3>Budget ${new Date().getFullYear()}</h3>
          <button class="btn-secondary-sm" id="btn-edit-budget"><i class="fa-solid fa-pen"></i> Modifier</button>
        </div>
        <div class="budget-overview-stats">
          <div class="budget-stat">
            <span class="stat-label">Budget total</span>
            <span class="stat-value">${formatCurrency(totalBudget)}</span>
          </div>
          <div class="budget-stat">
            <span class="stat-label">Dépensé</span>
            <span class="stat-value ${totalSpent > totalBudget ? 'negative' : ''}">${formatCurrency(totalSpent)}</span>
          </div>
          <div class="budget-stat">
            <span class="stat-label">Restant</span>
            <span class="stat-value ${totalBudget - totalSpent < 0 ? 'negative' : 'positive'}">${formatCurrency(totalBudget - totalSpent)}</span>
          </div>
          <div class="budget-stat">
            <span class="stat-label">Utilisation</span>
            <span class="stat-value">${totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0}%</span>
          </div>
        </div>
      </div>

      <div class="budget-categories">
        <h4>Répartition par catégorie</h4>
        <div class="budget-categories-grid">
          ${Object.entries(categories).map(([key, cat]) => {
            const percent = cat.budget > 0 ? ((cat.spent || 0) / cat.budget * 100) : 0;
            const isOver = percent > 100;
            return `
              <div class="budget-category-card ${isOver ? 'over' : percent > 80 ? 'warning' : ''}">
                <div class="category-header">
                  <span class="category-name">${escapeHtml(cat.name || key)}</span>
                  <span class="category-percent">${percent.toFixed(0)}%</span>
                </div>
                <div class="category-bar">
                  <div class="category-fill ${isOver ? 'over' : percent > 80 ? 'warning' : ''}" style="width: ${Math.min(percent, 100)}%"></div>
                </div>
                <div class="category-stats">
                  <span class="spent">${formatCurrency(cat.spent || 0)} / ${formatCurrency(cat.budget || 0)}</span>
                  <span class="remaining ${cat.budget - (cat.spent || 0) < 0 ? 'negative' : ''}">${formatCurrency((cat.budget || 0) - (cat.spent || 0))}</span>
                </div>
                ${isOver ? `<div class="category-alert"><i class="fa-solid fa-triangle-exclamation"></i> Dépassement de budget</div>` : ''}
              </div>
            `;
          }).join('') || '<p class="no-data">Aucune catégorie définie</p>'}
        </div>
      </div>

      <div class="budget-expenses">
        <h4>Dernières dépenses</h4>
        <div class="expenses-list">
          ${financesState.expenses.slice(0, 10).map(exp => `
            <div class="expense-item">
              <div class="expense-info">
                <span class="expense-title">${escapeHtml(exp.description || 'Dépense')}</span>
                <span class="expense-category">${escapeHtml(exp.category || '-')}</span>
              </div>
              <div class="expense-meta">
                <span class="expense-amount">${formatCurrency(exp.amount)}</span>
                <span class="expense-date">${formatDate(exp.date)}</span>
              </div>
            </div>
          `).join('') || '<p class="no-data">Aucune dépense enregistrée</p>'}
        </div>
      </div>
    </div>
  `;
}

function getFinancesReportsHTML() {
  return `
    <div class="finances-reports">
      <div class="reports-grid">
        <div class="report-card">
          <div class="report-icon"><i class="fa-solid fa-file-pdf"></i></div>
          <div class="report-info">
            <h4>Rapport mensuel</h4>
            <p>CA, marges, résultat d'exploitation</p>
            <span class="report-period">${new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}</span>
          </div>
          <button class="btn-primary-sm" onclick="generateReport('monthly')">
            <i class="fa-solid fa-download"></i> PDF
          </button>
        </div>

        <div class="report-card">
          <div class="report-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div>
          <div class="report-info">
            <h4>Rapport trimestriel</h4>
            <p>Analyse détaillée du trimestre en cours</p>
            <span class="report-period">T${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}</span>
          </div>
          <button class="btn-primary-sm" onclick="generateReport('quarterly')">
            <i class="fa-solid fa-download"></i> PDF
          </button>
        </div>

        <div class="report-card">
          <div class="report-icon"><i class="fa-solid fa-chart-column"></i></div>
          <div class="report-info">
            <h4>Rapport annuel</h4>
            <p>Bilan complet de l'exercice</p>
            <span class="report-period">${new Date().getFullYear()}</span>
          </div>
          <button class="btn-primary-sm" onclick="generateReport('annual')">
            <i class="fa-solid fa-download"></i> PDF
          </button>
        </div>

        <div class="report-card">
          <div class="report-icon"><i class="fa-solid fa-file-csv"></i></div>
          <div class="report-info">
            <h4>Export comptable</h4>
            <p>Écritures et balance</p>
            <span class="report-period">CSV / Excel</span>
          </div>
          <button class="btn-primary-sm" onclick="exportAccounting()">
            <i class="fa-solid fa-download"></i> Exporter
          </button>
        </div>
      </div>

      <div class="reports-comparison">
        <h4><i class="fa-solid fa-scale-balanced"></i> Comparaison périodes</h4>
        <div class="comparison-controls">
          <select id="compare-period-1" class="filter-select">
            <option value="current-month">Mois en cours</option>
            <option value="last-month">Mois dernier</option>
            <option value="current-quarter">Trimestre en cours</option>
            <option value="last-quarter">Trimestre dernier</option>
          </select>
          <span>vs</span>
          <select id="compare-period-2" class="filter-select">
            <option value="last-month" selected>Mois dernier</option>
            <option value="current-month">Mois en cours</option>
            <option value="last-quarter">Trimestre dernier</option>
            <option value="current-quarter">Trimestre en cours</option>
          </select>
          <button class="btn-secondary-sm" onclick="comparePeriods()">Comparer</button>
        </div>
        <div id="comparison-results" class="comparison-results"></div>
      </div>
    </div>
  `;
}

function initFinances() {
  document.querySelectorAll('.finances-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.finances-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFinancesContent();
    });
  });

  document.getElementById('finances-period')?.addEventListener('change', (e) => {
    financesState.currentPeriod = e.target.value;
    loadFinancesData(true);
  });

  renderFinancesContent();
}

function initInvoicesEvents() {
  document.getElementById('invoice-search')?.addEventListener('input', debounce(() => {
    renderFinancesContent();
  }, 300));

  document.getElementById('invoice-status-filter')?.addEventListener('change', () => {
    renderFinancesContent();
  });

  document.getElementById('btn-new-invoice')?.addEventListener('click', () => {
    showToast('Création de facture - fonctionnalité à venir', 'info');
  });
}

function initBudgetEvents() {
  document.getElementById('btn-edit-budget')?.addEventListener('click', () => {
    showToast('Édition du budget - fonctionnalité à venir', 'info');
  });
}

function initReportsEvents() {
  // Handled by inline onclick
}

function getFilteredInvoices() {
  let filtered = [...financesState.invoices];
  const search = document.getElementById('invoice-search')?.value?.toLowerCase() || '';
  const status = document.getElementById('invoice-status-filter')?.value || 'all';

  if (search) {
    filtered = filtered.filter(inv =>
      (inv.clientName || '').toLowerCase().includes(search) ||
      (inv.number || '').toLowerCase().includes(search)
    );
  }

  if (status !== 'all') {
    filtered = filtered.filter(inv => inv.status === status);
  }

  return filtered;
}

function getInvoiceStatusLabel(status) {
  const labels = { paid: 'Payée', pending: 'En attente', draft: 'Brouillon', overdue: 'En retard' };
  return labels[status] || status;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

async function viewInvoice(id) {
  showToast('Visualisation de la facture - fonctionnalité à venir', 'info');
}

async function downloadInvoice(id) {
  showToast('Téléchargement PDF - fonctionnalité à venir', 'info');
}

async function markInvoicePaid(id) {
  try {
    await updateDoc(doc(db, 'invoices', id), { status: 'paid', paidDate: new Date().toISOString() });
    invalidateCache('finances');
    await loadFinancesData(true);
    showToast('Facture marquée comme payée', 'success');
  } catch (err) {
    showToast('Erreur lors de la mise à jour', 'error');
  }
}

async function generateReport(type) {
  showToast(`Génération du rapport ${type} - fonctionnalité à venir`, 'info');
}

async function exportAccounting() {
  showToast('Export comptable - fonctionnalité à venir', 'info');
}

async function comparePeriods() {
  showToast('Comparaison des périodes - fonctionnalité à venir', 'info');
}

/* ═══════════════════════════════════════════════════════════
   UTILITAIRE
═══════════════════════════════════════════════════════════ */

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
