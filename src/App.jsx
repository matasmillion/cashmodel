import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ClerkProvider, useOrganization, CreateOrganization } from '@clerk/clerk-react';
import { AppProvider, useApp } from './context/AppContext';
import { clearAssetUrlCache } from './utils/plmAssets';
import ErrorBoundary from './components/ErrorBoundary';
// Eager: the app shell + the default 'dashboard' tab, so first paint is instant
// with no Suspense flash.
import KPICards from './components/KPICards';
import Cashflow58WeekTable from './components/Cashflow58WeekTable';
import RequireAuth from './components/auth/RequireAuth';
import SignInPage from './components/auth/SignInPage';
import SignUpPage from './components/auth/SignUpPage';
import SiteFooter from './components/SiteFooter';
import TopBar from './components/TopBar';
import SyncStatusBadge from './components/SyncStatusBadge';

// Code-split: every other tab module + secondary route surface loads on demand.
// This is the biggest cold-start win — PLM/Creative/Inventory each pull in large
// subtrees (recharts, jspdf, html2canvas) that no longer ship in the main bundle.
//
// lazyWithReload survives deploys: chunk filenames carry a content hash, so each
// deploy renames them. An already-open older page that then opens a tab would
// request a chunk that no longer exists → "Failed to fetch dynamically imported
// module". We retry once, then force a single reload to pick up the new build's
// index.html + chunk names. A sessionStorage timestamp prevents reload loops.
function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch(async (err) => {
      try {
        return await factory(); // retry once — covers a transient network blip
      } catch (err2) {
        const msg = `${err?.message || ''} ${err2?.message || ''}`;
        const isChunkError = /dynamically imported module|module script failed|failed to fetch|error loading dynamically/i.test(msg);
        const KEY = 'fr_chunk_reloaded_at';
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (isChunkError && Date.now() - last > 15000) {
          try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
          window.location.reload();
          return new Promise(() => {}); // hang until the reload happens
        }
        throw err2;
      }
    })
  );
}

const CashflowTable = lazyWithReload(() => import('./components/CashflowTable'));
const UnitEconomics = lazyWithReload(() => import('./components/UnitEconomics'));
const OpexManager = lazyWithReload(() => import('./components/OpexManager'));
const ScenarioManager = lazyWithReload(() => import('./components/ScenarioManager'));
const IntegrationsPanel = lazyWithReload(() => import('./components/IntegrationsPanel'));
const RevenueForecast = lazyWithReload(() => import('./components/RevenueForecast'));
const AdUnitModel = lazyWithReload(() => import('./components/AdUnitModel'));
const RateCardManager = lazyWithReload(() => import('./components/RateCardManager'));
const PLMView = lazyWithReload(() => import('./components/techpack/PLMView'));
const CreativeEngineView = lazyWithReload(() => import('./components/creative/CreativeEngineView'));
const InventoryView = lazyWithReload(() => import('./components/inventory/InventoryView'));
const OrgSettings = lazyWithReload(() => import('./components/settings/OrgSettings'));
const AccountSecurityPage = lazyWithReload(() => import('./components/auth/AccountSecurityPage'));
const AccountActivityPage = lazyWithReload(() => import('./components/auth/AccountActivityPage'));
const UserProfilePage = lazyWithReload(() => import('./components/auth/UserProfilePage'));
const LegalRoutes = lazyWithReload(() => import('./components/legal/LegalRoutes'));
const VendorPortalRoutes = lazyWithReload(() => import('./components/vendor/VendorPortalRoutes'));

// Brand-styled fallback shown while a lazy chunk loads.
function ViewFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: '#716F70', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, letterSpacing: '0.03em' }}>
      Loading…
    </div>
  );
}

function OrgGate({ children }) {
  const { isLoaded, organization } = useOrganization();
  // Watch for org switches and flush every PLM signed-URL cache so a
  // member of multiple orgs never sees a cached URL signed against the
  // previous org's bucket prefix.
  const lastOrgIdRef = useRef(null);
  useEffect(() => {
    const id = organization?.id || null;
    if (lastOrgIdRef.current !== null && lastOrgIdRef.current !== id) {
      clearAssetUrlCache();
    }
    lastOrgIdRef.current = id;
  }, [organization?.id]);
  if (!isLoaded) return null;
  if (!organization) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#F5F0E8' }}>
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </div>
    );
  }
  return children;
}

function Dashboard() {
  const { state } = useApp();

  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8' }}>
      <TopBar />

      <main className="px-8 py-8 space-y-6">
        <Suspense fallback={<ViewFallback />}>
          {state.activeTab === 'dashboard' && (
            <>
              <KPICards />
              <Cashflow58WeekTable />
            </>
          )}
          {state.activeTab === 'revenue' && <RevenueForecast />}
          {state.activeTab === 'cashflow' && <CashflowTable />}
          {state.activeTab === 'ad-units' && <AdUnitModel />}
          {state.activeTab === 'unit-economics' && <UnitEconomics />}
          {state.activeTab === 'product' && <PLMView />}
          {state.activeTab === 'creative-engine' && <CreativeEngineView />}
          {state.activeTab === 'inventory' && <InventoryView />}
          {state.activeTab === 'fulfillment' && <RateCardManager />}
          {state.activeTab === 'opex' && <OpexManager />}
          {state.activeTab === 'scenarios' && <ScenarioManager />}
          {state.activeTab === 'integrations' && <IntegrationsPanel />}
          {state.activeTab === 'org-settings' && <OrgSettings />}
        </Suspense>
      </main>

      <SiteFooter />
      <SyncStatusBadge />
    </div>
  );
}

// Vite serves the SPA from `/cashmodel/`, so React Router's basename
// must match. import.meta.env.BASE_URL ends in a slash — strip it so
// the basename is `/cashmodel` (no trailing slash) per react-router-dom
// expectations.
const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY && typeof window !== 'undefined') {
  // Dev / preview without Clerk keys configured will hit this. Better
  // to surface a loud error than to silently fail in <ClerkProvider>.
  // eslint-disable-next-line no-console
  console.error('Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env.local for dev or as a GitHub Actions secret for the Pages build.');
}

// Clerk + react-router-dom integration: ClerkProvider sits inside
// BrowserRouter so it can read the navigate function; we hand it
// routerPush / routerReplace so Clerk's internal redirects
// (sign-in -> sign-up, completed sign-in -> dashboard, etc.) stay
// SPA-internal instead of doing window.location reloads.
function RoutedApp() {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      <Suspense fallback={<ViewFallback />}>
      <Routes>
        {/* /legal/* renders standalone, outside the FR app dashboard
            chrome, with no auth gate — these pages are publicly
            accessible per the rollout spec. */}
        <Route path="/legal/*" element={<LegalRoutes />} />
        {/* /vendor/* — external surface, separate auth (Clerk
            sign-in/up scoped to the vendor portal), separate i18n
            provider, and hard cost/internal-data redaction at the
            store layer. Mounts entirely outside the internal app
            shell and the OrgGate. */}
        <Route path="/vendor/*" element={<VendorPortalRoutes />} />
        {/* Sign-in / sign-up are public; Clerk's Restricted sign-up
            mode enforces the invite gate at /sign-up. */}
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        {/* /account/* — gated. Custom security overview at the top
            level; Clerk's <UserProfile /> mounts at /manage for the
            full ongoing-management flow. */}
        <Route
          path="/account/security/manage/*"
          element={<RequireAuth><UserProfilePage /></RequireAuth>}
        />
        <Route
          path="/account/security/activity"
          element={<RequireAuth><AccountActivityPage /></RequireAuth>}
        />
        <Route
          path="/account/security"
          element={<RequireAuth><AccountSecurityPage /></RequireAuth>}
        />
        {/* Everything else falls through to the existing FR dashboard
            shell, gated by <RequireAuth> which redirects unauthed
            users to /sign-in. The OrgGate ensures an org exists before
            the app mounts — first-time users complete CreateOrganization. */}
        <Route
          path="*"
          element={
            <RequireAuth>
              <OrgGate>
                <AppProvider>
                  <Dashboard />
                </AppProvider>
              </OrgGate>
            </RequireAuth>
          }
        />
      </Routes>
      </Suspense>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={ROUTER_BASENAME}>
        <RoutedApp />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
