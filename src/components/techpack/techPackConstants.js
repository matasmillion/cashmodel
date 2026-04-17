// Constants shared by the Tech Pack builder — extracted from the original artifact

export const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A', white: '#FFFFFF',
};

export const FR_COLOR_OPTIONS = [
  { name: 'Slate', hex: '#3A3A3A' }, { name: 'Salt', hex: '#F5F0E8' }, { name: 'Sand', hex: '#EBE5D5' },
  { name: 'Stone', hex: '#716F70' }, { name: 'Soil', hex: '#9A816B' }, { name: 'Sea', hex: '#B5C7D3' },
  { name: 'Sage', hex: '#ADBDA3' }, { name: 'Sienna', hex: '#D4956A' },
];

export const DEFAULT_LIBRARY = { fabrics: [], trims: [], labels: [] };

export const STEPS = [
  { id: 'identity', title: 'Identity & Classification', icon: '01' },
  { id: 'sku', title: 'SKU & Numbering', icon: '02' },
  { id: 'factory', title: 'Factory Assignment', icon: '03' },
  { id: 'design', title: 'Design & Construction', icon: '04' },
  { id: 'flatlays', title: 'Flat Lay Diagrams', icon: '05' },
  { id: 'materials', title: 'Materials & BOM', icon: '06' },
  { id: 'color', title: 'Color & Artwork', icon: '07' },
  { id: 'construction', title: 'Construction Details', icon: '08' },
  { id: 'pattern', title: 'Pattern & Cutting', icon: '09' },
  { id: 'pom', title: 'Points of Measure', icon: '10' },
  { id: 'treatments', title: 'Garment Treatments', icon: '11' },
  { id: 'labels', title: 'Labels & Packaging', icon: '12' },
  { id: 'order', title: 'Order & Delivery', icon: '13' },
  { id: 'review', title: 'Review & Export', icon: '14' },
];

export const DEFAULT_DATA = {
  styleName: '', productCategory: '', productTier: '', season: '', targetRetail: '', targetFOB: '', status: 'Development',
  styleNumber: '', skuPrefix: '', barcodeMethod: 'Shopify Retail Barcode Labels',
  factory: '', factoryContact: '', fabricType: '',
  designNotes: '', fit: '', keyFeatures: '', flatLayNotes: '',
  shellFabric: '', shellWeight: '', shellComposition: '', ribComposition: '',
  trims: [{ component: '', type: '', material: '', color: '', notes: '' }],
  colorways: [{ name: '', frColor: 'Slate', pantone: '', hex: '#3A3A3A' }],
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
};

export const IMG_STEPS = new Set([3, 4, 6, 7, 8, 9, 10, 11]);

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

export function computeCompletion(data) {
  const filled = Object.entries(data).filter(([k, v]) => {
    if (Array.isArray(v)) return v.some(r => Object.values(r).some(x => x));
    return v && v !== DEFAULT_DATA[k];
  }).length;
  return Math.round((filled / Object.keys(DEFAULT_DATA).length) * 100);
}
