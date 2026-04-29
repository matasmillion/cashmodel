import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ClerkProvider, useOrganization, CreateOrganization } from '@clerk/clerk-react';
import { AppProvider, useApp } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import KPICards from './components/KPICards';
import CashflowTable from './components/CashflowTable';
import UnitEconomics from './components/UnitEconomics';
import POBuilder from './components/POBuilder';
import POSchedule from './components/POSchedule';
import OpexManager from './components/OpexManager';
import ScenarioManager from './components/ScenarioManager';
import IntegrationsPanel from './components/IntegrationsPanel';
import RevenueForecast from './components/RevenueForecast';
import AdUnitModel from './components/AdUnitModel';
import RateCardManager from './components/RateCardManager';
import PLMView from './components/techpack/PLMView';
import RequireAuth from './components/auth/RequireAuth';
import SignInPage from './components/auth/SignInPage';
import SignUpPage from './components/auth/SignUpPage';
import AccountSecurityPage from './components/auth/AccountSecurityPage';
import AccountActivityPage from './components/auth/AccountActivityPage';
import UserProfilePage from './components/auth/UserProfilePage';
import SiteFooter from './components/SiteFooter';
import LegalRoutes from './components/legal/LegalRoutes';
import TopBar from './components/TopBar';

function OrgGate({ children }) {
  const { isLoaded, organization } = useOrganization();
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
        {state.activeTab === 'dashboard' && (
          <>
            <KPICards />
            <CashflowTable />
          </>
        )}
        {state.activeTab === 'revenue' && <RevenueForecast />}
        {state.activeTab === 'cashflow' && <CashflowTable />}
        {state.activeTab === 'ad-units' && <AdUnitModel />}
        {state.activeTab === 'unit-economics' && <UnitEconomics />}
        {state.activeTab === 'product' && <PLMView />}
        {state.activeTab === 'fulfillment' && <RateCardManager />}
        {state.activeTab === 'po-schedule' && <POSchedule />}
        {state.activeTab === 'pos' && <POBuilder />}
        {state.activeTab === 'opex' && <OpexManager />}
        {state.activeTab === 'scenarios' && <ScenarioManager />}
        {state.activeTab === 'integrations' && <IntegrationsPanel />}
      </main>

      <SiteFooter />
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
      <Routes>
        {/* /legal/* renders standalone, outside the FR app dashboard
            chrome, with no auth gate — these pages are publicly
            accessible per the rollout spec. */}
        <Route path="/legal/*" element={<LegalRoutes />} />
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
