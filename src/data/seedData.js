// ============================================================
// PRODUCT CATALOG
// ============================================================
export const PRODUCTS = {
  'borderless-basics': {
    collectionName: 'Borderless Basics',
    products: [
      { id: 'p1-zip-hoodie', name: 'P1 - Zip Up Hoodie', price: 117, production: 27, unitCost: 27, packaging: 0.206, shippingLabel: 10.3, pickPack: 2.72, stickersCard: 0.189, weight: 1.2, freightPerKg: 4 },
      { id: 'p2-hoodie', name: 'P2 - Hoodie', price: 117, production: 25, unitCost: 25, packaging: 0.206, shippingLabel: 10.3, pickPack: 2.72, stickersCard: 0.189, weight: 1.0, freightPerKg: 4 },
      { id: 'p3-sweatpants', name: 'P3 - Sweatpants', price: 117, production: 25, unitCost: 25, packaging: 0.206, shippingLabel: 10.3, pickPack: 2.72, stickersCard: 0.189, weight: 0.9, freightPerKg: 4 },
      { id: 'p4-tee', name: 'P4 - Tee', price: 47, production: 12, unitCost: 12, packaging: 0.206, shippingLabel: 5.53, pickPack: 2.72, stickersCard: 0.189, weight: 0.4, freightPerKg: 4 },
    ],
  },
  restocks: {
    collectionName: 'Restocks',
    products: [
      { id: 'warefare-waffle', name: 'Warefare Waffle Knit', price: 95, production: 28.84, unitCost: 28, packaging: 0.206, shippingLabel: 5.53, pickPack: 2.72, stickersCard: 0.189, weight: 0.4, freightPerKg: 11.46 },
    ],
  },
};

// ============================================================
// CURRENT WEEK SEED (Last known actuals — week of Mar 30, 2026)
// ============================================================
export const CURRENT_WEEK_SEED = {
  date: '2026-03-30',
  revenue: 1514.24,
  adSpend: 499.70,
  totalCash: 11491.12,
  inventory: 12726,
  inventoryUnits: 741,
  stAdsPayable: 3223,
  stFulfillmentPayable: 1260.22,
  workingCapital: 6210.73,
  sbMain: 11709.42,
};

// ============================================================
// GROWTH MODEL ASSUMPTIONS (from Growth Model.xlsx)
// ============================================================
export const DEFAULT_ASSUMPTIONS = {
  // Growth & Acquisition
  startingDailyAdSpend: 150,
  weeklyGrowthRate: 0.028, // 2.8% weekly = ~4.2x annual
  targetMER: 0.33,

  // Order Economics
  aov: 125,
  unitsPerOrder: 1.1,
  hsASP: 117,
  teeASP: 37,
  cogsRate: 0.27,
  hsMix: 0.86,
  teeMix: 0.14,
  variablePercent: 0.138,

  // Unit Costs
  hsFOB: 27.59,
  teeFOB: 8.99,
  blendedFOB: 24.986,
  blendedLanded: 28.566,
  cogsPerOrder: 31.4226,
  productGM: 0.748619,
  effectiveGM: 0.610619,

  // Content
  founderVidsPerWeek: 3,
  aiConceptsPerWeek: 7,

  // OPEX Tiers (monthly)
  opexTier1: 2000,
  opexTier2: 2305,
  opexTier3: 3200,

  // Inventory / PO
  prodWeeks: 5,
  seaWeeks: 5,
  leadTime: 10,
  poTriggerWeeks: 11,
  poCoversWeeks: 8,
  poCooldownWeeks: 8,
  depositPercent: 0.30,
  prodPayPercent: 0.40,
  net30Percent: 0.30,
  prodPayWeek: 5,
  net30PayWeek: 9,
  cashBuffer: 500,

  // Tax
  taxRate: 0.21,
  nol: 50000,
  nolMax: 0.80,

  // Legacy (for backward compat)
  paymentProcessingPercent: 0.04,
  fulfillmentPercent: 0.10,
  shopifyCapitalRate: 0.06,
  creativePercent: 0.06,
  interestFrequencyWeeks: 4,
  weeklyGrowthH1: 1.028,
  weeklyGrowthH2: 1.028,
  mer: 0.33,
};

// ============================================================
// AD UNIT TYPES (Creator Model)
// ============================================================
export const AD_UNIT_TYPES = [
  { id: 'creator', name: 'Creator UGC', costPerUnit: 130, moq: 3, variationsPerUnit: 3, description: 'Creator-shot video ads', avgLifespanWeeks: 4 },
  { id: 'high-production', name: 'High Production', costPerUnit: 130, moq: 5, variationsPerUnit: 3, description: 'Studio/campaign video ads', avgLifespanWeeks: 6 },
  { id: 'ai', name: 'AI Generated', costPerUnit: 5, moq: 0, variationsPerUnit: 3, description: 'AI-generated creative', avgLifespanWeeks: 2 },
  { id: 'founder', name: 'Founder Ad', costPerUnit: 20, moq: 0, variationsPerUnit: 3, description: 'Founder-to-camera content', avgLifespanWeeks: 3 },
];

// ============================================================
// CREATOR DEAL ECONOMICS (from Growth Model)
// ============================================================
export const CREATOR_DEAL = {
  seedCost: 96.87,
  vidsPerDeal: 3,
  payPerVid: 100,
  dealCost: 396.87,
  costPerCreative: 132.29,
  commission: 0.06,
  hitRate: 0.10,
  creatorFundPercent: 0.15,
  preSeeded: 4,
  preInvest: 1587.48,
};

// ============================================================
// EVENTS (Marketing Calendar — user adds these)
// ============================================================
export const DEFAULT_EVENTS = [];

// ============================================================
// OPEX
// ============================================================
export const OPEX_SUBSCRIPTIONS = [
  { id: 'slack', name: 'Slack', cost: 9.3, category: 'Mandatory', active: true, billingDate: 18 },
  { id: 'google', name: 'Google', cost: 17, category: 'Mandatory', active: true, billingDate: 1 },
  { id: 'shopify', name: 'Shopify', cost: 42, category: 'Mandatory', active: true, billingDate: 29 },
  { id: 'finaloop', name: 'Finaloop', cost: 131.75, category: 'Mandatory', active: true, billingDate: 28 },
  { id: 'phone', name: 'Phone', cost: 60, category: 'Mandatory', active: true, billingDate: 1 },
  { id: 'gusto', name: 'Gusto', cost: 55, category: 'Mandatory', active: false, billingDate: null },
  { id: 'kintsugi', name: 'Kintsugi', cost: 80, category: 'Mandatory', active: true, billingDate: 30 },
  { id: 'klaviyo', name: 'Klaviyo', cost: 150, category: 'Revenue/Cost', active: false, billingDate: 20 },
  { id: 'kleio', name: 'Kleio', cost: 29, category: 'Revenue/Cost', active: true, billingDate: 29 },
  { id: 'higgsfield', name: 'Higgsfield', cost: 150, category: 'Revenue/Cost', active: false, billingDate: 2 },
  { id: 'foreplay', name: 'Foreplay', cost: 65, category: 'Revenue/Cost', active: false, billingDate: null },
  { id: 'claude', name: 'Claude', cost: 100, category: 'Mandatory', active: true, billingDate: 12 },
  { id: 'openclaw', name: 'Openclaw', cost: 80, category: 'Mandatory', active: false, billingDate: null },
  { id: 'computer', name: 'Computer', cost: 116, category: 'Mandatory', active: true, billingDate: null },
  { id: 'clo3d', name: 'Clo3d', cost: 25, category: 'Luxury', active: true, billingDate: 9 },
  { id: 'bof', name: 'BOF', cost: 5, category: 'Luxury', active: true, billingDate: 28 },
  { id: 'microsoft', name: 'Microsoft', cost: 10, category: 'Luxury', active: true, billingDate: 13 },
  { id: 'aquavoice', name: 'AquaVoice', cost: 10, category: 'Luxury', active: true, billingDate: 4 },
  { id: 'figma', name: 'Figma', cost: 6, category: 'Luxury', active: true, billingDate: 28 },
];

export const OPEX_WAREHOUSE = { adminTech: 388, bins: 155, pallets: 35, returns: 20, nathanBelete: 250 };

export const CREDIT_CARDS = [
  { id: 'chase-5718', name: 'CHASE 5718', balance: 658, minPayment: 658 },
  { id: 'amex-plum', name: 'AMEX PLUM 0000', balance: 812.46, minPayment: 202 },
  { id: 'amex-blue', name: 'AMEX BLUE 71005', balance: 16831, minPayment: 173 },
];

export const LOANS = {
  shopifyCapital: { balance: 17094.1, repaymentRate: 0.06 },
  longTermLoan: { balance: 20000, interestPayment: 250, interestFrequencyWeeks: 4 },
};

export const GA_CASHFLOW_WEEKLY = [197.72, 110.72, 9.3, 265.15];
