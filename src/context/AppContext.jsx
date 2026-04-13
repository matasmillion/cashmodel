import { createContext, useContext, useReducer, useMemo, useEffect, useRef } from 'react';
import { PRODUCTS, CURRENT_WEEK_SEED, DEFAULT_ASSUMPTIONS, OPEX_SUBSCRIPTIONS, OPEX_WAREHOUSE, CREDIT_CARDS, LOANS, AD_UNIT_TYPES, DEFAULT_EVENTS } from '../data/seedData';
import { generateWeeklyProjections, generatePOSchedule } from '../utils/calculations';
import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'cashmodel_state';

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

function loadInitialState() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...initialState, ...saved };
    }
  } catch (err) {
    console.error('Failed to load saved state:', err);
  }
  return initialState;
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
  const saveTimerRef = useRef(null);
  const userIdRef = useRef(null);

  // Listen to Supabase auth state — load cloud data when user signs in
  useEffect(() => {
    if (!IS_SUPABASE_ENABLED) return;

    async function loadCloudState(userId) {
      const { data, error } = await supabase
        .from('user_state')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error && data?.state) {
        dispatch({ type: 'LOAD_CLOUD_STATE', payload: data.state });
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        userIdRef.current = session.user.id;
        loadCloudState(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user?.id ?? null;
      if (session?.user) loadCloudState(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          await supabase.from('user_state').upsert({
            user_id: userIdRef.current,
            state: toSave,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
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
    <AppContext.Provider value={{ state, dispatch, projections, autoPOs, totalMonthlyOpex }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
