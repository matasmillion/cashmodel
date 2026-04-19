// Constants for the Component Pack system — spec sheets for individual BOM items
// (fabrics, zippers, aglets, trims, labels, etc.) that feed into tech pack BOMs.
// Scoped to the 4-page FR_TechPack_Component_Blank_2.svg template.

import { FR, STATUSES, BOM_COMPONENT_OPTIONS } from './techPackConstants';

export { FR, STATUSES, BOM_COMPONENT_OPTIONS };

export const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
export const DYE_METHODS = ['Stock Color', 'PFD (Prepared for Dye)', 'Dye-to-match (DTM)', 'Reactive Dye', 'Pigment Dye', 'Yarn Dye', 'N/A'];
export const CERTIFICATIONS = ['OEKO-TEX Standard 100', 'GOTS', 'GRS', 'bluesign', 'REACH', 'Prop 65', 'Leather Working Group', 'RWS', 'None'];

// High-level component classification that mirrors the SVG template dropdown.
export const COMPONENT_TYPES = ['Label', 'Zipper', 'Fabric', 'Hardware', 'Packaging'];

// 4-step wizard mapping directly to the 4 pages of the Component Pack template.
export const COMPONENT_STEPS = [
  { id: 'cover',        title: 'Cover & Identity',              icon: '01' },
  { id: 'spec',         title: 'Specification & Artwork',       icon: '02' },
  { id: 'bom',          title: 'BOM & Color',                   icon: '03' },
  { id: 'qc',           title: 'Construction, QC & Approval',   icon: '04' },
];

export const DEFAULT_COMPONENT_DATA = {
  // Page 1 — Cover & Identity
  componentName: '',
  styleNumber: '',
  componentType: 'Label',
  supplier: '',
  season: '',
  dateCreated: '',
  revision: 'V1.0',
  parentStyles: '',
  colorways: '',
  dimensions: '',
  targetUnitCost: '',
  moq: '',
  status: 'Design',

  // Signatures
  designedBy: { name: '', date: '' },
  approvedBy: { name: '', date: '' },
  supplierConfirmed: { name: '', date: '' },
};
