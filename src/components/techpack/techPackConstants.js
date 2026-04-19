// Constants for the Tech Pack builder. Step + data shape mirrors the
// FR_TechPack_Template_Blank.pdf 14-page A4 landscape template — every
// wizard step corresponds 1:1 to a printed page so the live preview can
// render the same fields in the same place.

export const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A', white: '#FFFFFF',
};

export const FR_COLOR_OPTIONS = [
  { name: 'Slate', hex: '#3A3A3A' }, { name: 'Salt', hex: '#F5F0E8' }, { name: 'Sand', hex: '#EBE5D5' },
  { name: 'Stone', hex: '#716F70' }, { name: 'Soil', hex: '#9A816B' }, { name: 'Sea', hex: '#B5C7D3' },
  { name: 'Sage', hex: '#ADBDA3' }, { name: 'Sienna', hex: '#D4956A' }, { name: 'PFD', hex: '#F0EDE6' },
];

export const BOM_COMPONENT_OPTIONS = [
  'Fabric', 'Lining', 'Rib', 'Interfacing / Fusing',
  'Zipper', 'Button', 'Snap', 'Rivet', 'Aglet',
  'Drawstring / Cord', 'Elastic', 'Thread', 'Tape / Binding',
  'Label (Main)', 'Label (Care)', 'Label (Size)', 'Hang Tag',
  'Patch', 'Embroidery', 'Sticker / Card', 'Packaging',
  'Other',
];

export const DEFAULT_LIBRARY = { bom: [], fabrics: [], trims: [], labels: [], locations: [], shipMethods: [] };

export const STATUSES = ['Design', 'Sampling', 'Testing', 'Pre-Production', 'Production', 'Released'];

// Steps locked until Pre-Production — by index in the new 14-step PDF mapping
// 11 = Labels & Packaging, 12 = Order & Delivery, 13 = Compliance & Quality
export const LOCKED_STEPS = new Set([10, 11, 12]);
export function isStepLocked(stepIndex, status) {
  if (!LOCKED_STEPS.has(stepIndex)) return false;
  const unlockAt = STATUSES.indexOf('Pre-Production');
  const current = STATUSES.indexOf(status);
  return current < unlockAt || current === -1;
}

// 14 steps, each = one PDF page
export const STEPS = [
  { id: 'cover',         title: 'Cover & Identity',              icon: '01' },
  { id: 'design',        title: 'Design Overview',               icon: '02' },
  { id: 'flatlays',      title: 'Technical Flat Lay Diagrams',   icon: '03' },
  { id: 'bom',           title: 'Bill of Materials',             icon: '04' },
  { id: 'color',         title: 'Color & Artwork',               icon: '05' },
  { id: 'construction',  title: 'Construction Details',          icon: '06' },
  { id: 'sketches',      title: 'Construction Detail Sketches',  icon: '07' },
  { id: 'pattern',       title: 'Pattern Pieces & Cutting',      icon: '08' },
  { id: 'pom',           title: 'Points of Measure',             icon: '09' },
  { id: 'treatments',    title: 'Garment Treatments',            icon: '10' },
  { id: 'labels',        title: 'Labels & Packaging',            icon: '11' },
  { id: 'order',         title: 'Order & Delivery',              icon: '12' },
  { id: 'compliance',    title: 'Compliance & Quality',          icon: '13' },
  { id: 'revision',      title: 'Revision History & Approval',   icon: '14' },
];

export const DEFAULT_DATA = {
  // 01 Cover & Identity
  styleName: '',
  styleNumber: '',
  skuPrefix: '',
  productTier: '',           // Tier 1: Staple / Tier 2: Drop ...
  season: '',
  dateCreated: new Date().toISOString().slice(0, 10),
  revision: 'V1.0',
  factory: '',
  colorways: [{ name: '', frColor: 'Slate', pantone: '', hex: '#3A3A3A', fabricSwatch: '', approvalStatus: '' }],
  sizeRange: 'S / M / L / XL',
  targetRetail: '',
  targetFOB: '',
  status: 'Design',
  designedBy:        { name: '', date: '' },
  approvedBy:        { name: '', date: '' },
  factoryConfirmed:  { name: '', date: '' },
  productCategory: '',
  barcodeMethod: 'Shopify Retail Barcode Labels',
  parentStyleId: null,
  parentStyleName: '',

  // 02 Design Overview
  factoryContact: '',
  fabricType: '',
  keyDesignNotes: [{ detail: '', description: '' }],
  fit: '',
  keyFeatures: '',
  designNotes: '',

  // 03 Flat Lay
  flatLayNotes: '',

  // 04 BOM (split into the three tables on the printed page)
  fabrics: [{ component: '', fabricType: '', composition: '', weightGsm: '', colorPantone: '', supplier: '', notes: '' }],
  trimsAccessories: [{ component: '', type: '', material: '', color: '', sizeSpec: '', supplier: '', qtyPerGarment: '' }],
  labelsBranding: [{ labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }],
  // Legacy unified BOM kept for migration / Component-Pack-import flows
  bom: [],

  // 05 Color & Artwork
  logoFront: '',
  logoBack: '',
  logoMethod: '',
  artworkPlacements: [{ placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '' }],

  // 06 Construction Details
  seams: [{ operation: '', seamType: '', stitchType: '', spiSpcm: '', threadColor: '', threadType: '', notes: '' }],
  constructionNotesTable: [{ area: '', description: '', reference: '' }],
  constructionNotes: '',

  // 07 Construction Detail Sketches — image slots only (sketch-1..sketch-6)

  // 08 Pattern Pieces & Cutting
  patternPieces: [{ name: '', qty: '', fabric: '', grain: '', fusing: '', notes: '' }],
  cuttingInstructions: '',
  cuttingNotes: '',

  // 09 Points of Measure
  poms: [
    { name: 'Chest Width (1/2)', tol: '1', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Body Length (HPS)', tol: '1', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Shoulder Width',    tol: '1', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Sleeve Length',     tol: '1', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Sleeve Opening',    tol: '0.5', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Hem Width (1/2)',   tol: '1', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Armhole',           tol: '1', s: '', m: '', l: '', xl: '', method: '' },
    { name: 'Cuff Width',        tol: '0.5', s: '', m: '', l: '', xl: '', method: '' },
  ],
  sizeType: 'apparel',
  measurementMethod: 'Lay garment flat on table. Smooth without stretching. Measure with flexible tape.',

  // 10 Garment Treatments
  treatments: [{ step: '', treatment: '', process: '', temp: '', duration: '', chemicals: '', notes: '' }],
  distressing: [{ area: '', technique: '', intensity: '', notes: '' }],

  // 11 Labels & Packaging
  careInstructions: 'Machine wash cold, inside out\nTumble dry low\nDo not bleach\nIron low if needed\nDo not dry clean',
  packagingItems: [{ component: '', material: '', color: '', size: '', artworkPrint: '', qtyPerOrder: '', notes: '' }],
  packaging: 'Standard FR Packaging',
  packagingNotes: '',

  // 12 Order & Delivery
  quantities: [{ colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }],
  shipTo: '',
  deliveryLocation: '',
  shipMethod: '',
  incoterm: 'FOB',
  targetShipDate: '',
  targetArrivalDate: '',
  freightForwarder: '',
  specialInstructions: '',
  cartons: [{ cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }],

  // 13 Compliance & Quality
  shippingReqs:     [{ requirement: '', specification: '', notes: '' }],
  testingStandards: [{ test: '', standard: '', requirement: '', testMethod: '', passFail: '' }],
  barcodeMatrix:    [{ size: '', sku: '', upc: '', colorCode: '', shopifyVariantId: '' }],

  // 14 Revision History & Approval
  revisions: [],
  finalApproval: {
    designer:   { name: '', signature: '', date: '' },
    brandOwner: { name: '', signature: '', date: '' },
    factory:    { name: '', signature: '', dateChop: '' },
  },

  // PLM features
  samples: [],
};

// Steps that benefit from photo upload (for completion gauge)
export const IMG_STEPS = new Set([0, 1, 2, 4, 5, 6, 7, 8, 9, 10]);

export function resizeImage(file, maxW = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = (maxW / w) * h; w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export const SAMPLE_TYPES = ['Proto', 'Fit', 'SMS (Salesman)', 'PP (Pre-Production)', 'TOP (Top of Production)'];
export const SAMPLE_VERDICTS = ['Pending', 'Approved', 'Rejected', 'Revise'];

export function computeBOMCost(data) {
  // Sum unitCost across order quantities (more reliable than BOM rows once
  // the Order step is filled; falls back to legacy bom if not).
  const qSum = (data.quantities || []).reduce((s, q) => s + (parseFloat(q.unitCost) || 0), 0);
  if (qSum > 0) return qSum;
  const bom = data.bom || data.trims || [];
  return bom.reduce((sum, item) => sum + (parseFloat(item.costPerUnit) || 0), 0);
}

export function computeCompletion(data) {
  const filled = Object.entries(data).filter(([k, v]) => {
    if (Array.isArray(v)) return v.some(r => Object.values(r).some(x => x));
    if (v && typeof v === 'object') return Object.values(v).some(x => x);
    return v && v !== DEFAULT_DATA[k];
  }).length;
  return Math.round((filled / Object.keys(DEFAULT_DATA).length) * 100);
}
