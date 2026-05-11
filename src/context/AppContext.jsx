import { createContext, useContext, useReducer, useMemo, useEffect, useRef, useState } from 'react';
import { PRODUCTS, CURRENT_WEEK_SEED, DEFAULT_ASSUMPTIONS, OPEX_SUBSCRIPTIONS, OPEX_WAREHOUSE, CREDIT_CARDS, LOANS, AD_UNIT_TYPES, DEFAULT_EVENTS } from '../data/seedData';
import { generateWeeklyProjections, generatePOSchedule } from '../utils/calculations';
import { syncShopifyActuals, syncShopifyInventory, syncShopifyCapitalRepayment, syncMetaActuals, syncMetaDailyBudget, syncMetaBalanceOwed, syncPlaidActuals, syncPlaidCardPayments, syncShopifyPayoutsPending, syncPlaidPendingCharges, listPlaidItems } from '../utils/liveDataSync';
import { migrateManualPOsToStore } from '../utils/productionStore';
import { migrateLegacyInventoryHash } from '../utils/inventoryRouting';
import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { useCurrentUser, useCurrentOrg } from '../lib/auth';
import { bucketDepositoryAccounts, classifyCreditAccount, cardIdFromMask, OPERATING_MASK } from '../utils/bankAccountMap';

const LOCAL_STORAGE_KEY = 'cashmodel_state';
const INTEGRATIONS_KEY = 'cashmodel_integrations';

function loadIntegrations() {
  try { return JSON.parse(localStorage.getItem(INTEGRATIONS_KEY) || '{}'); } catch { return {}; }
}
function saveIntegrations(data) {
  localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('integrations-updated'));
}

// Pulls actuals from every connected integration and pushes them into the
// seed. Plaid is the single source of truth for bank + card balances now
// (Mercury accounts surface through Plaid). Shopify and Meta provide the
// past 13 weeks of revenue / ad spend, all of which we persist into
// state.actualsHistory so the engine can fill the gap between the seeded
// historical block and "this Monday" without projecting.
async function runAutoSync(dispatch) {
  const creds = loadIntegrations();
  const now = new Date().toISOString();
  const updated = { ...creds };
  let changed = false;
  const errors = {};
  const sources = [];
  const syncedAtBySource = {};

  const tasks = [];

  if (creds.shopify?.connected) {
    sources.push('shopify');
    tasks.push(
      syncShopifyActuals().then(weeks => {
        // Persist every week so the engine can fill gap weeks with real revenue
        const byDate = Object.fromEntries(
          weeks.filter(w => w.revenue != null).map(w => [w.startDate, { revenue: w.revenue, orders: w.orders }])
        );
        dispatch({ type: 'MERGE_ACTUALS', payload: { source: 'shopify', byDate } });

        const current = weeks.find(w => w.isCurrent);
        if (current) {
          dispatch({ type: 'UPDATE_SEED', payload: { revenue: current.revenue, date: current.startDate } });
        }
        syncedAtBySource.shopify = now;
        updated.shopify = {
          ...creds.shopify,
          syncedAt: now,
          lastSync: {
            syncedAt: now,
            currentWeekRevenue: current?.revenue ?? null,
            currentWeekOrders: current?.orders ?? null,
            weeks,
          },
        };
        changed = true;
      }).catch(err => {
        errors.shopify = err.message;
        console.warn('[auto-sync] Shopify revenue:', err.message);
      }),
    );

    // Inventory snapshot (variants + on-hand + L90 sales by day). Runs
    // alongside the revenue pull so the inventory module has live data
    // on first paint without requiring a manual sync from Sell-Through.
    sources.push('shopify-inventory');
    tasks.push(
      syncShopifyInventory().catch(err => {
        errors['shopify-inventory'] = err.message;
        console.warn('[auto-sync] Shopify inventory:', err.message);
      }),
    );

    // Pending Shopify Payments payouts — drives the "Shopify Payouts"
    // cashflow row. Two components:
    //   1. scheduled + in_transit (Shopify-reported pending)
    //   2. Shopify-reported "paid" in last 7d that don't yet show up
    //      as a deposit in Mercury Operating Cash (6848) — money the
    //      operator hasn't actually received yet.
    tasks.push(
      syncShopifyPayoutsPending().then(info => {
        dispatch({
          type: 'UPDATE_SEED',
          payload: {
            shopifyPayoutsPending: info.pendingTotal,
            shopifyPayoutsPendingDetail: info.payouts,
            shopifyPayoutsReportedPending: info.reportedPendingTotal,
            shopifyPayoutsUnmatchedPaidTotal: info.unmatchedPaidTotal,
            shopifyPayoutsUnmatchedPaidDetail: info.unmatchedPaidPayouts,
            shopifyPayoutsReconciliationSkipped: info.reconciliationSkipped,
            shopifyPayoutsPendingSyncedAt: now,
          },
        });
      }).catch(err => {
        errors.shopifyPayouts = err.message;
        console.warn('[auto-sync] Shopify pending payouts:', err.message);
      }),
    );

    // Pending Shopify Capital repayments (balance transactions with
    // source_type "shopify_capital_payment" that haven't settled yet).
    tasks.push(
      syncShopifyCapitalRepayment().then(info => {
        dispatch({
          type: 'UPDATE_SEED',
          payload: {
            shopifyCapitalPending: info.pendingTotal,
            shopifyCapitalPendingDetail: info.repayments,
            shopifyCapitalPendingSyncedAt: now,
          },
        });
      }).catch(err => {
        errors.shopifyCapital = err.message;
        console.warn('[auto-sync] Shopify Capital repayment:', err.message);
      }),
    );
  }

  if (creds.meta?.connected) {
    sources.push('meta');
    tasks.push(
      syncMetaActuals(creds.meta).then(weeks => {
        const byDate = Object.fromEntries(
          weeks.filter(w => w.adSpend != null).map(w => [w.startDate, { adSpend: w.adSpend, impressions: w.impressions, clicks: w.clicks }])
        );
        dispatch({ type: 'MERGE_ACTUALS', payload: { source: 'meta', byDate } });

        const current = weeks.find(w => w.isCurrent);
        if (current) {
          dispatch({ type: 'UPDATE_SEED', payload: { adSpend: current.adSpend } });
        }
        syncedAtBySource.meta = now;
        updated.meta = {
          ...creds.meta,
          syncedAt: now,
          lastSync: {
            syncedAt: now,
            currentWeekSpend: current?.adSpend ?? null,
            currentWeekImpressions: current?.impressions ?? null,
            currentWeekClicks: current?.clicks ?? null,
            weeks,
          },
        };
        changed = true;
      }).catch(err => {
        errors.meta = err.message;
        console.warn('[auto-sync] Meta:', err.message);
      }),
    );

    // Current unpaid balance with Meta — feeds the Ads Payable row.
    tasks.push(
      syncMetaBalanceOwed(creds.meta).then(info => {
        if (info?.balanceOwed != null) {
          dispatch({
            type: 'UPDATE_SEED',
            payload: {
              metaBalanceOwed: info.balanceOwed,
              metaBalanceOwedSyncedAt: now,
            },
          });
        }
      }).catch(err => {
        errors.metaBalance = err.message;
        console.warn('[auto-sync] Meta balance owed:', err.message);
      }),
    );

    // Also fetch the forward-looking daily budget from the CBO campaign
    // named "Acquisition" (substring match). The engine uses this to
    // anchor projected daily ad spend.
    tasks.push(
      syncMetaDailyBudget(creds.meta).then(info => {
        if (info?.dailyBudget != null) {
          dispatch({
            type: 'UPDATE_SEED',
            payload: {
              metaDailyBudget: info.dailyBudget,
              metaCampaignName: info.campaignName,
              metaCampaignStatus: info.status,
              metaDailyBudgetSyncedAt: now,
            },
          });
        } else {
          // No matching campaign — surface so the operator can see the
          // mismatch in the sync indicator instead of silently using
          // partial Meta insights.
          errors.metaBudget = 'No active CBO matching "Acquisition" found — see console';
        }
      }).catch(err => {
        errors.metaBudget = `Meta CBO sync failed: ${err.message}`;
        console.warn('[auto-sync] Meta daily budget:', err.message);
      }),
    );
  }

  // Plaid: now the single source of truth for all bank + card balances.
  // Mercury accounts surface here too (Plaid links directly to Mercury), so
  // the legacy mercury-proxy task is gone — keeping it caused a race where
  // whichever promise resolved last won, often serving stale Mercury cache
  // even after Plaid had fresh data.
  tasks.push((async () => {
    const items = await listPlaidItems().catch(() => []);
    if (!items || items.length === 0) return;
    sources.push('plaid');
    try {
      // Auto-sync uses the CACHED Plaid endpoint (/accounts/get) — free
      // with the Transactions product, and instant. The real-time
      // endpoint (/accounts/balance/get) fires a fresh call to each
      // bank in parallel — with 4+ linked items it routinely times out
      // and surfaces as "Failed to fetch", which blocks every seed
      // dispatch below (including the 6848 pin). Plaid keeps cached
      // balances current via background syncs, so for cashflow purposes
      // this is the right default. Manual "Sync balances" button still
      // forces real-time when the operator explicitly clicks it.
      let plaidResult;
      try {
        plaidResult = await syncPlaidActuals({ realTime: false });
      } catch (err) {
        // Even cached failed — try one more time before giving up so a
        // transient blip doesn't leave sbMain stale.
        console.warn('[auto-sync] Plaid cached fetch failed, retrying once:', err.message);
        plaidResult = await syncPlaidActuals({ realTime: false });
      }
      const { totals, depositoryAccounts, creditAccounts, itemErrors } = plaidResult;

      const bucketed = bucketDepositoryAccounts(depositoryAccounts);
      // Operating Cash row pins to the Mercury checking account ending in
      // OPERATING_MASK ('6848') specifically — NOT the sum of every
      // operating-classified sub-account.
      const operatingAccount = depositoryAccounts.find(a => a.mask === OPERATING_MASK);
      if (!operatingAccount) {
        console.warn(
          `[auto-sync] No Mercury depository account with mask ${OPERATING_MASK} found. ` +
          `Accounts seen: ${depositoryAccounts.map(a => `${a.name}(${a.mask})`).join(', ') || 'none'}. ` +
          `Item errors: ${itemErrors?.length ? JSON.stringify(itemErrors) : 'none'}`,
        );
      }
      const seedPayload = {
        totalCash: totals.depository,
        // CRITICAL: when 6848 is missing (e.g. Mercury item errored / not
        // linked), DO NOT fall back to bucketed.operating — that's a sum
        // of *other* depository accounts (Shopify Balance etc.) which
        // produces a misleading number like the $6,441 the operator saw.
        // Leaving sbMain undefined here means the reducer's spread
        // preserves the previous value rather than overwriting with junk.
        ...(operatingAccount ? { sbMain: operatingAccount.balance } : {}),
        sbSalesTax: -Math.abs(bucketed.salesTax),
        sbCorpTax: -Math.abs(bucketed.corporateTax),
        workingCapital: bucketed.workingCapital,
        // Mercury 7301 sub-account balance (classified by mask). Drives
        // the "Mercury Fulfillment (7301)" cashflow row.
        mercuryFulfillmentBalance: bucketed.fulfillment,
        bankAccounts: bucketed.accounts,
        // Persisted diagnostic so the Integrations panel can render
        // exactly what failed in the last auto-sync, even before the
        // operator clicks the manual button.
        plaidAutoSyncDiagnostic: (itemErrors && itemErrors.length) ? {
          stage: 'plaid-item-errors',
          summary: `${itemErrors.length} Plaid item(s) errored on auto-sync; their accounts are missing.`,
          itemErrors,
          syncedAt: now,
        } : null,
      };

      for (const a of creditAccounts) {
        const cashflowKey = classifyCreditAccount(a);
        if (cashflowKey) seedPayload[cashflowKey + 'Balance'] = a.balance;
        // Best-effort sync to the legacy state.creditCards array for any
        // other UI (POBuilder, etc.) — cashflow engine only reads seed.X
        const seedId = cardIdFromMask(a.mask);
        if (seedId) {
          dispatch({ type: 'UPDATE_CREDIT_CARD', payload: { id: seedId, updates: { balance: a.balance } } });
        }
      }

      dispatch({ type: 'UPDATE_SEED', payload: seedPayload });

      if (depositoryAccounts.length === 0 && creditAccounts.length === 0) {
        errors.plaid = 'Plaid returned no accounts — re-link your institutions';
      }

      // Past 90d of card payments → cardPaymentsActuals. The engine
      // prefers these over the static schedule and the rule generator
      // for any week we have transaction data for.
      try {
        const cardPayments = await syncPlaidCardPayments();
        if (Object.keys(cardPayments).length) {
          dispatch({ type: 'SET_CARD_PAYMENT_ACTUALS', payload: cardPayments });
        }
      } catch (err) {
        // Non-fatal — balances already updated; payments stay on the
        // static schedule until next sync.
        console.warn('[auto-sync] Plaid card payments:', err.message);
      }

      // Pending (unposted) charges per card. Used by Ads Payable:
      //   today = chase7248 balance + chase7248 pending + Meta owed
      try {
        const pending = await syncPlaidPendingCharges();
        const pendingPayload = {};
        for (const [cardKey, amount] of Object.entries(pending)) {
          pendingPayload[cardKey + 'PendingCharges'] = amount;
        }
        if (Object.keys(pendingPayload).length) {
          dispatch({ type: 'UPDATE_SEED', payload: pendingPayload });
        }
      } catch (err) {
        console.warn('[auto-sync] Plaid pending charges:', err.message);
      }

      syncedAtBySource.plaid = now;
    } catch (err) {
      errors.plaid = err.message;
      console.warn('[auto-sync] Plaid:', err.message);
      // Persist the full diagnostic to seed so IntegrationsPanel can
      // render it on next mount without the operator needing DevTools.
      dispatch({
        type: 'UPDATE_SEED',
        payload: {
          plaidAutoSyncDiagnostic: {
            stage: err.diagnostic?.stage || 'unknown',
            message: err.message,
            ...err.diagnostic,
            syncedAt: now,
          },
        },
      });
    }
  })());

  if (tasks.length === 0) return { sources: [], errors: {}, syncedAt: null, bySource: {} };
  await Promise.allSettled(tasks);

  // Stamp the seed with sync timestamps so the UI can show "Synced 4m ago"
  // and surface staleness if a source quietly fails.
  if (Object.keys(syncedAtBySource).length) {
    dispatch({ type: 'UPDATE_SEED', payload: { syncedAt: now, syncedAtBySource } });
  }

  if (changed) saveIntegrations(updated);
  return { sources, errors, syncedAt: now, bySource: syncedAtBySource };
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
  rateCard: null,
  // Per-week actuals from Shopify / Meta / Plaid, keyed by Monday ISO date.
  // Each entry merges fields from any source that synced for that week:
  //   { '2026-04-27': { revenue, orders, adSpend, impressions, clicks } }
  // The cashflow engine prefers actuals over historical seed and projection
  // for any week we have data for.
  actualsHistory: {},
  // Per-week credit-card payments aggregated from Plaid transactions, keyed
  // by Monday ISO date → { chase5718, amexPlum, amexBlue, ltLoan }. Highest
  // precedence source for the engine's card-payment outflow rows.
  cardPaymentsActuals: {},
  scenarios: [
    { id: 'base', name: 'Base Case', assumptions: { ...DEFAULT_ASSUMPTIONS }, isActive: true },
  ],
  activeScenarioId: 'base',
  activeTab: 'dashboard',
};

const PERSISTED_KEYS = [
  'products', 'seed', 'assumptions', 'subscriptions', 'warehouse',
  'creditCards', 'loans', 'adUnitTypes', 'scheduledAdUnits', 'events',
  'rateCard', 'actualsHistory', 'cardPaymentsActuals', 'scenarios', 'activeScenarioId',
];

// Top-level routes. The legacy 'sell-through', 'po-schedule', and 'pos'
// tabs were retired in Phase 7B/C; they now live under #inventory/* and
// inventoryRouting.migrateLegacyInventoryHash() redirects bookmarks.
const VALID_TABS = new Set([
  'dashboard', 'revenue', 'cashflow', 'ad-units', 'unit-economics',
  'product', 'fulfillment', 'opex', 'scenarios', 'integrations',
  'org-settings', 'creative-engine', 'inventory',
]);

function readTabFromHash() {
  if (typeof window === 'undefined') return null;
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  // First segment is the tab; sub-segments belong to nested routing (PLM, etc.)
  const first = raw.split('/')[0];
  return VALID_TABS.has(first) ? first : null;
}

// Bump when the shape of `assumptions` (or other persisted state) changes
// in a way that needs older localStorage payloads to be force-corrected.
// Migrations run at load time and overwrite the offending fields in-place.
const STATE_SCHEMA_VERSION = 5;

function migrateState(saved) {
  const v = saved.schemaVersion || 1;
  if (v >= STATE_SCHEMA_VERSION) return saved;
  const out = { ...saved };

  if (v < 2) {
    // v2: fulfillment % dropped from 10% → 9%. Force-correct any
    // stored value the older default seeded into a user's state and
    // every saved scenario.
    out.assumptions = { ...(saved.assumptions || {}), fulfillmentPercent: 0.09 };
    if (Array.isArray(saved.scenarios)) {
      out.scenarios = saved.scenarios.map(s => ({
        ...s,
        assumptions: { ...(s.assumptions || {}), fulfillmentPercent: 0.09 },
      }));
    }
  }

  if (v < 3) {
    // v3: actualsHistory introduced. Initialise to empty so reducers
    // don't have to defend against undefined.
    out.actualsHistory = saved.actualsHistory || {};
  }

  if (v < 4) {
    // v4: cardPaymentsActuals introduced (Plaid-sourced).
    out.cardPaymentsActuals = saved.cardPaymentsActuals || {};
  }

  if (v < 5) {
    // v5: collapse h1Growth / h2Growth into a single editable weeklyGrowth.
    // Drops growthSwitchDate + h2StartingDailySpend + weeklyGrowthH1/H2
    // legacy fields. Preserves any user-set value by preferring h1Growth
    // (closer to their operating reality).
    const collapse = (a) => {
      if (!a) return a;
      const wg = a.weeklyGrowth ?? a.h1Growth ?? a.weeklyGrowthH1 ?? 1.04;
      const { h1Growth, h2Growth, weeklyGrowthH1, weeklyGrowthH2, growthSwitchDate, h2StartingDailySpend, ...rest } = a;
      return { ...rest, weeklyGrowth: wg };
    };
    out.assumptions = collapse(saved.assumptions);
    if (Array.isArray(saved.scenarios)) {
      out.scenarios = saved.scenarios.map(s => ({ ...s, assumptions: collapse(s.assumptions) }));
    }
  }

  out.schemaVersion = STATE_SCHEMA_VERSION;
  return out;
}

function loadInitialState() {
  const hashTab = readTabFromHash();
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const saved = migrateState(JSON.parse(raw));
      return { ...initialState, ...saved, ...(hashTab ? { activeTab: hashTab } : {}) };
    }
  } catch (err) {
    console.error('Failed to load saved state:', err);
  }
  return { ...initialState, schemaVersion: STATE_SCHEMA_VERSION, ...(hashTab ? { activeTab: hashTab } : {}) };
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

    case 'MERGE_ACTUALS': {
      // Merges a {date → {field: value}} map into actualsHistory. Fields
      // from a new source overlay any existing entry for the same week.
      const { byDate } = action.payload;
      const merged = { ...(state.actualsHistory || {}) };
      for (const [date, fields] of Object.entries(byDate)) {
        merged[date] = { ...(merged[date] || {}), ...fields };
      }
      return { ...state, actualsHistory: merged };
    }

    case 'SET_CARD_PAYMENT_ACTUALS':
      // Replaces cardPaymentsActuals with the latest sweep (Plaid is the
      // source of truth — no need to merge with stale entries).
      return { ...state, cardPaymentsActuals: action.payload };

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

  // Migrate legacy hashes (#sell-through, #po-schedule, #pos, #new-po)
  // to their new #inventory/* homes once on boot. Bookmarks survive.
  useEffect(() => {
    migrateLegacyInventoryHash();
  }, []);

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

    // One-time migration: import any legacy manualPOs from localStorage into
    // productionStore. The shim is idempotent and self-disables after first run.
    const legacyPOs = (() => {
      try {
        const raw = localStorage.getItem('cashmodel_state');
        return JSON.parse(raw || '{}')?.manualPOs || [];
      } catch { return []; }
    })();
    migrateManualPOsToStore(legacyPOs).catch(err =>
      console.error('migrateManualPOsToStore:', err)
    );

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
    generateWeeklyProjections(state.assumptions, state.seed, [], state.scheduledAdUnits, state.events, state.creditCards, state.loans),
    [state.assumptions, state.seed, state.scheduledAdUnits, state.events, state.creditCards, state.loans]
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
