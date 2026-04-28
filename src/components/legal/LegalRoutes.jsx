// @ts-check
// LegalRoutes — mounts the /legal/* tree under <LegalLayout>. The
// nested <Routes> renders the index page; per-policy detail pages get
// added in subsequent prompts (Compartment 3 of Prompt 1 lands the
// Information Security Policy, then Prompts 2 & 3 add the others).

import { Routes, Route } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import LegalIndexPage from './LegalIndexPage';
import InformationSecurityPolicyPage from './pages/InformationSecurityPolicyPage';
import VersionHistoryPage from './pages/VersionHistoryPage';

export default function LegalRoutes() {
  return (
    <LegalLayout>
      <Routes>
        <Route index element={<LegalIndexPage />} />
        <Route path="information-security-policy" element={<InformationSecurityPolicyPage />} />
        <Route path="version-history" element={<VersionHistoryPage />} />
        {/* Per-policy routes mount here as each prompt lands. */}
      </Routes>
    </LegalLayout>
  );
}
