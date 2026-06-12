// Constants shared by the Tech Pack builder — extracted from the original artifact

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

export const STATUSES = ['Merchandising', 'Design', 'Sampling', 'Testing', 'Pre-Production', 'Production', 'Released'];

// Steps locked until Pre-Production: Compliance, Quality, Labels, Order.
// After inserting 3 embellishments pages + 1 treatments call-outs page these
// shifted {17,18,19,20} → {21,22,23,24}; adding the second Stitching page
// (construction-2) shifts them once more → {22,23,24,25}.
export const LOCKED_STEPS = new Set([22, 23, 24, 25]);
export function isStepLocked(stepIndex, status) {
  if (!LOCKED_STEPS.has(stepIndex)) return false;
  const unlockAt = STATUSES.indexOf('Pre-Production');
  const current = STATUSES.indexOf(status);
  return current < unlockAt || current === -1;
}

// Merchandising steps lock the moment the pack moves past the
// Merchandising phase — competitor and storefront prep is "decided" by
// then. Empty / undefined status counts as Merchandising (new pack).
export const MERCH_STEPS = new Set([0, 1]);
export function isMerchLocked(stepIndex, status) {
  if (!MERCH_STEPS.has(stepIndex)) return false;
  const current = STATUSES.indexOf(status);
  // No status set yet (new pack) → treat as Merchandising → unlocked
  if (!status || current === -1) return false;
  return current > STATUSES.indexOf('Merchandising');
}

// 21-step wizard, ordered by manufacturing stage. Two pre-tech-pack pages
// kick off the flow:
//   Merchandising (000, 00) → Design → Materials → Cut & Sew →
//   Embellishments → Treatments → QC → Packaging → Logistics → Sign-off
// `phase` drives the section dividers in the sidebar and the live preview.
// `skippable` steps show "PAGE NOT USED" overlay when added to skippedSteps[].
// `icon` is the page-number label shown in the live preview header (string,
// not always numeric — merchandising pages use 000 and 00).
export const STEPS = [
  { id: 'competitors',   title: 'Competitor Landscape',             icon: '000', phase: 'Merchandising', skippable: true },
  { id: 'merch-preview', title: 'Merchandising Preview',            icon: '00',  phase: 'Merchandising', skippable: true },
  { id: 'cover',         title: 'Style Overview',                   icon: '01', phase: 'Design' },
  { id: 'design',        title: 'Design Overview',                  icon: '02', phase: 'Design' },
  { id: 'fabrics',       title: 'Fabrics',                          icon: '03', phase: 'Bill of Materials' },
  { id: 'trims',         title: 'Trims',                            icon: '04', phase: 'Bill of Materials' },
  { id: 'packaging',     title: 'Packaging',                        icon: '05', phase: 'Bill of Materials', skippable: true },
  { id: 'flatlays',      title: 'Pattern',                          icon: '06', phase: 'Cut & Sew' },
  { id: 'sketches',      title: 'Construction (1)',                 icon: '07', phase: 'Cut & Sew' },
  { id: 'sketches-2',    title: 'Construction (2)',                 icon: '08', phase: 'Cut & Sew' },
  { id: 'construction',  title: 'Sewing (1)',                       icon: '09', phase: 'Cut & Sew' },
  { id: 'construction-2',title: 'Sewing (2)',                       icon: '10', phase: 'Cut & Sew' },
  { id: 'cutsew-cost',   title: 'Cut & Sew Cost',                   icon: '$',  phase: 'Cut & Sew', internal: true },
  { id: 'pattern',       title: 'Cutting',                          icon: '11', phase: 'Cut & Sew' },
  { id: 'pom',           title: 'Points of Measure',                icon: '12', phase: 'Cut & Sew' },
  { id: 'size-matrix',   title: 'Size Grading',                     icon: '13', phase: 'Cut & Sew', skippable: true },
  { id: 'color',         title: 'Colorways',                        icon: '14', phase: 'Embellishments' },
  { id: 'artwork',       title: 'Artwork & Placement',              icon: '15', phase: 'Embellishments' },
  { id: 'emb-flatlay',   title: 'Flat Lay',                         icon: '16', phase: 'Embellishments' },
  { id: 'emb-callouts',  title: 'Call Outs',                        icon: '17', phase: 'Embellishments' },
  { id: 'emb-sizing',    title: 'Sizing & Colors',                  icon: '18', phase: 'Embellishments' },
  { id: 'treatments',    title: 'Render',                           icon: '19', phase: 'Treatments' },
  { id: 'treat-callouts',title: 'Call Outs',                        icon: '20', phase: 'Treatments' },
  { id: 'compliance',    title: 'Compliance & Testing',             icon: '21', phase: 'QC' },
  { id: 'quality',       title: 'Quality Inspection (AQL)',         icon: '22', phase: 'QC' },
  { id: 'labels',        title: 'Labels & Packaging',               icon: '23', phase: 'Packaging' },
  { id: 'order',         title: 'Order & Delivery',                 icon: '24', phase: 'Logistics' },
  { id: 'revision',      title: 'Revision History & Approval',      icon: '25', phase: 'Sign-off' },
];

// Width-to-height ratio of the Cut & Sew call-out garment reference (a narrow
// portrait, narrower than 2:3, so the four call-out cards get more width for
// their images). Shared by the editor dot-placement box, the live preview, and
// the PDF so a dot placed in the editor lands in the same spot everywhere.
export const CALLOUT_REF_RATIO = 0.44;

// Cut & Sew call-out card image slots (width / height). The main close-up is a
// 3:2 landscape; the supporting image is a smaller 1:1 square. These shapes are
// the single source of truth: the editor crops uploads to exactly these shapes
// and the live preview + PDF draw the slots at the same shapes, so each image
// fills its slot in the printed card with no letterboxing or wasted space.
export const CALLOUT_MAIN_RATIO = 1.5;     // 3 : 2 landscape
export const CALLOUT_SUPPORT_RATIO = 1.0;  // 1 : 1 square

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const DEFAULT_DATA = {
  // Page 1 — Style Overview
  styleName: '', productCategory: '', productTier: '',
  collection: '', productType: '', productNumber: '',
  season: '', targetRetail: '', targetFOB: '', status: 'Design',
  costTiers: [{ quantity: '', unitCost: '' }],
  leadTimeDays: '', sampleLeadTimeDays: '', sampleCost: '', quoteProviderLink: '',
  weightKg: '',
  assumptions: { productPercent: 0.27, seaFreightSpot: 4 },
  styleNumber: '', skuPrefix: '', barcodeMethod: 'Shopify Retail Barcode Labels',
  dateCreated: todayISO(),
  revision: 'V1.0',
  sizeRange: 'S / M / L / XL',
  designedBy: { name: '', date: '' },
  approvedBy: { name: '', date: '' },
  vendorConfirmed: { name: '', date: '' },

  // Page 2+
  vendor: '', vendorContact: '', fabricType: '',
  // Merchandising — pre-tech-pack strategy pages
  competitors: [
    { brand: '', product: '', url: '', price: '', currency: 'USD', features: '', notes: '' },
  ],
  competitivePositioning: '',
  designContextPrompt: '',
  designStyle: 'ghost-mannequin',  // 'ghost-mannequin' | 'flat-lay'
  designBgColor: 'salt',           // FR color name (lowercased)
  designNotes: '', fit: '', keyFeatures: '', flatLayNotes: '',
  keyDesignNotes: [{ detail: '', description: '', reference: '' }],
  fabrics: [{ component: '', fabricType: '', composition: '', weightGsm: '', colorPantone: '', supplier: '', notes: '' }],
  trimsAccessories: [{ component: '', type: '', material: '', color: '', sizeSpec: '', supplier: '', qtyPerGarment: '' }],
  // Library-picked references — fabrics, trims, packaging are now selected
  // from the global PLM library rather than entered free-text. Each entry
  // is a thin reference; the actual specs live in the library row.
  pickedFabrics:   [], // [{ fabricId, role, notes }]   max 3
  pickedTrims:     [], // [{ componentId, role, notes }]  up to 6+
  pickedPackaging: [], // [{ componentId, role, notes }]
  labelsBranding: [{ labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }],
  bom: [{ component: '', type: '', material: '', color: '', weight: '', supplier: '', supplierContact: '', costPerUnit: '', notes: '' }],
  attachments: [],
  gradedSizeMatrix: { baseSize: 'M', sizes: ['S', 'M', 'L', 'XL'], grading: [] },
  colorways: [{ name: '', frColor: '', pantone: '', hex: '', fabricSwatch: '', approvalStatus: 'Pending' }],
  artworkPlacements: [{ placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '' }],
  logoFront: '', logoBack: '', logoMethod: '',
  seams: [{ operation: '', seamType: '', stitchType: '', machine: '', spiSpcm: '', threadColor: '', threadType: '', notes: '' }],
  // Eight stitch callout cards across two Stitching pages (page 09 = 1–4,
  // page 10 = 5–8), mirroring the Call Outs pages. Each card carries a
  // freeform name label (e.g. "4-Thread Overlock"), a main image
  // (slot `seam-stitch-{num}`), an optional supporting reference image
  // (slot `seam-stitch-{num}-support`), and a placed callout `dot` (normalized
  // { x, y } over the page's garment reference, or null). Each card pairs
  // positionally with row `num` of the seams[] spec table below.
  seamStitchBlocks: [
    { num: 1, label: '', dot: null },
    { num: 2, label: '', dot: null },
    { num: 3, label: '', dot: null },
    { num: 4, label: '', dot: null },
    { num: 5, label: '', dot: null },
    { num: 6, label: '', dot: null },
    { num: 7, label: '', dot: null },
    { num: 8, label: '', dot: null },
  ],
  // AI-generated labor cost metadata. The cutSewLaborCost field above is
  // the value that flows into the cost roll-up; this captures the model's
  // reasoning, vendor context, and the moment of generation so the user
  // can see why the estimate is what it is.
  cutSewLaborCostMeta: null, // { value, low, high, reasoning, vendor, generatedAt }
  constructionNotes: '',
  constructionNotesTable: [{ detail: '', area: '', description: '', reference: '' }],
  // Labor / cut-and-sew cost per garment, in the same currency as the rest
  // of the cost roll-up. Designers fill this in on the Seam & Stitch step.
  cutSewLaborCost: '',
  // Construction Details — two pages, four entries each. Each entry maps to a
  // red-numbered detail callout on the page's reference image. Title and
  // Reference-column layout per base slot. Truthy = split into two stacked 2:3
  // reference images (slots `${base}` + `${base}-b`); falsy/absent = one narrow
  // image. Used on the Construction + Sewing pages.
  referenceLayout: {},
  // description are dedicated fields so they can be translated independently
  // per factory. `dot` is the in-app placed marker (normalized { x, y } in
  // 0..1 over the garment reference image, or null when not yet placed).
  constructionDetailsPage1: [
    { num: 1, title: '', description: '', dot: null },
    { num: 2, title: '', description: '', dot: null },
    { num: 3, title: '', description: '', dot: null },
    { num: 4, title: '', description: '', dot: null },
  ],
  constructionDetailsPage2: [
    { num: 5, title: '', description: '', dot: null },
    { num: 6, title: '', description: '', dot: null },
    { num: 7, title: '', description: '', dot: null },
    { num: 8, title: '', description: '', dot: null },
  ],
  // Embellishments — Flat Lay (two sketches with print type + process details)
  embFlatLayNotes: '',
  embPrintType: '',
  embProcessDetails: '',
  // Embellishments — Call Outs (four numbered details, mirrors Cut & Sew page 07)
  embCalloutDetails: [
    { num: 1, title: '', description: '' },
    { num: 2, title: '', description: '' },
    { num: 3, title: '', description: '' },
    { num: 4, title: '', description: '' },
  ],
  // Embellishments — Sizing & Colors (source files + notes)
  embSizingNotes: '',
  // Treatments — wash type list (e.g. Stone Wash, Garment Dye, Enzyme Wash)
  treatmentWashTypes: [{ name: '', notes: '' }],
  // Treatments — Call Outs (four numbered details)
  treatCalloutDetails: [
    { num: 1, title: '', description: '' },
    { num: 2, title: '', description: '' },
    { num: 3, title: '', description: '' },
    { num: 4, title: '', description: '' },
  ],
  patternPieces: [{ pieceNum: '', pieceName: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }],
  cuttingNotes: '',
  cuttingInstructions: '',
  // Cutting step (Variant B) — dedicated cutting-plan PDFs (kept separate from
  // the generic `attachments` so the cutting page lists only the cut plan),
  // measured garment-dye residual shrinkage, and a nap/grain note.
  cuttingPlanFiles: [],
  dyeResidualActualPct: '',
  napGrain: '',
  measurementMethod: 'Lay garment flat on table. Smooth without stretching. Measure with flexible tape.',
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
  treatments: [{ step: '', treatment: '', process: '', temperature: '', duration: '', chemicals: '', notes: '' }],
  distressing: [{ area: '', technique: '', intensity: '', referenceImage: '', notes: '' }],
  careInstructions: 'Machine wash cold, inside out\nTumble dry low\nDo not bleach\nIron low if needed\nDo not dry clean',
  packagingItems: [{ component: '', material: '', color: '', size: '', artworkPrint: '', qtyPerOrder: '', notes: '' }],
  packaging: 'Standard FR Packaging', packagingNotes: '',
  quantities: [{ colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }],
  shipTo: '', deliveryLocation: '', shipMethod: '', incoterm: 'FOB', targetShipDate: '', targetArrivalDate: '', freightForwarder: '', specialInstructions: '',
  cartons: [{ cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }],
  shippingReqs: [{ requirement: '', specification: '', notes: '' }],
  testingStandards: [{ test: '', standard: '', requirement: '', testMethod: '', passFail: 'Pending' }],
  qualityInspection: {
    aqlMajor: '2.5',
    aqlMinor: '4.0',
    inspectionStage: 'During Production',
    checklist: [],
    photoRequirements: '',
  },
  barcodeMatrix: [],
  // PLM features
  parentStyleId: null,
  parentStyleName: '',
  skippedSteps: [],
  revisions: [],
  samples: [],
  finalApproval: {
    designer:   { name: '', signature: '', date: '' },
    brandOwner: { name: '', signature: '', date: '' },
    vendor:     { name: '', signature: '', dateChop: '' },
  },
};

// Image-heavy step indices. Adding the second Stitching page (construction-2)
// at index 11 shifts every later image step +1 and registers the new page:
// old {3,4,5,6,7,8,9,10,12,13,14,15,16,18,19} → add 11, then 12→13 … 19→20.
export const IMG_STEPS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 19, 20]);

// Initial-load compression. Loads a File at high quality + caps to a
// generous max dimension (2400px) so the crop modal has detail to work
// with and the final compressForUpload pass produces a high-fidelity
// WebP. Quality 0.95 retains practically all detail at this stage —
// real compression happens once at the upload layer.
export function resizeImage(file, maxW = 1600) {
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
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Style number system ─────────────────────────────────────────────────────

export const COLLECTIONS = [
  { label: 'Borderless Basics',    code: 'BB' },
  { label: 'Snowflake Staples',    code: 'SK' },
  { label: 'Nomadic Necessities',  code: 'NN' },
  { label: 'Technical Travel',     code: 'TT' },
  { label: 'Destination Designer', code: 'DD' },
];

export const PRODUCT_TYPES = [
  { label: 'Zip-up Hoodie',  code: 'ZH' },
  { label: 'Hoodie',         code: 'HO' },
  { label: 'Sweatpants',     code: 'SP' },
  { label: 'T-Shirt',        code: 'TS' },
  { label: 'Shorts',         code: 'SH' },
  { label: 'Denim Pants',    code: 'DP' },
  { label: 'Denim Jacket',   code: 'DJ' },
  { label: 'Sling Bag',      code: 'SB' },
  { label: 'Mules',          code: 'ML' },
];

const SEASON_CODES = {
  'Core (Evergreen)': 'CORE',
  'SS26': 'SS26',
  'FW26': 'FW26',
  'SS27': 'SS27',
  'FW27': 'FW27',
};

export function deriveStyleNumber({ season, collection, productType, productNumber }) {
  const sc = SEASON_CODES[season] || '';
  const cc = (COLLECTIONS.find(c => c.label === collection) || {}).code || '';
  const pc = (PRODUCT_TYPES.find(t => t.label === productType) || {}).code || '';
  const pn = productNumber || '';
  if (!sc || !cc || !pc || !pn) return '';
  return `${sc}-${cc}-${pc}-${pn}`;
}

export const SAMPLE_TYPES = ['Proto', 'Fit', 'SMS (Salesman)', 'PP (Pre-Production)', 'TOP (Top of Production)'];

// Industry-standard fabric yield by garment type (meters of fabric per finished unit).
// Values are midpoints of typical marker utilisation ranges. Designers can override
// with CLO3D actuals in the Pattern Pieces & Cutting step.
export const GARMENT_YIELDS = [
  { label: 'T-Shirt / Tee',           metersPerUnit: 1.3 },
  { label: 'Tank Top',                metersPerUnit: 0.8 },
  { label: 'Polo Shirt',              metersPerUnit: 1.4 },
  { label: 'Hoodie (pullover)',        metersPerUnit: 1.9 },
  { label: 'Zip-up Hoodie',           metersPerUnit: 2.0 },
  { label: 'Crew Neck Sweatshirt',    metersPerUnit: 1.8 },
  { label: 'Sweatpants / Joggers',    metersPerUnit: 1.6 },
  { label: 'Shorts',                  metersPerUnit: 0.9 },
  { label: 'Cargo Pants',             metersPerUnit: 2.0 },
  { label: 'Denim Pants / Trousers',  metersPerUnit: 1.8 },
  { label: 'Chinos / Dress Pants',    metersPerUnit: 1.9 },
  { label: 'Skirt (mini)',            metersPerUnit: 1.0 },
  { label: 'Skirt (midi)',            metersPerUnit: 1.5 },
  { label: 'Dress (mini)',            metersPerUnit: 1.6 },
  { label: 'Dress (midi)',            metersPerUnit: 2.2 },
  { label: 'Dress (maxi)',            metersPerUnit: 2.8 },
  { label: 'Track Jacket',            metersPerUnit: 1.6 },
  { label: 'Bomber Jacket',           metersPerUnit: 2.0 },
  { label: 'Denim Jacket',            metersPerUnit: 2.2 },
  { label: 'Blazer / Suit Jacket',    metersPerUnit: 2.4 },
  { label: 'Coat (hip-length)',       metersPerUnit: 3.0 },
  { label: 'Trench Coat',             metersPerUnit: 3.5 },
  { label: 'Sling Bag',               metersPerUnit: 0.5 },
];
// Look up the standard fabric yield (m/unit) for a given PRODUCT_TYPES label.
// Tries exact match first, then startsWith to handle "Hoodie" → "Hoodie (pullover)".
export function yieldForProductType(productType) {
  if (!productType) return null;
  const lc = productType.toLowerCase();
  const hit = GARMENT_YIELDS.find(g => g.label.toLowerCase() === lc) ||
    GARMENT_YIELDS.find(g => g.label.toLowerCase().startsWith(lc));
  return hit?.metersPerUnit ?? null;
}

export const SAMPLE_VERDICTS = ['Pending', 'Approved', 'Rejected', 'Revise'];
export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Revise'];
export const PASS_FAIL = ['Pass', 'Fail', 'Pending'];

export function computeBOMCost(data) {
  const bom = data.bom || data.trims || [];
  return bom.reduce((sum, item) => sum + (parseFloat(item.costPerUnit) || 0), 0);
}

// Sum of every library-sourced color cost across this pack's colorways.
// Duplicates are counted once — if two colorways both reference "Slate",
// that wash cost still only hits the garment once (same dye lot).
export function computeColorwayCost(data, getColorCostFn) {
  if (!getColorCostFn) return 0;
  const seen = new Set();
  (data.colorways || []).forEach(cw => { if (cw?.frColor) seen.add(cw.frColor); });
  let total = 0;
  seen.forEach(name => { total += getColorCostFn(name) || 0; });
  return total;
}

// Full unit-cost roll-up.
// TechPackBuilder computes the accurate total (fabrics + trims +
// treatments + embellishments + cut & sew + vendor markup) and mirrors
// it to data.totalUnitCost via useEffect — same pattern as maxFOB.
// When that field is present (i.e. the pack has been opened at least
// once since the field was introduced), return it directly. Otherwise
// fall back to the legacy free-text BOM + colorway sum so old packs
// still show something rather than $0.
export function computeTotalUnitCost(data, { getColorCost } = {}) {
  const cached = parseFloat(data?.totalUnitCost);
  if (Number.isFinite(cached) && cached > 0) return cached;
  return computeBOMCost(data) + computeColorwayCost(data, getColorCost);
}

export function computeCompletion(data) {
  const filled = Object.entries(data).filter(([k, v]) => {
    if (Array.isArray(v)) return v.some(r => Object.values(r).some(x => x));
    return v && v !== DEFAULT_DATA[k];
  }).length;
  return Math.round((filled / Object.keys(DEFAULT_DATA).length) * 100);
}
