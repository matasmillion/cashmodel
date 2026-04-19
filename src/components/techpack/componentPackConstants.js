// Constants for the Component Pack — 4-page A4 landscape spec sheet that
// mirrors FR_TechPack_Component_Blank_2.svg. Each wizard step corresponds
// 1:1 to a printed page so the live preview can render the same fields in
// the same place.

import { FR, STATUSES } from './techPackConstants';

export { FR, STATUSES };

export const COMPONENT_TYPES = ['Label', 'Zipper', 'Fabric', 'Hardware', 'Packaging', 'Trim', 'Thread', 'Patch', 'Tape', 'Other'];
export const CURRENCIES   = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
export const DYE_METHODS  = ['Stock Color', 'PFD (Prepared for Dye)', 'Dye-to-match (DTM)', 'Reactive Dye', 'Pigment Dye', 'Yarn Dye', 'N/A'];
export const CERTIFICATIONS = ['OEKO-TEX Standard 100', 'GOTS', 'GRS', 'bluesign', 'REACH', 'Prop 65', 'Leather Working Group', 'RWS', 'None'];

// 4-step wizard, mirrors the 4-page Component Spec
export const COMPONENT_STEPS = [
  { id: 'cover',   title: 'Cover & Identity',          icon: '01' },
  { id: 'spec',    title: 'Specification & Artwork',   icon: '02' },
  { id: 'bom',     title: 'BOM & Color',               icon: '03' },
  { id: 'qc',      title: 'Construction, QC & Approval', icon: '04' },
];

// Re-export so existing imports keep working (legacy 8-step name)
export const BOM_COMPONENT_OPTIONS = COMPONENT_TYPES;

export const DEFAULT_COMPONENT_DATA = {
  // 01 Cover & Identity
  componentName: '',
  styleNumber: '',                  // shown on cover and as page-header style #
  componentType: '',                // Label / Zipper / Fabric / Hardware / Packaging
  componentCategory: '',            // legacy alias for componentType (kept for old data)
  supplier: '',
  season: '',
  dateCreated: new Date().toISOString().slice(0, 10),
  revision: 'V1.0',
  parentStyles: '',                 // free text, comma-separated style numbers
  colorways: '',                    // free text colorway summary on cover
  dimensions: '',                   // top-line size on cover
  targetUnitCost: '',
  costPerUnit: '',                  // legacy alias
  currency: 'USD',
  moq: '',
  status: 'Design',
  designedBy:        { name: '', date: '' },
  approvedBy:        { name: '', date: '' },
  supplierConfirmed: { name: '', date: '' },

  // 02 Specification & Artwork
  // Photo slots: component-front, component-back, component-side
  pomMethod: 'As appropriate for component type. Specify instrument and conditions.',
  poms: [{ measurement: '', spec: '', unit: 'mm', tolerance: '', method: '' }],

  // 03 BOM & Color
  materials: [{ component: '', typeDescription: '', composition: '', weightGauge: '', supplier: '', notes: '' }],
  colorwaysList: [{ name: '', frColor: '', pantone: '', hex: '', swatch: '', approvalStatus: '' }],
  // Photo slots: component-artwork-face, component-artwork-back
  artworkPlacements: [{ placement: '', artworkFile: '', method: '', size: '', position: '', color: '', notes: '' }],

  // 04 Construction, QC & Approval
  processSpec:      [{ operation: '', type: '', specification: '', notes: '' }],
  testingStandards: [{ test: '', standardRequirement: '', testMethod: '', passFail: '' }],
  revisions: [],
  finalApproval: {
    designer:   { name: '', signature: '', date: '' },
    brandOwner: { name: '', signature: '', date: '' },
    factory:    { name: '', signature: '', dateChop: '' }, // factory / supplier card
  },

  // Legacy fields kept so existing component packs keep working
  componentNumber: '',
  supplierContact: '',
  supplierEmail: '',
  supplierPhone: '',
  supplierWebsite: '',
  leadTime: '',
  moqUnit: 'units',
  material: '',
  composition: '',
  weight: '',
  width: '',
  finish: '',
  specNotes: '',
  frColor: '',
  customColorName: '',
  pantone: '',
  hex: '',
  dyeMethod: 'Stock Color',
  priceBreaks: [{ qty: '', price: '' }],
  certifications: [],
  countryOfOrigin: '',
  hsCode: '',
  notes: '',
};
