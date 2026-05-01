// @ts-check
// Top-level /vendor/* routing entry. Wraps every authenticated screen
// in <VendorRequireAuth /> + the i18n LocaleProvider so vendors get
// their preferred language across the whole portal.
//
// /vendor/sign-in and /vendor/sign-up sit OUTSIDE the auth gate so
// signed-out users can land on them. They still mount inside
// <LocaleProvider> so the brand chrome respects their selection.

import { Routes, Route } from 'react-router-dom';
import { LocaleProvider } from '../../i18n';
import VendorRequireAuth from './VendorRequireAuth';
import VendorSignInPage from './VendorSignInPage';
import VendorSignUpPage from './VendorSignUpPage';
import VendorPortalLayout from './VendorPortalLayout';
import VendorDashboard from './VendorDashboard';
import VendorPOList from './VendorPOList';
import VendorPODetail from './VendorPODetail';
import VendorSampleList from './VendorSampleList';
import VendorAccount from './VendorAccount';

function GatedShell({ children }) {
  return (
    <VendorRequireAuth>
      <VendorPortalLayout>{children}</VendorPortalLayout>
    </VendorRequireAuth>
  );
}

export default function VendorPortalRoutes() {
  return (
    <LocaleProvider>
      <Routes>
        <Route path="sign-in/*" element={<VendorSignInPage />} />
        <Route path="sign-up/*" element={<VendorSignUpPage />} />
        <Route path="" element={<GatedShell><VendorDashboard /></GatedShell>} />
        <Route path="pos" element={<GatedShell><VendorPOList /></GatedShell>} />
        <Route path="pos/:id" element={<GatedShell><VendorPODetail /></GatedShell>} />
        <Route path="samples" element={<GatedShell><VendorSampleList /></GatedShell>} />
        <Route path="account" element={<GatedShell><VendorAccount /></GatedShell>} />
      </Routes>
    </LocaleProvider>
  );
}
