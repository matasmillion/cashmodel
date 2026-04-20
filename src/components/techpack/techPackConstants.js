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

export const STATUSES = ['Design', 'Sampling', 'Testing', 'Pre-Production', 'Production', 'Released'];

// Steps locked until Pre-Production: Labels (10), Order (11), Compliance (12)
export const LOCKED_STEPS = new Set([10, 11, 12]);
export function isStepLocked(stepIndex, status) {
  if (!LOCKED_STEPS.has(stepIndex)) return false;
  const unlockAt = STATUSES.indexOf('Pre-Production');
  const current = STATUSES.indexOf(status);
  return current < unlockAt || current === -1;
}

// 14-step wizard mapping 1:1 to the FR_TechPack_Template_Blank.pdf pages.
export const STEPS = [
  { id: 'cover',         title: 'Cover & Identity',                 icon: '01' },
  { id: 'design',        title: 'Design Overview',                  icon: '02' },
  { id: 'flatlays',      title: 'Technical Flat Lay Diagrams',      icon: '03' },
  { id: 'bom',           title: 'Bill of Materials',                icon: '04' },
  { id: 'color',         title: 'Color & Artwork',                  icon: '05' },
  { id: 'construction',  title: 'Construction Details',             icon: '06' },
  { id: 'sketches',      title: 'Construction Detail Sketches',     icon: '07' },
  { id: 'pattern',       title: 'Pattern Pieces & Cutting',         icon: '08' },
  { id: 'pom',           title: 'Points of Measure',                icon: '09' },
  { id: 'treatments',    title: 'Garment Treatments',               icon: '10' },
  { id: 'labels',        title: 'Labels & Packaging',               icon: '11' },
  { id: 'order',         title: 'Order & Delivery',                 icon: '12' },
  { id: 'compliance',    title: 'Compliance & Quality',             icon: '13' },
  { id: 'revision',      title: 'Revision History & Approval',      icon: '14' },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const DEFAULT_DATA = {
  // Page 1 — Cover & Identity
  styleName: '', productCategory: '', productTier: '', season: '', targetRetail: '', targetFOB: '', status: 'Design',
  styleNumber: '', skuPrefix: '', barcodeMethod: 'Shopify Retail Barcode Labels',
  dateCreated: todayISO(),
  revision: 'V1.0',
  sizeRange: 'S / M / L / XL',
  designedBy: { name: '', date: '' },
  approvedBy: { name: '', date: '' },
  factoryConfirmed: { name: '', date: '' },

  // Page 2+
  factory: '', factoryContact: '', fabricType: '',
  designNotes: '', fit: '', keyFeatures: '', flatLayNotes: '',
  keyDesignNotes: [{ detail: '', description: '', reference: '' }],
  fabrics: [{ component: '', fabricType: '', composition: '', weightGsm: '', colorPantone: '', supplier: '', notes: '' }],
  trimsAccessories: [{ component: '', type: '', material: '', color: '', sizeSpec: '', supplier: '', qtyPerGarment: '' }],
  labelsBranding: [{ labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }],
  bom: [{ component: '', type: '', material: '', color: '', weight: '', supplier: '', supplierContact: '', costPerUnit: '', notes: '' }],
  colorways: [{ name: '', frColor: '', pantone: '', hex: '' }],
  logoFront: '', logoBack: '', logoMethod: '',
  seams: [{ operation: '', seamType: '', stitchType: '', spiSpcm: '', threadColor: '', notes: '' }],
  constructionNotes: '',
  patternPieces: [{ name: '', qty: '', fabric: '', grain: '', fusing: '', notes: '' }],
  cuttingNotes: '',
  poms: [
    { name: 'Chest Width (1/2)', tol: '1', s: '', m: '', l: '', xl: '' },
    { name: 'Body Length (HPS)', tol: '1', s: '', m: '', l: '', xl: '' },
    { name: 'Shoulder Width', tol: '1', s: '', m: '', l: '', xl: '' },
    { name: 'Sleeve Length', tol: '1', s: '', m: '', l: '', xl: '' },
    { name: 'Sleeve Opening', tol: '0.5', s: '', m: '', l: '', xl: '' },
    { name: 'Hem Width (1/2)', tol: '1', s: '', m: '', l: '', xl: '' },
    { name: 'Armhole', tol: '1', s: '', m: '', l: '', xl: '' },
    { name: 'Cuff Width', tol: '0.5', s: '', m: '', l: '', xl: '' },
  ],
  sizeType: 'apparel',
  treatments: [{ treatment: '', process: '', temp: '', duration: '', chemicals: '', notes: '' }],
  distressing: [{ area: '', technique: '', intensity: '', notes: '' }],
  careInstructions: 'Machine wash cold, inside out\nTumble dry low\nDo not bleach\nIron low if needed\nDo not dry clean',
  packaging: 'Standard FR Packaging', packagingNotes: '',
  quantities: [{ colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }],
  shipTo: '', deliveryLocation: '', shipMethod: '', incoterm: 'FOB', targetShipDate: '', targetArrivalDate: '', freightForwarder: '', specialInstructions: '',
  cartons: [{ cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }],
  // PLM features
  parentStyleId: null,
  parentStyleName: '',
  revisions: [],
  samples: [],
};

export const IMG_STEPS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11]);

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
  const bom = data.bom || data.trims || [];
  return bom.reduce((sum, item) => sum + (parseFloat(item.costPerUnit) || 0), 0);
}

export function computeCompletion(data) {
  const filled = Object.entries(data).filter(([k, v]) => {
    if (Array.isArray(v)) return v.some(r => Object.values(r).some(x => x));
    return v && v !== DEFAULT_DATA[k];
  }).length;
  return Math.round((filled / Object.keys(DEFAULT_DATA).length) * 100);
}
