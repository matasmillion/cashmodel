// Constants for the Component Pack system — spec sheets for individual BOM items
// (fabrics, zippers, aglets, trims, labels, etc.) that feed into tech pack BOMs.
// Scoped to the 4-page FR_TechPack_Component_Blank_2.svg template.

import { FR, BOM_COMPONENT_OPTIONS, SAMPLE_VERDICTS } from './techPackConstants';

export { FR, BOM_COMPONENT_OPTIONS, SAMPLE_VERDICTS };

// Trim packs have a simpler 3-stage lifecycle than tech packs. This replaces
// the tech pack's 6-stage STATUSES (Design/Sampling/Testing/Pre-Production/
// Production/Released) with the three stages the brand actually tracks.
export const STATUSES = ['Design', 'Sample', 'Production-Ready'];

// Same three stages are used as the "type" for each sample log entry — a
// sample delivered during the Sample stage, a final bulk-approved sample in
// Production-Ready, etc. Replaces the tech pack's Proto/Fit/SMS/PP/TOP set.
export const SAMPLE_TYPES = ['Design', 'Sample', 'Production-Ready'];

// Legacy → new maps for one-time migration of existing trim pack data.
export const LEGACY_STATUS_MIGRATION = {
  'Sampling': 'Sample',
  'Testing': 'Sample',
  'Pre-Production': 'Production-Ready',
  'Production': 'Production-Ready',
  'Released': 'Production-Ready',
};
export const LEGACY_SAMPLE_TYPE_MIGRATION = {
  'Proto': 'Sample',
  'Fit': 'Sample',
  'SMS (Salesman)': 'Sample',
  'PP (Pre-Production)': 'Production-Ready',
  'TOP (Top of Production)': 'Production-Ready',
};

export const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
export const DYE_METHODS = ['Stock Color', 'PFD (Prepared for Dye)', 'Dye-to-match (DTM)', 'Reactive Dye', 'Pigment Dye', 'Yarn Dye', 'N/A'];
export const CERTIFICATIONS = ['OEKO-TEX Standard 100', 'GOTS', 'GRS', 'bluesign', 'REACH', 'Prop 65', 'Leather Working Group', 'RWS', 'None'];

// High-level trim classification that mirrors the SVG template dropdown.
export const COMPONENT_TYPES = ['Label', 'Zipper', 'Fabric', 'Hardware', 'Packaging'];

// 7-step wizard: Overview + Design + 5 content pages. Design sits between
// Overview and Materials so the factory sees the visual intent before the
// spec data. Everything after Overview follows a rule-of-three layout.
export const COMPONENT_STEPS = [
  { id: 'cover',          title: 'Overview',          icon: '01' },
  { id: 'design',         title: 'Design',            icon: '02' },
  { id: 'materials',      title: 'Materials',         icon: '03' },
  { id: 'construction',   title: 'Construction',      icon: '04' },
  { id: 'embellishments', title: 'Embellishments',    icon: '05' },
  { id: 'treatment',      title: 'Treatment',         icon: '06' },
  { id: 'qc',             title: 'Quality Control',   icon: '07' },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyMaterial  = () => ({ name: '', composition: '', weightGauge: '', factory: '', color: '', finish: '' });

// Material color options now come from the shared FR brand palette
// (FR_COLOR_OPTIONS in techPackConstants.js). The old MATERIAL_COLORS list
// (Natural / White / Navy / ...) was removed as part of the color-system
// unification — every color surface in the PLM pulls from the same palette.

export const MATERIAL_FINISHES = [
  'N/A', 'Matte', 'Glossy', 'Satin', 'Brushed', 'Washed',
  'Stone Wash', 'Enzyme Wash', 'Pigment Dyed', 'Coated', 'Suede', 'Unfinished',
];
const emptyCallout   = () => ({ label: '', specification: '' });
const emptyTreatment = () => ({ name: '', description: '' });
const emptyQCPoint   = () => ({ focus: '', method: '', pass: '' });

export const DEFAULT_COMPONENT_DATA = {
  // Page 1 — Overview
  componentName: '',
  componentType: 'Label',
  supplier: '',
  season: '',
  dateCreated: todayISO(),
  revision: 'V1.0',
  colorways: '',
  targetUnitCost: '',
  moq: '',
  status: 'Design',

  // Lifecycle log surfaced on the Overview page.
  samples: [],

  // Page 2 — Materials: 3 material cards by default (rule of three).
  materials: [emptyMaterial(), emptyMaterial(), emptyMaterial()],

  // Page 3 — Construction: single 16:9 measurement diagram (image slot
  // `construction-diagram`) + exactly 3 callouts.
  constructionCallouts: [emptyCallout(), emptyCallout(), emptyCallout()],

  // Page 4 — Embellishments: up to 4 colorways + 3 artwork slots
  // + file attachments. Each colorway card captures where it's used
  // (Logo / Base fabric / Thread / etc.), the FR color anchor, and the
  // Pantone TCX/TPG/C codes + hex + RGB. Pantone TCX card photos and
  // shared codes are synced through the colorLibrary util so edits made
  // here propagate to every pack referencing the same FR color.
  colorwaysList: [
    { name: '', usage: '', frColor: '', pantoneTCX: '', pantoneTPG: '', pantoneC: '', hex: '', rgb: '' },
  ],
  attachments: [], // { id, name, size, type, dataUri }

  // Page 5 — Treatment: 3 finish cards (image slot `treatment-N`).
  treatments: [emptyTreatment(), emptyTreatment(), emptyTreatment()],

  // Page 6 — Quality Control: 3 QC focus cards (image slot `qc-N`).
  qcPoints: [emptyQCPoint(), emptyQCPoint(), emptyQCPoint()],

  // Lifecycle — edited from Overview, persisted on the pack.
  skippedSteps: [],
  revisions: [],
  finalApproval: {
    designer: { name: '', signature: '', date: '' },
    manager:  { name: '', signature: '', date: '' },
    factory:  { name: '', signature: '', dateChop: '' },
  },
};

export const POM_UNITS = ['mm', 'cm', 'in', 'other'];
export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Revise'];
export const PASS_FAIL = ['Pass', 'Fail', 'Pending'];
