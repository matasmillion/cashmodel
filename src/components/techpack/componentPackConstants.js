// Constants for the Component Pack system — spec sheets for individual BOM items
// (fabrics, zippers, aglets, trims, labels, etc.) that feed into tech pack BOMs

import { FR, STATUSES, BOM_COMPONENT_OPTIONS } from './techPackConstants';

export { FR, STATUSES, BOM_COMPONENT_OPTIONS };

export const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];
export const DYE_METHODS = ['Stock Color', 'PFD (Prepared for Dye)', 'Dye-to-match (DTM)', 'Reactive Dye', 'Pigment Dye', 'Yarn Dye', 'N/A'];
export const CERTIFICATIONS = ['OEKO-TEX Standard 100', 'GOTS', 'GRS', 'bluesign', 'REACH', 'Prop 65', 'Leather Working Group', 'RWS', 'None'];

// 8-step wizard, mirrors the Tech Pack section/page architecture
export const COMPONENT_STEPS = [
  { id: 'identity',   title: 'Identity & Classification', icon: '01' },
  { id: 'supplier',   title: 'Supplier',                  icon: '02' },
  { id: 'specs',      title: 'Specifications',            icon: '03' },
  { id: 'color',      title: 'Color',                     icon: '04' },
  { id: 'cost',       title: 'Cost & Pricing',            icon: '05' },
  { id: 'compliance', title: 'Compliance',                icon: '06' },
  { id: 'images',     title: 'Reference Images',          icon: '07' },
  { id: 'notes',      title: 'Notes',                     icon: '08' },
];

export const DEFAULT_COMPONENT_DATA = {
  // Identity
  componentName: '',
  componentCategory: '',
  componentNumber: '',
  status: 'Design',
  season: '',

  // Supplier
  supplier: '',
  supplierContact: '',
  supplierEmail: '',
  supplierPhone: '',
  supplierWebsite: '',
  leadTime: '',
  moq: '',
  moqUnit: 'units',

  // Specification (varies by category — all captured as flexible fields)
  material: '',
  composition: '',
  weight: '',
  width: '',
  dimensions: '',
  finish: '',
  specNotes: '',

  // Color
  frColor: '',
  customColorName: '',
  pantone: '',
  hex: '',
  dyeMethod: 'Stock Color',

  // Cost
  costPerUnit: '',
  currency: 'USD',
  priceBreaks: [{ qty: '', price: '' }],

  // Compliance
  certifications: [],
  countryOfOrigin: '',
  hsCode: '',

  // Notes
  notes: '',
};
