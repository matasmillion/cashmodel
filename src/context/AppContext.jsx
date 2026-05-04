import { createContext, useContext, useReducer, useMemo, useEffect, useRef, useState } from 'react';
import { PRODUCTS, CURRENT_WEEK_SEED, DEFAULT_ASSUMPTIONS, OPEX_SUBSCRIPTIONS, OPEX_WAREHOUSE, CREDIT_CARDS, LOANS, AD_UNIT_TYPES, DEFAULT_EVENTS } from '../data/seedData';
import { generateWeeklyProjections, generatePOSchedule } from '../utils/calculations';
import { syncShopifyActuals, syncMetaActuals, syncMercuryActuals, syncPlaidActuals, listPlaidItems } from '../utils/liveDataSync';
import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { useCurrentUser, useCurrentOrg } from '../lib/auth';
import { bucketDepositoryAccounts, classifyCreditAccount, cardIdFromMask } from '../utils/bankAccountMap';

const LOCAL_STORAGE_KEY = 'cashmodel_state';
const INTEGRATIONS_KEY = 'cashmodel_integrations';

function loadIntegrations() {
  try { return JSON.parse(localStorage.getItem(INTEGRATIONS_KEY) || '{}'); } catch { return {}; }
}
function saveIntegrations(data) {
  localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('integrations-updated'));
}

// Pulls current-week actuals from any connected integrations and pushes them
// into the seed. Returns a summary so the UI can show sync state.
async function runAutoSync(dispatch) {
  const creds = loadIntegrations();
  const now = new Date().toISOString();
  const updated = { ...creds };
  let changed = false;
  const errors = {};
  const sources = [];

  const tasks = [];

  if (creds.shopify?.connected) {
    sources.push('shopify');
    tasks.push(
      syncShopifyActuals().then(weeks => {
        const current = weeks.find(w => w.isCurrent);
        if (!current) return;
        dispatch({ type: 'UPDATE_SEED', payload: { revenue: current.revenue, date: current.startDate } });
        updated.shopify = {
          ...creds.shopify,
          syncedAt: now,
          lastSync: {
            syncedAt: now,
            currentWeekRevenue: current.revenue,
            currentWeekOrders: current.orders,
            weeks,
          },
        };
        changed = true;
      }).catch(err => {
        errors.shopify = err.message;
        console.warn('[auto-sync] Shopify:', err.message);
      }),
    );
  }

  if (creds.meta?.connected) {
    sources.push('meta');
    tasks.push(
      syncMetaActuals(creds.meta).then(weeks => {
        const current = weeks.find(w => w.isCurrent);
        if (!current) return;
        dispatch({ type: 'UPDATE_SEED', payload: { adSpend: current.adSpend } });
        updated.meta = {
          ...creds.meta,
          syncedAt: now,
          lastSync: {
            syncedAt: now,
            currentWeekSpend: current.adSpend,
            currentWeekImpressions: current.impressions,
            currentWeekClicks: current.clicks,
            weeks,
          },
        };
        changed = true;
      }).catch(err => {
        errors.meta = err.message;
        console.warn('[auto-sync] Meta:', err.message);
      }),
    );
  }

  if (creds.mercury?.connected) {
    sources.push('mercury');
    tasks.push(
      syncMercuryActuals().then(({ accounts, primaryBalance }) => {
        dispatch({
          type: 'UPDATE_SEED',
          payload: {
            totalCash: Math.round(primaryBalance * 100) / 100,
            sbMain: Math.round(primaryBalance * 100) / 100,
          },
        });
        updated.mercury = {
          ...creds.mercury,
          syncedAt: now,
          lastSync: { syncedAt: now, primaryBalance, accountCount: accounts.length },
        };
        changed = true;
      }).catch(err => {
        errors.mercury = err.message;
        console.warn('[auto-sync] Mercury:', err.message);
      }),
    );
  }

  // Plaid (Mercury / Chase / AMEX / any connected institution). All of the
  // user's bank + card data flows through Plaid now, so this is the source of
  // truth for the cashflow's "Cash on Hand" and "OPEX CARDS" rows.
  tasks.push((async () => {
    const items = await listPlaidItems().catch(() => []);
    if (!items || items.length === 0) return;
    sources.push('plaid');
    try {
      const { totals, depositoryAccounts, creditAccounts } = await syncPlaidActuals();

      // Bank accounts → bucketed by name (operating / sales tax / corp tax /
      // working capital). The cashflow engine reads these to anchor the
      // current week's balance-sheet rows.
      const bucketed = bucketDepositoryAccounts(depositoryAccounts);
      dispatch({
        type: 'UPDATE_SEED',
        payload: {
          totalCash: totals.depository,
          sbMain: bucketed.operating,
          sbSalesTax: -Math.abs(bucketed.salesTax),     // shown as negative on the BS
          sbCorpTax: -Math.abs(bucketed.corporateTax),
          workingCapital: bucketed.workingCapital,
          bankAccounts: bucketed.accounts,
        },
      });

      // Credit cards & loans → match by mask first (most reliable), then by
      // name pattern (catches AMEX Plum which Plaid surfaces without a mask).
      for (const a of creditAccounts) {
        const seedId = cardIdFromMask(a.mask);
        if (seedId) {
          dispatch({ type: 'UPDATE_CREDIT_CARD', payload: { id: seedId, updates: { balance: a.balance } } });
        }
        const cashflowKey = classifyCreditAccount(a);
        if (cashflowKey) {
          dispatch({
            type: 'UPDATE_SEED',
            payload: { [cashflowKey + 'Balance']: a.balance },
          });
        }
      }
    } catch (err) {
      errors.plaid = err.message;
      console.warn('[auto-sync] Plaid:', err.message);
    }
  })());

  if (tasks.length === 0) return { sources: [], errors: {}, syncedAt: null };
  await Promise.allSettled(tasks);
  if (changed) saveIntegrations(updated);
  return { sources, errors, syncedAt: now };
}

const AppContext = createContext();

const initialState = {
  products: PRODUCTS,
  seed: CURRENT_WEEK_SEED,
  assumptions: { ...DEFAULT_ASSUMPTIONS },
  subscriptions: OPEX_SUBSCRIPTIONS,
  warehouse: OPEX_WAREHOUSE,
  creditCards: CREDIT_CARDS,
  loans: LOANS,
  adUnitTypes: AD_UNIT_TYPES,
  scheduledAdUnits: [],
  events: DEFAULT_EVENTS,
  manualPOs: [],
  rateCard: null,
  scenarios: [
    { id: 'base', name: 'Base Case', assumptions: { ...DEFAULT_ASSUMPTIONS }, isActive: true },
  ],
  activeScenarioId: 'base',
  activeTab: 'dashboard',
};

const PERSISTED_KEYS = [
  'products', 'seed', 'assumptions', 'subscriptions', 'warehouse',
  'creditCards', 'loans', 'adUnitTypes', 'scheduledAdUnits', 'events',
  'manualPOs', 'rateCard', 'scenarios', 'activeScenarioId',
];

const VALID_TABS = new Set([
  'dashboard', 'revenue', 'cashflow', 'ad-units', 'unit-economics',
  'product', 'sell-through', 'fulfillment', 'po-schedule', 'pos', 'opex', 'scenarios', 'integrations',
  'org-settings',
]);

function readTabFromHash() {
  if (typeof window === 'undefined') return null;
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  // First segment is the tab; sub-segments belong to nested routing (PLM, etc.)
  const first = raw.split('/')[0];
  return VALID_TABS.has(first) ? first : null;
}

function loadInitialState() {
  const hashTab = readTabFromHash();
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...initialState, ...saved, ...(hashTab ? { activeTab: hashTab } : {}) };
    }
  } catch (err) {
    console.error('Failed to load saved state:', err);
  }
  return { ...initialState, ...(hashTab ? { activeTab: hashTab } : {}) };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };

    case 'UPDATE_ASSUMPTIONS': {
      const updated = { ...state.assumptions, ...action.payload };
      return {
        ...state,
        assumptions: updated,
        scenarios: state.scenarios.map(s =>
          s.id === state.activeScenarioId ? { ...s, assumptions: updated } : s
        ),
      };
    }

    case 'ADD_PRODUCT': {
      const { collectionId, product } = action.payload;
      const collection = state.products[collectionId] || { collectionName: collectionId, products: [] };
      return { ...state, products: { ...state.products, [collectionId]: { ...collection, products: [...collection.products, product] } } };
    }
    case 'UPDATE_PRODUCT': {
      const { collectionId, productId, updates } = action.payload;
      return { ...state, products: { ...state.products, [collectionId]: { ...state.products[collectionId], products: state.products[collectionId].products.map(p => p.id === productId ? { ...p, ...updates } : p) } } };
    }
    case 'ADD_COLLECTION':
      return { ...state, products: { ...state.products, [action.payload.id]: { collectionName: action.payload.name, products: [] } } };
    case 'DELETE_PRODUCT': {
      const { collectionId, productId } = action.payload;
      return { ...state, products: { ...state.products, [collectionId]: { ...state.products[collectionId], products: state.products[collectionId].products.filter(p => p.id !== productId) } } };
    }

    case 'ADD_PO':
      return { ...state, manualPOs: [...state.manualPOs, action.payload] };
    case 'REMOVE_PO':
      return { ...state, manualPOs: state.manualPOs.filter(po => po.id !== action.payload) };

    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'REMOVE_EVENT':
      return { ...state, events: state.events.filter(e => e.id !== action.payload) };
    case 'UPDATE_EVENT': {
      const { id, updates } = action.payload;
      return { ...state, events: state.events.map(e => e.id === id ? { ...e, ...updates } : e) };
    }

    case 'ADD_AD_UNIT':
      return { ...state, scheduledAdUnits: [...state.scheduledAdUnits, action.payload] };
    case 'REMOVE_AD_UNIT':
      return { ...state, scheduledAdUnits: state.scheduledAdUnits.filter(u => u.id !== action.payload) };

    case 'UPDATE_SUBSCRIPTION': {
      const { id, updates } = action.payload;
      return { ...state, subscriptions: state.subscriptions.map(s => s.id === id ? { ...s, ...updates } : s) };
    }
    case 'ADD_SUBSCRIPTION':
      return { ...state, subscriptions: [...state.subscriptions, action.payload] };
    case 'UPDATE_WAREHOUSE':
      return { ...state, warehouse: { ...state.warehouse, ...action.payload } };

    case 'SET_RATE_CARD':
      return { ...state, rateCard: action.payload };

    case 'ADD_SCENARIO':
      return { ...state, scenarios: [...state.scenarios, { ...action.payload, assumptions: { ...state.assumptions } }] };
    case 'SWITCH_SCENARIO': {
      const scenario = state.scenarios.find(s => s.id === action.payload);
      if (!scenario) return state;
      return { ...state, activeScenarioId: action.payload, assumptions: { ...scenario.assumptions }, scenarios: state.scenarios.map(s => ({ ...s, isActive: s.id === action.payload })) };
    }
    case 'DELETE_SCENARIO': {
      if (state.scenarios.length <= 1) return state;
      const filtered = state.scenarios.filter(s => s.id !== action.payload);
      return { ...state, scenarios: filtered, activeScenarioId: state.activeScenarioId === action.payload ? filtered[0].id : state.activeScenarioId };
    }

    case 'UPDATE_CREDIT_CARD': {
      const { id, updates } = action.payload;
      return { ...state, creditCards: state.creditCards.map(c => c.id === id ? { ...c, ...updates } : c) };
    }

    case 'UPDATE_SEED':
      return { ...state, seed: { ...state.seed, ...action.payload } };

    case 'UPDATE_LOANS':
      return { ...state, loans: { ...state.loans, ...action.payload } };

    case 'LOAD_CLOUD_STATE': {
      // Replace persisted keys with cloud data, keep active tab
      const { activeTab } = state;
      return { ...state, ...action.payload, activeTab };
    }

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const [autoSyncState, setAutoSyncState] = useState({
    status: 'idle', // 'idle' | 'syncing' | 'ok' | 'error' | 'partial'
    sources: [],
    errors: {},
    syncedAt: null,
  });
  const saveTimerRef = useRef(null);
  const userIdRef = useRef(null);

  // Wrap runAutoSync so we can track status in React state.
  async function triggerAutoSync() {
    setAutoSyncState(s => ({ ...s, status: 'syncing', errors: {} }));
    try {
      const result = await runAutoSync(dispatch);
      if (!result || result.sources.length === 0) {
        setAutoSyncState({ status: 'idle', sources: [], errors: {}, syncedAt: null });
        return;
      }
      const errorCount = Object.keys(result.errors).length;
      setAutoSyncState({
        status: errorCount === 0 ? 'ok' : errorCount === result.sources.length ? 'error' : 'partial',
        sources: result.sources,
        errors: result.errors,
        syncedAt: result.syncedAt,
      });
    } catch (err) {
      setAutoSyncState({ status: 'error', sources: [], errors: { _: err.message }, syncedAt: null });
    }
  }

  // Sync activeTab with URL hash. Only touches the first segment, so nested
  // routing inside a tab (e.g. #product/styles/abc/5) is preserved when the
  // user is already on that tab.
  useEffect(() => {
    const currentFirst = (window.location.hash || '').replace(/^#\/?/, '').split('/')[0];
    if (currentFirst !== state.activeTab) {
      window.history.pushState(null, '', `#${state.activeTab}`);
    }
  }, [state.activeTab]);

  useEffect(() => {
    const onHashChange = () => {
      const first = (window.location.hash || '').replace(/^#\/?/, '').split('/')[0];
      if (VALID_TABS.has(first) && first !== state.activeTab) {
        dispatch({ type: 'SET_TAB', payload: first });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, [state.activeTab]);

  // Listen to the auth state — load cloud data when user signs in,
  // then kick off auto-sync so integration data overrides any stale
  // cloud seed. Source of truth for "who's signed in" moved to
  // src/lib/auth (Clerk-backed) when we replaced Supabase Auth.
  const currentUser = useCurrentUser();
  const currentOrg = useCurrentOrg();
  const orgId = currentOrg?.id || null;

  useEffect(() => {
    if (!IS_SUPABASE_ENABLED) {
      triggerAutoSync();
      return;
    }

    async function loadCloudState(id) {
      const db = await getAuthedSupabase();
      if (!db) return;
      const { data, error } = await db
        .from('app_state')
        .select('state')
        .eq('org_id', id)
        .maybeSingle();
      if (!error && data?.state) {
        dispatch({ type: 'LOAD_CLOUD_STATE', payload: data.state });
      }
    }

    userIdRef.current = orgId;
    if (orgId) {
      loadCloudState(orgId).then(() => triggerAutoSync());
    } else {
      triggerAutoSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Auto-save: localStorage always, Supabase when signed in (debounced 500ms)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const toSave = {};
        for (const key of PERSISTED_KEYS) {
          toSave[key] = state[key];
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));

        if (IS_SUPABASE_ENABLED && userIdRef.current) {
          const db = await getAuthedSupabase();
          if (db) {
            await db.from('app_state').upsert({
              org_id: userIdRef.current,
              state: toSave,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id' });
          }
        }
      } catch (err) {
        console.error('Failed to save state:', err);
      }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state]);

  const projections = useMemo(() =>
    generateWeeklyProjections(state.assumptions, state.seed, state.manualPOs, state.scheduledAdUnits, state.events, state.creditCards, state.loans),
    [state.assumptions, state.seed, state.manualPOs, state.scheduledAdUnits, state.events, state.creditCards, state.loans]
  );

  const autoPOs = useMemo(() =>
    generatePOSchedule(projections, state.assumptions),
    [projections, state.assumptions]
  );

  const totalMonthlyOpex = useMemo(() => {
    const activeSubs = state.subscriptions.filter(s => s.active).reduce((sum, s) => sum + s.cost, 0);
    const warehouseTotal = Object.values(state.warehouse).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
    return activeSubs + warehouseTotal;
  }, [state.subscriptions, state.warehouse]);

  return (
    <AppContext.Provider value={{ state, dispatch, projections, autoPOs, totalMonthlyOpex, autoSyncState, triggerAutoSync }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
