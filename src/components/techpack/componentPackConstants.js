// Constants for the Component Pack system — spec sheets for individual BOM items
// (fabrics, zippers, aglets, trims, labels, etc.) that feed into tech pack BOMs.
// Scoped to the 4-page FR_TechPack_Component_Blank_2.svg template.

import { FR, STATUSES, BOM_COMPONENT_OPTIONS } from './techPackConstants';

export { FR, STATUSES, BOM_COMPONENT_OPTIONS };

export const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
export const DYE_METHODS = ['Stock Color', 'PFD (Prepared for Dye)', 'Dye-to-match (DTM)', 'Reactive Dye', 'Pigment Dye', 'Yarn Dye', 'N/A'];
export const CERTIFICATIONS = ['OEKO-TEX Standard 100', 'GOTS', 'GRS', 'bluesign', 'REACH', 'Prop 65', 'Leather Working Group', 'RWS', 'None'];

// High-level trim classification that mirrors the SVG template dropdown.
export const COMPONENT_TYPES = ['Label', 'Zipper', 'Fabric', 'Hardware', 'Packaging'];

// 4-step wizard. Page 1 is the trim overview; remaining pages are spec/BOM/QC.
export const COMPONENT_STEPS = [
  { id: 'cover',        title: 'Overview',                      icon: '01' },
  { id: 'spec',         title: 'Specification & Artwork',       icon: '02' },
  { id: 'bom',          title: 'BOM & Color',                   icon: '03' },
  { id: 'qc',           title: 'Construction, QC & Approval',   icon: '04' },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

  // Signatures
  designedBy: { name: '', date: '' },
  approvedBy: { name: '', date: '' },

  // Page 2 — Specification & Artwork
  pomMethod: 'As appropriate for component type. Specify instrument and conditions.',
  poms: [{ measurement: '', spec: '', unit: 'mm', tolerance: '', method: '' }],

  // Page 3 — BOM & Color
  materials: [{ component: '', typeDescription: '', composition: '', weightGauge: '', supplier: '', notes: '' }],
  colorwaysList: [{ name: '', frColor: '', pantone: '', hex: '', swatch: '', approvalStatus: 'Pending' }],
  artworkPlacements: [{ placement: '', artworkFile: '', method: '', size: '', position: '', color: '', notes: '' }],

  // Page 4 — Construction, QC & Approval
  processSpec: [{ operation: '', type: '', specification: '', notes: '' }],
  testingStandards: [{ test: '', standardRequirement: '', testMethod: '', passFail: 'Pending' }],
  revisions: [],
  finalApproval: {
    designer:   { name: '', signature: '', date: '' },
    brandOwner: { name: '', signature: '', date: '' },
    factory:    { name: '', signature: '', dateChop: '' },
  },
};

export const POM_UNITS = ['mm', 'cm', 'in', 'other'];
export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Revise'];
export const PASS_FAIL = ['Pass', 'Fail', 'Pending'];
