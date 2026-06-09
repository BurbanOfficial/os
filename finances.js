/* ═══════════════════════════════════════════════════════════
   SECTION FINANCES — Pilotage financier complet
═══════════════════════════════════════════════════════════ */

const financesState = {
  metrics: {
    caMois: 0,
    caTrimestre: 0,
    caAnnee: 0,
    margeBrute: 0,
    margeNette: 0,
    resultatExploitation: 0,
    budgetTotal: 0,
    depensesEngagees: 0,
    tresorerie: 0,
    delaiPaiementMoyen: 0
  },
  invoices: [],
  expenses: [],
  budget: {},
  chartData: {
    monthly: [],
    quarterly: [],
    annual: []
  },
  currentPeriod: 'month',
  currentTab: 'overview'
};

async function loadFinancesData(forceRefresh = false) {
  if (!currentUid) return;

  if (!forceRefresh && dataCache.finances && dataCache.lastFetch.finances &&
      (Date.now() - dataCache.lastFetch.finances) < CACHE_DURATION) {
    Object.assign(financesState, dataCache.finances);
    renderFinancesContent();
    return;
  }

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentQuarter = Math.ceil(currentMonth / 3);

    const metricsRef = doc(db, 'finances', 'metrics', String(currentYear), 'summary');
    const metricsSnap = await getDoc(metricsRef);

    if (metricsSnap.exists()) {
      const data = metricsSnap.data();
      financesState.metrics = {
        caMois: data.monthly?.[currentMonth - 1]?.revenue || 0,
        caTrimestre: data.quarterly?.[currentQuarter - 1]?.revenue || 0,
        caAnnee: data.annual?.revenue || 0,
        margeBrute: data.monthly?.[currentMonth - 1]?.grossMargin || 0,
        margeNette: data.monthly?.[currentMonth - 1]?.netMargin || 0,
        resultatExploitation: data.monthly?.[currentMonth - 1]?.operatingResult || 0,
        budgetTotal: data.annual?.budget || 0,
        depensesEngagees: data.annual?.spent || 0,
        tresorerie: data.current?.cashFlow || 0,
        delaiPaiementMoyen: data.current?.avgPaymentDelay || 0
      };
      financesState.chartData = {
        monthly: data.monthly || [],
        quarterly: data.quarterly || [],
        annual: data.annual?.history || []
      };
    }

    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('year', '==', currentYear),
      orderBy('date', 'desc'),
      limit(50)
    );
    const invoicesSnap = await getDocs(invoicesQuery);
    financesState.invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const expensesQuery = query(
      collection(db, 'expenses'),
      where('year', '==', currentYear),
      orderBy('date', 'desc'),
      limit(50)
    );
    const expensesSnap = await getDocs(expensesQuery);
    financesState.expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const budgetRef = doc(db, 'finances', 'budget', String(currentYear), 'details');
    const budgetSnap = await getDoc(budgetRef);
    if (budgetSnap.exists()) {
      financesState.budget = budgetSnap.data();
    }

    dataCache.finances = { ...financesState };
    dataCache.lastFetch.finances = Date.now();

    renderFinancesContent();

  } catch (err) {
    console.warn('loadFinancesData:', err);
    showToast('Erreur lors du chargement des données financières', 'error');
  }
}

function renderFinancesContent() {
  const tabContent = document.getElementById('finances-tab-content');
  if (!tabContent) return;

  const activeTab = document.querySelector('.finances-tab.active')?.dataset.tab || 'overview';

  switch (activeTab) {
    case 'overview':
      tabContent.innerHTML = getFinancesOverviewHTML();
      initCharts();
      break;
    case 'invoices':
      tabContent.innerHTML = getFinancesInvoicesHTML();
      initInvoicesEvents();
      break;
    case 'budget':
      tabContent.innerHTML = getFinancesBudgetHTML();
      initBudgetEvents();
      break;
    case 'reports':
      tabContent.innerHTML = getFinancesReportsHTML();
      initReportsEvents();
      break;
  }
}
