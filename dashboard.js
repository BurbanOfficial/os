/**
 * AGORA — dashboard.js
 * Script de la page dashboard.html.
 * Vérifie la session Firebase, charge les données et initialise l'app shell.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUid  = null;
let currentRole = 'employee'; // 'admin' | 'employee'

// Sections de l'app et leurs permissions
const SECTIONS = [
  { key: 'dashboard',   label: 'Dashboard',   icon: 'fa-chart-pie' },
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
    // Profil utilisateur
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const profile = snap.data();
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
    const presenceSnap = await getDoc(doc(db, 'presence', uid));
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

  // Charger le dashboard
  await renderPageContent('dashboard');
}

function injectAdminNavItem() {
  const nav = document.getElementById('main-nav');
  if (!nav || nav.querySelector('[data-target="utilisateurs"]')) return;

  // Ajouter un séparateur "Administration" s'il n'existe pas
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


/* ═══════════════════════════════════════════════════════════
   NAVIGATION SPA
═══════════════════════════════════════════════════════════ */

async function renderPageContent(pageName) {
  const main = document.getElementById('main-content');
  if (!main) return;

  // Fade out
  main.style.opacity = '0';
  await new Promise(r => setTimeout(r, 150));

  // Marquer l'item actif
  document.querySelectorAll('.menu-item[data-target]').forEach(item => {
    item.classList.toggle('active', item.dataset.target === pageName);
  });

  switch (pageName) {
    case 'dashboard':
      main.innerHTML = getDashboardHTML();
      await loadDashboardData(currentUid);
      scheduleMidnightRefresh();
      initGlobalSearch();
      break;

    case 'projets':
      main.innerHTML = getProjectsHTML();
      initProjectsTabs();
      break;

    case 'clients':
      main.innerHTML = getClientsHTML();
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
        return;
      }
      main.innerHTML = getUsersAdminHTML();
      initUsersAdmin();
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
              <i class="fa-solid fa-hammer"></i>
              <p>Le module <strong>${label}</strong> est en cours de développement.</p>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Fade in
  main.style.opacity = '1';
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
   SECTION PROJETS — Données démo
═══════════════════════════════════════════════════════════ */

const DEMO_PROJECTS = [
  { id: 'p1', name: 'Refonte Site Nike', client: 'Nike France', status: 'en_retard', progress: 65, startDate: '2026-04-01', endDate: '2026-06-15', lead: 'Lucas M.', tasks: { todo: 3, doing: 2, done: 8 } },
  { id: 'p2', name: 'Campagne Renault EV', client: 'Renault', status: 'a_temps', progress: 42, startDate: '2026-05-10', endDate: '2026-07-30', lead: 'Camille B.', tasks: { todo: 5, doing: 3, done: 4 } },
  { id: 'p3', name: 'Brand Identity Sézane', client: 'Sézane', status: 'en_avance', progress: 88, startDate: '2026-03-15', endDate: '2026-06-01', lead: 'Antoine D.', tasks: { todo: 1, doing: 1, done: 12 } },
  { id: 'p4', name: 'App Mobile TotalEnergies', client: 'TotalEnergies', status: 'a_temps', progress: 30, startDate: '2026-05-20', endDate: '2026-09-01', lead: 'Lucas M.', tasks: { todo: 8, doing: 4, done: 3 } },
  { id: 'p5', name: 'Packaging Evian 2027', client: 'Evian', status: 'en_avance', progress: 55, startDate: '2026-04-20', endDate: '2026-07-10', lead: 'Marie L.', tasks: { todo: 4, doing: 2, done: 6 } },
  { id: 'p6', name: 'UX Audit BNP Paribas', client: 'BNP Paribas', status: 'en_retard', progress: 20, startDate: '2026-05-01', endDate: '2026-06-20', lead: 'Camille B.', tasks: { todo: 6, doing: 1, done: 2 } },
];

const DEMO_TASKS = {
  todo:  [
    { id: 't1', title: 'Brief créatif v2', project: 'Nike France', assignee: 'LM', priority: 'high' },
    { id: 't2', title: 'Maquettes mobile', project: 'Renault', assignee: 'CB', priority: 'medium' },
    { id: 't3', title: 'Validation client', project: 'Sézane', assignee: 'AD', priority: 'low' },
    { id: 't4', title: 'Export assets', project: 'Evian', assignee: 'ML', priority: 'medium' },
  ],
  doing: [
    { id: 't5', title: 'Refonte page accueil', project: 'Nike France', assignee: 'LM', priority: 'high' },
    { id: 't6', title: 'Intégration animations', project: 'TotalEnergies', assignee: 'LM', priority: 'high' },
    { id: 't7', title: 'Design system tokens', project: 'Sézane', assignee: 'AD', priority: 'medium' },
  ],
  review: [
    { id: 't8', title: 'Charte graphique finale', project: 'Sézane', assignee: 'AD', priority: 'high' },
    { id: 't9', title: 'Prototype interactif', project: 'BNP Paribas', assignee: 'CB', priority: 'medium' },
  ],
  done: [
    { id: 't10', title: 'Audit concurrentiel', project: 'Renault', assignee: 'CB', priority: 'low' },
    { id: 't11', title: 'Moodboard direction', project: 'Nike France', assignee: 'ML', priority: 'medium' },
    { id: 't12', title: 'Workshop stakeholders', project: 'BNP Paribas', assignee: 'LM', priority: 'low' },
  ],
};

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
          <p class="page-subtitle">${DEMO_PROJECTS.length} projets actifs</p>
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
  const rows = DEMO_PROJECTS.map(p => {
    const statusLabel = { en_avance: 'En avance', a_temps: 'À temps', en_retard: 'En retard' }[p.status] ?? p.status;
    const statusClass = { en_avance: 'status-ahead', a_temps: 'status-ontime', en_retard: 'status-late' }[p.status] ?? '';
    const totalTasks  = p.tasks.todo + p.tasks.doing + p.tasks.done;

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
        <td class="td-secondary">${p.tasks.done}/${totalTasks} tâches</td>
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
  const cols = [
    { key: 'todo',   label: 'À faire',     color: '#94a3b8', count: DEMO_TASKS.todo.length },
    { key: 'doing',  label: 'En cours',    color: '#4f46e5', count: DEMO_TASKS.doing.length },
    { key: 'review', label: 'En révision', color: '#f59e0b', count: DEMO_TASKS.review.length },
    { key: 'done',   label: 'Terminé',     color: '#10b981', count: DEMO_TASKS.done.length },
  ];

  const columns = cols.map(col => {
    const cards = (DEMO_TASKS[col.key] ?? []).map(t => `
      <div class="kanban-card">
        <div class="kanban-card-top">
          <span class="kanban-priority ${t.priority}">${priorityLabel(t.priority)}</span>
        </div>
        <p class="kanban-card-title">${escapeHtml(t.title)}</p>
        <p class="kanban-card-project">${escapeHtml(t.project)}</p>
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
  // Définir la fenêtre temporelle (60 jours à partir du 1er projet)
  const today     = new Date();
  const startRef  = new Date('2026-04-01');
  const totalDays = 120;

  // Génération des semaines pour l'en-tête
  const weekHeaders = [];
  for (let i = 0; i < totalDays; i += 7) {
    const d = new Date(startRef);
    d.setDate(d.getDate() + i);
    weekHeaders.push(`<div class="gantt-week-label">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>`);
  }

  // Indicateur "aujourd'hui"
  const todayOffset = Math.max(0, Math.round((today - startRef) / 86400000));
  const todayPct    = (todayOffset / totalDays) * 100;

  const rows = DEMO_PROJECTS.map(p => {
    const start    = new Date(p.startDate);
    const end      = new Date(p.endDate);
    const offsetD  = Math.max(0, Math.round((start - startRef) / 86400000));
    const durationD = Math.max(1, Math.round((end - start) / 86400000));
    const leftPct  = (offsetD / totalDays) * 100;
    const widthPct = Math.min((durationD / totalDays) * 100, 100 - leftPct);
    const barColor = progressColor(p.status);

    return `
      <div class="gantt-row">
        <div class="gantt-row-label">
          <span class="project-color-dot" style="background:${projectColor(p.id)};"></span>
          <span class="gantt-row-name">${escapeHtml(p.name)}</span>
        </div>
        <div class="gantt-row-bar-area">
          <div class="gantt-today-line" style="left:${todayPct.toFixed(1)}%;"></div>
          <div class="gantt-bar" style="left:${leftPct.toFixed(1)}%; width:${widthPct.toFixed(1)}%; background:${barColor};">
            <span class="gantt-bar-label">${p.progress}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="gantt-wrapper">
      <div class="gantt-container">
        <div class="gantt-labels-col">
          <div class="gantt-header-spacer"></div>
          ${DEMO_PROJECTS.map(p => `
            <div class="gantt-row-label-only">
              <span class="project-color-dot" style="background:${projectColor(p.id)};"></span>
              <span class="gantt-row-name">${escapeHtml(p.name)}</span>
            </div>`).join('')}
        </div>
        <div class="gantt-chart-col">
          <div class="gantt-weeks-header">${weekHeaders.join('')}</div>
          ${DEMO_PROJECTS.map(p => {
            const start    = new Date(p.startDate);
            const end      = new Date(p.endDate);
            const offsetD  = Math.max(0, Math.round((start - startRef) / 86400000));
            const durationD = Math.max(1, Math.round((end - start) / 86400000));
            const leftPct  = (offsetD / totalDays) * 100;
            const widthPct = Math.min((durationD / totalDays) * 100, 100 - leftPct);
            const barColor = progressColor(p.status);
            return `
              <div class="gantt-bar-row">
                <div class="gantt-today-line" style="left:${todayPct.toFixed(1)}%;"></div>
                <div class="gantt-bar" style="left:${leftPct.toFixed(1)}%; width:${widthPct.toFixed(1)}%; background:${barColor};" title="${p.name} · ${p.startDate} → ${p.endDate}">
                  <span class="gantt-bar-label">${p.progress}%</span>
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

function openProjectModal() {
  // Supprimer un modal existant
  document.getElementById('project-modal-overlay')?.remove();

  const clientOptions = DEMO_CLIENTS.map(c =>
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
  document.getElementById('modal-save-btn').addEventListener('click', () => {
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

    // Ajouter dans DEMO_PROJECTS
    const clientObj = DEMO_CLIENTS.find(c => c.id === client);
    const newId = 'p' + (DEMO_PROJECTS.length + 1);
    DEMO_PROJECTS.push({
      id: newId,
      name,
      client: clientObj ? (clientObj.company || `${clientObj.firstName} ${clientObj.lastName}`) : client,
      clientId: client,
      status,
      progress: 0,
      startDate: start,
      endDate: end,
      lead: lead || '—',
      tasks: { todo: 0, doing: 0, done: 0 },
    });

    close();
    // Recharger la vue liste
    const content = document.getElementById('tab-content');
    if (content) content.innerHTML = getListeHTML();
    document.querySelectorAll('.projects-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'liste'));
  });
}


/* ═══════════════════════════════════════════════════════════
   SECTION CLIENTS — Données démo
═══════════════════════════════════════════════════════════ */

const DEMO_CLIENTS = [
  { id: 'c1', firstName: 'Sophie',   lastName: 'Moreau',   company: 'Nike France',    email: 'sophie.moreau@nike.fr',   phone: '06 12 34 56 78', siret: '48247479800040', projectManager: 'Lucas Martin',  color: '#4f46e5' },
  { id: 'c2', firstName: 'Thomas',   lastName: 'Petit',    company: 'Renault',         email: 'thomas.petit@renault.com', phone: '06 23 45 67 89', siret: '78003543300040', projectManager: 'Camille Bernard', color: '#0ea5e9' },
  { id: 'c3', firstName: 'Isabelle', lastName: 'Laurent',  company: 'Sézane',          email: 'i.laurent@sezane.com',    phone: '06 34 56 78 90', siret: '',               projectManager: 'Antoine Dubois',  color: '#10b981' },
  { id: 'c4', firstName: 'Marc',     lastName: 'Durand',   company: 'TotalEnergies',   email: 'm.durand@total.fr',       phone: '06 45 67 89 01', siret: '54205118200013', projectManager: 'Lucas Martin',    color: '#f59e0b' },
  { id: 'c5', firstName: 'Claire',   lastName: 'Simon',    company: 'Evian',            email: 'claire.simon@evian.fr',   phone: '06 56 78 90 12', siret: '',               projectManager: 'Marie Lambert',   color: '#a78bfa' },
  { id: 'c6', firstName: 'Pierre',   lastName: 'Lefevre',  company: 'BNP Paribas',     email: 'p.lefevre@bnpparibas.fr', phone: '06 67 89 01 23', siret: '66204498800059', projectManager: 'Camille Bernard', color: '#ef4444' },
];

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
          <span class="clients-sidebar-title">Clients <span class="clients-count" id="clients-count">${DEMO_CLIENTS.length}</span></span>
          <button class="btn-icon" id="btn-new-client" title="Nouveau client">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
        <div class="clients-list" id="clients-list">
          ${renderClientListItems(DEMO_CLIENTS)}
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
  const c = DEMO_CLIENTS.find(x => x.id === clientId);
  if (!c) return;

  const clientProjects = DEMO_PROJECTS.filter(p => p.clientId === clientId || p.client === (c.company || `${c.firstName} ${c.lastName}`));

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
  document.getElementById('btn-delete-client')?.addEventListener('click', () => {
    if (confirm(`Supprimer le client "${c.company || c.firstName + ' ' + c.lastName}" ?`)) {
      const idx = DEMO_CLIENTS.findIndex(x => x.id === c.id);
      if (idx !== -1) DEMO_CLIENTS.splice(idx, 1);
      selectedClientId = null;
      document.getElementById('client-detail').innerHTML = `<div class="client-detail-empty"><i class="fa-solid fa-user-tie"></i><p>Sélectionnez un client pour voir sa fiche</p></div>`;
      document.getElementById('clients-list').innerHTML = renderClientListItems(DEMO_CLIENTS);
      document.getElementById('clients-count').textContent = DEMO_CLIENTS.length;
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
    const filtered = DEMO_CLIENTS.filter(c =>
      `${c.firstName} ${c.lastName} ${c.company} ${c.email}`.toLowerCase().includes(q)
    );
    document.getElementById('clients-list').innerHTML = renderClientListItems(filtered);
    document.getElementById('clients-count').textContent = filtered.length;
    // Ré-attacher les clics
    document.getElementById('clients-list')?.addEventListener('click', e2 => {
      const item = e2.target.closest('.client-list-item');
      if (!item) return;
      selectedClientId = item.dataset.clientId;
      document.querySelectorAll('.client-list-item').forEach(el => el.classList.toggle('active', el.dataset.clientId === selectedClientId));
      renderClientDetail(selectedClientId);
    });
  });

  // Sélectionner le premier client automatiquement
  if (DEMO_CLIENTS.length > 0) {
    selectedClientId = DEMO_CLIENTS[0].id;
    document.querySelectorAll('.client-list-item').forEach(el => el.classList.toggle('active', el.dataset.clientId === selectedClientId));
    renderClientDetail(selectedClientId);
  }
}

function openClientModal(clientId) {
  const existing = clientId ? DEMO_CLIENTS.find(c => c.id === clientId) : null;
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

  document.getElementById('cm-save').addEventListener('click', () => {
    const firstName = document.getElementById('cm-firstname').value.trim();
    const lastName  = document.getElementById('cm-lastname').value.trim();
    const email     = document.getElementById('cm-email').value.trim();
    const errEl     = document.getElementById('cm-error');

    if (!firstName) { errEl.textContent = 'Le prénom est requis.'; errEl.style.display='block'; return; }
    if (!lastName)  { errEl.textContent = 'Le nom est requis.';    errEl.style.display='block'; return; }
    if (!email)     { errEl.textContent = 'L\'email est requis.';  errEl.style.display='block'; return; }

    const colors = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#a78bfa','#ef4444'];

    if (existing) {
      Object.assign(existing, {
        firstName,
        lastName,
        company:        document.getElementById('cm-company').value.trim(),
        email,
        phone:          document.getElementById('cm-phone').value.trim(),
        siret:          document.getElementById('cm-siret').value.trim(),
        projectManager: document.getElementById('cm-pm').value.trim(),
      });
    } else {
      DEMO_CLIENTS.push({
        id:             'c' + (DEMO_CLIENTS.length + 1),
        firstName,
        lastName,
        company:        document.getElementById('cm-company').value.trim(),
        email,
        phone:          document.getElementById('cm-phone').value.trim(),
        siret:          document.getElementById('cm-siret').value.trim(),
        projectManager: document.getElementById('cm-pm').value.trim(),
        color:          colors[DEMO_CLIENTS.length % colors.length],
      });
    }

    close();
    // Rafraîchir la liste et la fiche
    const listEl = document.getElementById('clients-list');
    if (listEl) listEl.innerHTML = renderClientListItems(DEMO_CLIENTS);
    const countEl = document.getElementById('clients-count');
    if (countEl) countEl.textContent = DEMO_CLIENTS.length;
    const targetId = existing ? clientId : DEMO_CLIENTS[DEMO_CLIENTS.length - 1].id;
    selectedClientId = targetId;
    document.querySelectorAll('.client-list-item').forEach(el => el.classList.toggle('active', el.dataset.clientId === selectedClientId));
    renderClientDetail(targetId);
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
   SECTION MESSAGERIE — Données démo
═══════════════════════════════════════════════════════════ */

const DEMO_TEAM = [
  { id: 'u1', name: 'Lucas Martin',   initials: 'LM', color: '#0ea5e9', status: 'disponible',   role: 'Développeur' },
  { id: 'u2', name: 'Camille Bernard',initials: 'CB', color: '#a78bfa', status: 'disponible',   role: 'Designer' },
  { id: 'u3', name: 'Antoine Dubois', initials: 'AD', color: '#10b981', status: 'en_pause',     role: 'Directeur Artistique' },
  { id: 'u4', name: 'Marie Lambert',  initials: 'ML', color: '#f59e0b', status: 'indisponible', role: 'Chef de projet' },
  { id: 'u5', name: 'Julie Chen',     initials: 'JC', color: '#ef4444', status: 'disponible',   role: 'UX Designer' },
];

const DEMO_CONVS = [
  {
    id: 'conv1', userId: 'u1',
    lastMsg: 'Ok parfait, je regarde ça ce soir.', lastTime: '14:32', unread: 2,
    messages: [
      { from: 'u1', text: 'Salut ! Tu as regardé le brief Nike ?', time: '14:20' },
      { from: 'me', text: 'Oui, je l\'ai lu ce matin. Des questions ?', time: '14:22' },
      { from: 'u1', text: 'Le délai me semble court. Faisable en 3 semaines ?', time: '14:25' },
      { from: 'me', text: 'Si on démarre lundi oui. Je bloque du temps.', time: '14:28' },
      { from: 'u1', text: 'Ok parfait, je regarde ça ce soir.', time: '14:32' },
    ]
  },
  {
    id: 'conv2', userId: 'u2',
    lastMsg: 'Les maquettes sont prêtes pour review.', lastTime: '11:15', unread: 0,
    messages: [
      { from: 'u2', text: 'Bonjour ! J\'ai terminé les maquettes homepage.', time: '10:45' },
      { from: 'me', text: 'Super, tu peux partager le lien Figma ?', time: '10:48' },
      { from: 'u2', text: 'Voilà : figma.com/file/xyz — accès donné', time: '10:52' },
      { from: 'me', text: 'Merci, je regarde ça dans l\'après-midi.', time: '11:10' },
      { from: 'u2', text: 'Les maquettes sont prêtes pour review.', time: '11:15' },
    ]
  },
  {
    id: 'conv3', userId: 'u3',
    lastMsg: 'Réunion annulée pour demain.', lastTime: 'Hier', unread: 1,
    messages: [
      { from: 'u3', text: 'On fait le point sur Sézane ?', time: 'Hier 09:00' },
      { from: 'me', text: 'Oui, 14h ça te va ?', time: 'Hier 09:10' },
      { from: 'u3', text: 'Réunion annulée pour demain.', time: 'Hier 17:30' },
    ]
  },
  {
    id: 'conv4', userId: 'u4',
    lastMsg: 'Budget validé par le client.', lastTime: 'Lun', unread: 0,
    messages: [
      { from: 'u4', text: 'Update sur TotalEnergies : budget validé par le client.', time: 'Lun 16:00' },
      { from: 'me', text: 'Excellent ! On peut démarrer le sprint 2.', time: 'Lun 16:05' },
      { from: 'u4', text: 'Budget validé par le client.', time: 'Lun 16:00' },
    ]
  },
];

let activeConvId = null;

function getMessagerieHTML() {
  return `
    <div class="messagerie-layout">

      <!-- Colonne 1 : équipe en ligne -->
      <div class="msg-team-col">
        <div class="msg-col-header">
          <span class="msg-col-title">Équipe</span>
        </div>
        <div class="msg-team-list">
          ${DEMO_TEAM.map(u => {
            const statusColor = { disponible: '#10b981', en_pause: '#f59e0b', indisponible: '#ef4444' }[u.status] ?? '#94a3b8';
            const statusLabel = { disponible: 'Disponible', en_pause: 'En pause', indisponible: 'Indisponible' }[u.status] ?? u.status;
            return `
              <div class="msg-team-item" data-user-id="${u.id}" title="${u.name}">
                <div class="msg-team-avatar" style="background:${u.color}20; color:${u.color};">
                  ${u.initials}
                  <span class="msg-team-dot" style="background:${statusColor};"></span>
                </div>
                <div class="msg-team-info">
                  <p class="msg-team-name">${u.name}</p>
                  <p class="msg-team-status" style="color:${statusColor};">${statusLabel}</p>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Colonne 2 : liste des conversations -->
      <div class="msg-convs-col">
        <div class="msg-col-header">
          <span class="msg-col-title">Messages</span>
          <span class="msg-unread-total">${DEMO_CONVS.reduce((s,c)=>s+c.unread,0)}</span>
        </div>
        <div class="msg-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="msg-search-input" placeholder="Rechercher une conversation…">
        </div>
        <div class="msg-convs-list" id="msg-convs-list">
          ${renderConvList(DEMO_CONVS)}
        </div>
      </div>

      <!-- Colonne 3 : conversation active -->
      <div class="msg-chat-col" id="msg-chat-col">
        <div class="msg-chat-empty">
          <i class="fa-solid fa-comment-dots"></i>
          <p>Sélectionnez une conversation</p>
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

// Données démo utilisateurs avec permissions par section
const DEMO_USERS = [
  {
    id: 'usr1', displayName: 'Lucas Martin',    email: 'lucas.martin@agora.fr',    role: 'admin',
    status: 'disponible', createdAt: '2026-01-10',
    permissions: { dashboard: ['view','edit'], clients: ['view','edit','delete','export'], projets: ['view','edit','delete','export'], messagerie: ['view','edit'], planning: ['view','edit','delete'], documents: ['view','edit','delete','export'], parametres: ['view','edit'] },
  },
  {
    id: 'usr2', displayName: 'Camille Bernard', email: 'camille.bernard@agora.fr',  role: 'employee',
    status: 'disponible', createdAt: '2026-02-03',
    permissions: { dashboard: ['view'], clients: ['view','edit'], projets: ['view','edit'], messagerie: ['view','edit'], planning: ['view','edit'], documents: ['view','edit'], parametres: ['view'] },
  },
  {
    id: 'usr3', displayName: 'Antoine Dubois',  email: 'antoine.dubois@agora.fr',  role: 'employee',
    status: 'en_pause',  createdAt: '2026-02-15',
    permissions: { dashboard: ['view'], clients: ['view'], projets: ['view','edit'], messagerie: ['view','edit'], planning: ['view'], documents: ['view','edit'], parametres: ['view'] },
  },
  {
    id: 'usr4', displayName: 'Marie Lambert',   email: 'marie.lambert@agora.fr',   role: 'employee',
    status: 'indisponible', createdAt: '2026-03-01',
    permissions: { dashboard: ['view'], clients: ['view','edit','export'], projets: ['view','edit','export'], messagerie: ['view','edit'], planning: ['view','edit'], documents: ['view'], parametres: ['view'] },
  },
  {
    id: 'usr5', displayName: 'Julie Chen',      email: 'julie.chen@agora.fr',      role: 'employee',
    status: 'disponible', createdAt: '2026-04-20',
    permissions: { dashboard: ['view'], clients: ['view'], projets: ['view'], messagerie: ['view','edit'], planning: ['view'], documents: ['view'], parametres: ['view'] },
  },
];

let selectedUserId = null;

// ── HTML principal ───────────────────────────────────────────────────────────

function getUsersAdminHTML() {
  const adminCount    = DEMO_USERS.filter(u => u.role === 'admin').length;
  const employeeCount = DEMO_USERS.filter(u => u.role === 'employee').length;

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
            <span class="users-stat-num">${DEMO_USERS.length}</span>
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
          ${renderUserListItems(DEMO_USERS)}
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
  const u = DEMO_USERS.find(x => x.id === userId);
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
  document.getElementById('btn-delete-user')?.addEventListener('click', () => {
    if (confirm(`Supprimer l'utilisateur "${u.displayName}" ?`)) {
      const idx = DEMO_USERS.findIndex(x => x.id === u.id);
      if (idx !== -1) DEMO_USERS.splice(idx, 1);
      selectedUserId = null;
      document.getElementById('users-list').innerHTML = renderUserListItems(DEMO_USERS);
      document.getElementById('users-admin-detail').innerHTML = `<div class="client-detail-empty"><i class="fa-solid fa-shield-halved"></i><p>Sélectionnez un utilisateur pour gérer ses accès</p></div>`;
      updateUserStats();
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
  document.getElementById('btn-save-perms')?.addEventListener('click', () => {
    const targetUser = DEMO_USERS.find(x => x.id === userId);
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
    const filtered = DEMO_USERS.filter(u =>
      `${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(q)
    );
    document.getElementById('users-list').innerHTML = renderUserListItems(filtered);
    reattachUserListClicks();
  });

  // Sélectionner le premier
  if (DEMO_USERS.length > 0) {
    selectedUserId = DEMO_USERS[0].id;
    document.querySelectorAll('.users-list-item').forEach(el => el.classList.toggle('active', el.dataset.userId === selectedUserId));
    renderUserDetail(selectedUserId);
  }
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
  const adminCount    = DEMO_USERS.filter(u => u.role === 'admin').length;
  const employeeCount = DEMO_USERS.filter(u => u.role === 'employee').length;
  const pills = document.querySelectorAll('.users-stat-num');
  if (pills[0]) pills[0].textContent = DEMO_USERS.length;
  if (pills[1]) pills[1].textContent = adminCount;
  if (pills[2]) pills[2].textContent = employeeCount;
}

// ── Modal utilisateur ────────────────────────────────────────────────────────

function openUserModal(userId) {
  const existing = userId ? DEMO_USERS.find(u => u.id === userId) : null;
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

  document.getElementById('um-save').addEventListener('click', () => {
    const name     = document.getElementById('um-name').value.trim();
    const email    = document.getElementById('um-email').value.trim();
    const role     = document.getElementById('um-role').value;
    const status   = document.getElementById('um-status').value;
    const password = document.getElementById('um-password')?.value ?? '';
    const errEl    = document.getElementById('um-error');

    if (!name)  { errEl.textContent = 'Le nom est requis.';   errEl.style.display='block'; return; }
    if (!email) { errEl.textContent = 'L\'email est requis.'; errEl.style.display='block'; return; }
    if (!existing && password.length < 8) { errEl.textContent = 'Le mot de passe doit faire au moins 8 caractères.'; errEl.style.display='block'; return; }

    // Permissions par défaut pour un nouvel employé
    const defaultPerms = {};
    SECTIONS.forEach(sec => { defaultPerms[sec.key] = ['view']; });

    if (existing) {
      Object.assign(existing, { displayName: name, email, role, status });
    } else {
      DEMO_USERS.push({
        id:          'usr' + (DEMO_USERS.length + 1),
        displayName: name,
        email,
        role,
        status,
        createdAt:   new Date().toISOString().slice(0,10),
        permissions: role === 'admin'
          ? Object.fromEntries(SECTIONS.map(s => [s.key, ['view','edit','delete','export']]))
          : defaultPerms,
      });
    }

    close();
    document.getElementById('users-list').innerHTML = renderUserListItems(DEMO_USERS);
    updateUserStats();
    const targetId = existing ? userId : DEMO_USERS[DEMO_USERS.length - 1].id;
    selectedUserId = targetId;
    document.querySelectorAll('.users-list-item').forEach(el => el.classList.toggle('active', el.dataset.userId === selectedUserId));
    reattachUserListClicks();
    renderUserDetail(targetId);
  });
}


/* ═══════════════════════════════════════════════════════════
   UTILITAIRE
═══════════════════════════════════════════════════════════ */

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
