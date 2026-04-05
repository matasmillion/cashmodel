import { createContext, useContext, useReducer, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { PRODUCTS, CURRENT_WEEK_SEED, DEFAULT_ASSUMPTIONS, OPEX_SUBSCRIPTIONS, OPEX_WAREHOUSE, CREDIT_CARDS, LOANS, AD_UNIT_TYPES, DEFAULT_EVENTS } from '../data/seedData';
import { generateWeeklyProjections, generatePOSchedule } from '../utils/calculations';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
  scenarios: [
    { id: 'base', name: 'Base Case', assumptions: { ...DEFAULT_ASSUMPTIONS }, isActive: true },
  ],
  activeScenarioId: 'base',
  activeTab: 'dashboard',
};

// Keys we persist to Firestore (everything except transient UI state)
const PERSISTED_KEYS = [
  'products', 'seed', 'assumptions', 'subscriptions', 'warehouse',
  'creditCards', 'loans', 'adUnitTypes', 'scheduledAdUnits', 'events',
  'manualPOs', 'scenarios', 'activeScenarioId',
];

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };

    case 'LOAD_SAVED_STATE':
      return { ...state, ...action.payload };

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

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load state from Firestore on login
  useEffect(() => {
    if (!user) { setLoaded(true); return; }
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const saved = snap.data();
          dispatch({ type: 'LOAD_SAVED_STATE', payload: saved });
        }
      } catch (err) {
        console.error('Failed to load saved state:', err);
      }
      setLoaded(true);
    };
    setLoaded(false);
    load();
  }, [user]);

  // Auto-save to Firestore on state changes (debounced 2s)
  const saveToFirestore = useCallback(() => {
    if (!user) return;
    const toSave = {};
    for (const key of PERSISTED_KEYS) {
      toSave[key] = stateRef.current[key];
    }
    setDoc(doc(db, 'users', user.uid), toSave, { merge: true })
      .catch(err => console.error('Failed to save:', err));
  }, [user]);

  useEffect(() => {
    if (!user || !loaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveToFirestore, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [
    state.products, state.seed, state.assumptions, state.subscriptions,
    state.warehouse, state.creditCards, state.loans, state.adUnitTypes,
    state.scheduledAdUnits, state.events, state.manualPOs,
    state.scenarios, state.activeScenarioId,
    user, loaded, saveToFirestore,
  ]);

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

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
        <p className="text-xs uppercase tracking-[0.15em]" style={{ color: '#716F70', fontFamily: "'Inter', sans-serif" }}>
          Loading your model...
        </p>
      </div>
    );
  }

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
