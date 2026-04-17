// Generates public/state.json — a machine-readable snapshot of the Cash Model build
// for Claude (on claude.ai) to fetch at https://matasmillion.github.io/cashmodel/state.json
//
// Runs automatically before every `npm run build` via the `prebuild` npm hook.
// Run manually with: `node scripts/generate-state.js`

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import {
  PRODUCTS,
  CURRENT_WEEK_SEED,
  DEFAULT_ASSUMPTIONS,
  OPEX_SUBSCRIPTIONS,
  OPEX_WAREHOUSE,
  CREDIT_CARDS,
  LOANS,
  AD_UNIT_TYPES,
  CREATOR_DEAL,
} from '../src/data/seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Inline projection engine (mirrors src/utils/calculations.js::generateWeeklyProjections)
// Kept here so the generator has no runtime dependency on the full React bundle.
// ─────────────────────────────────────────────────────────────────────────────
function computeWeek(i, a) {
  const growthMultiplier = Math.pow(1 + a.weeklyGrowthRate, i);
  const dailyAdSpend = a.startingDailyAdSpend * growthMultiplier;
  const weeklyAdSpend = Math.round(dailyAdSpend * 7);
  const revenue = Math.round(weeklyAdSpend / a.targetMER);
  const orders = Math.round(revenue / a.aov);
  const unitsSold = Math.round(orders * a.unitsPerOrder);

  const cogs = -Math.round(revenue * a.cogsRate);
  const grossProfit = revenue + cogs;

  const creatorCost = i % 3 === 0 ? CREATOR_DEAL.costPerCreative : 0;
  const creativeCost = Math.round(creatorCost + a.founderVidsPerWeek * 20 + a.aiConceptsPerWeek * 5);

  const contributionMargin = grossProfit - weeklyAdSpend - creativeCost;
  const variableCosts = -Math.round(revenue * a.variablePercent);
  const weeklyOPEX = -Math.round((a.opexTier1 || 2000) / 4.33);
  const plNetProfit = contributionMargin + variableCosts + weeklyOPEX;

  return {
    week: i,
    revenue,
    orders,
    unitsSold,
    weeklyAdSpend,
    cogs,
    grossProfit,
    creativeCost: -creativeCost,
    contributionMargin,
    variableCosts,
    opex: weeklyOPEX,
    plNetProfit,
  };
}

// ─── Sample weeks for the P&L structure ──────────────────────────────────────
const sampleWeeks = {
  week0: computeWeek(0, DEFAULT_ASSUMPTIONS),
  week10: computeWeek(10, DEFAULT_ASSUMPTIONS),
  week20: computeWeek(20, DEFAULT_ASSUMPTIONS),
  week30: computeWeek(30, DEFAULT_ASSUMPTIONS),
};

// ─── Simplified PO schedule generator ────────────────────────────────────────
const weeksToProject = 40;
let currentInventoryUnits = CURRENT_WEEK_SEED.inventoryUnits;
const poSchedule = [];
let lastPO = -DEFAULT_ASSUMPTIONS.poCooldownWeeks;

for (let i = 0; i < weeksToProject; i++) {
  const w = computeWeek(i, DEFAULT_ASSUMPTIONS);
  currentInventoryUnits -= w.unitsSold;
  const weeksOfSupply = w.unitsSold > 0 ? currentInventoryUnits / w.unitsSold : 99;

  if (weeksOfSupply <= DEFAULT_ASSUMPTIONS.poTriggerWeeks && (i - lastPO) >= DEFAULT_ASSUMPTIONS.poCooldownWeeks) {
    let unitsNeeded = 0;
    for (let j = i; j < Math.min(i + DEFAULT_ASSUMPTIONS.poCoversWeeks, weeksToProject); j++) {
      unitsNeeded += computeWeek(j, DEFAULT_ASSUMPTIONS).unitsSold;
    }
    const fullCost = unitsNeeded * DEFAULT_ASSUMPTIONS.blendedLanded;
    poSchedule.push({
      id: `PO-${String(poSchedule.length + 1).padStart(2, '0')}`,
      weekIndex: i,
      units: unitsNeeded,
      fullCost: Math.round(fullCost),
      payments: {
        deposit: {
          weekIndex: i,
          amount: Math.round(fullCost * DEFAULT_ASSUMPTIONS.depositPercent),
          percent: Math.round(DEFAULT_ASSUMPTIONS.depositPercent * 100),
        },
        production: {
          weekIndex: i + DEFAULT_ASSUMPTIONS.prodPayWeek,
          amount: Math.round(fullCost * DEFAULT_ASSUMPTIONS.prodPayPercent),
          percent: Math.round(DEFAULT_ASSUMPTIONS.prodPayPercent * 100),
        },
        net30: {
          weekIndex: i + DEFAULT_ASSUMPTIONS.net30PayWeek,
          amount: Math.round(fullCost * DEFAULT_ASSUMPTIONS.net30Percent),
          percent: Math.round(DEFAULT_ASSUMPTIONS.net30Percent * 100),
        },
      },
      arrivalWeekIndex: i + DEFAULT_ASSUMPTIONS.leadTime,
    });
    currentInventoryUnits += unitsNeeded;
    lastPO = i;
  }
}

// ─── Unit economics for every product ────────────────────────────────────────
const unitEconProducts = Object.values(PRODUCTS).flatMap((col) =>
  col.products.map((p) => {
    const freightForwarding = p.weight * p.freightPerKg;
    const paymentProcessing = p.price * DEFAULT_ASSUMPTIONS.paymentProcessingPercent;
    const shipping = p.shippingLabel + p.pickPack + p.stickersCard;
    const production = p.production;
    const packaging = p.packaging;
    const cogs = production + packaging + freightForwarding + shipping + paymentProcessing;
    const grossProfit = p.price - cogs;
    const gm = grossProfit / p.price;
    return {
      id: p.id,
      name: p.name,
      collection: col.collectionName,
      price: p.price,
      costs: {
        production,
        packaging,
        freightForwarding: +freightForwarding.toFixed(2),
        shipping: +shipping.toFixed(2),
        paymentProcessing: +paymentProcessing.toFixed(2),
        totalCOGS: +cogs.toFixed(2),
      },
      grossProfit: +grossProfit.toFixed(2),
      grossMarginPercent: +(gm * 100).toFixed(1),
    };
  })
);

// ─── Changelog from git log ──────────────────────────────────────────────────
let changelog = [];
try {
  // Use \t as delimiter — safer than | which some commit messages may contain,
  // and avoids any shell quoting issues on different platforms.
  const gitLog = execSync(`git log -10 --pretty=format:"%H%x09%aI%x09%s"`, { cwd: repoRoot })
    .toString()
    .trim();
  changelog = gitLog.split('\n').map((line) => {
    const [sha, date, ...msgParts] = line.split('\t');
    return { sha: sha.slice(0, 7), date, message: msgParts.join('\t') };
  });
} catch (err) {
  console.warn('Could not read git log:', err.message);
}

// ─── OPEX totals ─────────────────────────────────────────────────────────────
const activeSubscriptionsMonthly = OPEX_SUBSCRIPTIONS
  .filter((s) => s.active)
  .reduce((sum, s) => sum + s.cost, 0);
const warehouseMonthly = Object.values(OPEX_WAREHOUSE).reduce((sum, v) => sum + v, 0);

// ─── Build the full state object ─────────────────────────────────────────────
const state = {
  lastUpdated: new Date().toISOString(),
  liveUrl: 'https://matasmillion.github.io/cashmodel/',
  repoUrl: 'https://github.com/matasmillion/cashmodel',
  branch: 'claude/build-cash-model-app-11msn',
  stateSchemaVersion: 1,
  purpose:
    'Machine-readable snapshot of the Foreign Resource Cash Model build. Claude fetches this to understand the current state of tabs, assumptions, formulas, and outstanding issues without needing to render the app.',

  techStack: {
    framework: 'React 19 + Vite 8',
    styling: 'Tailwind CSS 4 (via @tailwindcss/vite)',
    stateManagement: 'useReducer + Context API',
    persistence: 'localStorage (always) + Supabase Postgres (when VITE_SUPABASE_* secrets set)',
    auth: 'Supabase Auth (conditional — skipped when not configured)',
    deployment: 'GitHub Pages via GitHub Actions workflow',
    hosting: 'https://matasmillion.github.io/cashmodel/',
  },

  tabs: [
    { id: 'dashboard',     name: 'Dashboard',     status: 'built',       components: ['KPICards', 'CashflowChart', 'CashflowTable'] },
    { id: 'revenue',       name: 'Revenue',       status: 'built',       components: ['RevenueForecast'] },
    { id: 'cashflow',      name: 'P&L + Cash',    status: 'built',       components: ['CashflowTable'] },
    { id: 'ad-units',      name: 'Creative',      status: 'built',       components: ['AdUnitModel'] },
    { id: 'unit-economics',name: 'Unit Econ',     status: 'built',       components: ['UnitEconomics'] },
    { id: 'product',       name: 'Product',       status: 'built',       components: ['TechPackList', 'TechPackBuilder'], notes: '14-step tech pack builder. Auto-saves to Supabase. Generate & Download produces PDF + SVG. Pivots app toward a full ERP for solo fashion founders.' },
    { id: 'fulfillment',   name: 'Fulfillment',   status: 'built',       components: ['RateCardManager'], notes: 'AI rate card parser using Anthropic API' },
    { id: 'po-schedule',   name: 'PO Schedule',   status: 'built',       components: ['POSchedule'] },
    { id: 'pos',           name: 'New PO',        status: 'built',       components: ['POBuilder'] },
    { id: 'opex',          name: 'OPEX',          status: 'built',       components: ['OpexManager'] },
    { id: 'scenarios',     name: 'Scenarios',     status: 'built',       components: ['ScenarioManager'] },
    { id: 'integrations',  name: 'Integrations',  status: 'in-progress', components: ['IntegrationsPanel'], notes: 'Shopify/Klaviyo blocked by CORS; Meta Ads works; Banking requires backend' },
  ],

  assumptions: {
    weeklyGrowthRate:       { value: DEFAULT_ASSUMPTIONS.weeklyGrowthRate,     type: 'percent',  min: 0,   max: 0.10, step: 0.002, description: 'Compound weekly growth applied to daily ad spend' },
    startingDailyAdSpend:   { value: DEFAULT_ASSUMPTIONS.startingDailyAdSpend, type: 'currency', min: 0,   max: 1000, step: 10,    description: 'Meta ad spend on week 0' },
    targetMER:              { value: DEFAULT_ASSUMPTIONS.targetMER,            type: 'percent',  step: 0.01,                      description: 'Target marketing efficiency ratio (ad spend / revenue)' },
    cogsRate:               { value: DEFAULT_ASSUMPTIONS.cogsRate,             type: 'percent',  step: 0.01,                      description: 'Blended cost of goods as % of revenue' },
    aov:                    { value: DEFAULT_ASSUMPTIONS.aov,                  type: 'currency', min: 20,  max: 300,  step: 5,     description: 'Average order value' },
    unitsPerOrder:          { value: DEFAULT_ASSUMPTIONS.unitsPerOrder,        type: 'number' },
    variablePercent:        { value: DEFAULT_ASSUMPTIONS.variablePercent,      type: 'percent',  step: 0.005,                     description: 'Fulfillment + processing + shipping as % of revenue' },
    paymentProcessingPercent: { value: DEFAULT_ASSUMPTIONS.paymentProcessingPercent, type: 'percent', step: 0.005 },
    opexTier1:              { value: DEFAULT_ASSUMPTIONS.opexTier1,            type: 'currency', min: 500, max: 10000, step: 100,  description: 'Monthly OPEX (tier 1)' },
    opexTier2:              { value: DEFAULT_ASSUMPTIONS.opexTier2,            type: 'currency', description: 'Defined but unused — see openIssues.opex-tiers-unused' },
    opexTier3:              { value: DEFAULT_ASSUMPTIONS.opexTier3,            type: 'currency', description: 'Defined but unused — see openIssues.opex-tiers-unused' },
    poTriggerWeeks:         { value: DEFAULT_ASSUMPTIONS.poTriggerWeeks,       type: 'integer',  min: 4,   max: 20,   step: 1,     description: 'Auto-trigger PO when weeksOfSupply falls below this' },
    poCoversWeeks:          { value: DEFAULT_ASSUMPTIONS.poCoversWeeks,        type: 'integer',  description: 'How many weeks of demand each PO should cover' },
    poCooldownWeeks:        { value: DEFAULT_ASSUMPTIONS.poCooldownWeeks,      type: 'integer',  description: 'Minimum weeks between auto-POs' },
    leadTime:               { value: DEFAULT_ASSUMPTIONS.leadTime,             type: 'integer',  description: 'Weeks from order to delivery' },
    depositPercent:         { value: DEFAULT_ASSUMPTIONS.depositPercent,       type: 'percent' },
    prodPayPercent:         { value: DEFAULT_ASSUMPTIONS.prodPayPercent,       type: 'percent' },
    net30Percent:           { value: DEFAULT_ASSUMPTIONS.net30Percent,         type: 'percent' },
    prodPayWeek:            { value: DEFAULT_ASSUMPTIONS.prodPayWeek,          type: 'integer',  description: 'Weeks after deposit when production payment is due' },
    net30PayWeek:           { value: DEFAULT_ASSUMPTIONS.net30PayWeek,         type: 'integer',  description: 'Weeks after deposit when net-30 payment is due' },
    blendedLanded:          { value: DEFAULT_ASSUMPTIONS.blendedLanded,        type: 'currency', description: 'Blended cost per unit including freight' },
    cashBuffer:             { value: DEFAULT_ASSUMPTIONS.cashBuffer,           type: 'currency' },
    taxRate:                { value: DEFAULT_ASSUMPTIONS.taxRate,              type: 'percent' },
    nol:                    { value: DEFAULT_ASSUMPTIONS.nol,                  type: 'currency', description: 'Net operating loss carry-forward' },
    founderVidsPerWeek:     { value: DEFAULT_ASSUMPTIONS.founderVidsPerWeek,   type: 'integer' },
    aiConceptsPerWeek:      { value: DEFAULT_ASSUMPTIONS.aiConceptsPerWeek,    type: 'integer' },
  },

  revenueModel: {
    description: 'Layer-cake model: total revenue = acquisition + retention + events',
    layers: [
      {
        name: 'Acquisition',
        status: 'built',
        formula: 'weeklyAdSpend = startingDailyAdSpend × (1 + weeklyGrowthRate)^week × 7\nrevenue = weeklyAdSpend / targetMER',
        source: 'Meta ad spend compounded weekly by growth rate, converted to revenue via target MER',
      },
      {
        name: 'Retention',
        status: 'placeholder',
        formula: 'retentionRevenue = 0 (hardcoded)',
        source: 'Needs Shopify cohort data — see openIssues.retention-placeholder',
      },
      {
        name: 'Events',
        status: 'built',
        formula: 'eventRevenue = sum(event.estimatedRevenue WHERE event.weekIndex === currentWeek)',
        source: 'User-added marketing events with manual revenue/CM estimates',
      },
    ],
  },

  pnlStructure: {
    description: 'Weekly P&L — each row builds on the one above',
    rows: [
      { order: 1, name: 'Revenue',              formula: 'acquisitionRevenue + retentionRevenue + eventRevenue' },
      { order: 2, name: 'COGS',                 formula: '-(revenue × cogsRate)', sign: 'negative' },
      { order: 3, name: 'Gross Profit',         formula: 'revenue + cogs', derived: true },
      { order: 4, name: 'Ad Spend',             formula: '-(weeklyAdSpend)', sign: 'negative' },
      { order: 5, name: 'Creative Cost',        formula: '-((week % 3 === 0 ? creatorDealCost : 0) + founderVids×20 + aiConcepts×5)', sign: 'negative' },
      { order: 6, name: 'Contribution Margin',  formula: 'grossProfit + adSpend + creativeCost', derived: true },
      { order: 7, name: 'Variable Costs',       formula: '-(revenue × variablePercent)', sign: 'negative', description: 'Fulfillment, payment processing, shipping' },
      { order: 8, name: 'OPEX',                 formula: '-(opexTier1 / 4.33)', sign: 'negative', description: 'Monthly OPEX converted to weekly' },
      { order: 9, name: 'Net Profit (P&L)',     formula: 'contributionMargin + variableCosts + opex', derived: true },
    ],
    sampleOutput: sampleWeeks,
    sampleOutputNote: 'Values computed with current DEFAULT_ASSUMPTIONS. retentionRevenue=0, no events, no POs in sample.',
  },

  cashFlow: {
    weeklyFormula: 'weeklyCash = contributionMargin + variableCosts + opex - taxReserve - poPayments',
    cumulativeFormula: 'cumulativeCash[i] = (i === 0 ? seed.totalCash : cumulativeCash[i-1]) + weeklyCash[i]',
    freeCashFormula: 'freeCash = cumulativeCash - (stAdsPayable + stFulfillmentPayable + workingCapital)',
    poIntegration: {
      status: 'built',
      method: 'POs add to poPayments on their scheduled payment weeks (30% deposit / 40% production / 30% net-30)',
    },
    seed: {
      week0Date: CURRENT_WEEK_SEED.date,
      totalCash: CURRENT_WEEK_SEED.totalCash,
      sbMain: CURRENT_WEEK_SEED.sbMain,
      workingCapital: CURRENT_WEEK_SEED.workingCapital,
      stAdsPayable: CURRENT_WEEK_SEED.stAdsPayable,
      stFulfillmentPayable: CURRENT_WEEK_SEED.stFulfillmentPayable,
    },
    notes: [
      'Week 0 cash is seeded from CURRENT_WEEK_SEED.totalCash (last known actuals)',
      'stAdsPayable cycles monthly — Meta charges every ~4 weeks',
      'stFulfillmentPayable cycles per 3PL billing cycle',
      'workingCapital tracks Shopify Capital float (~96% of variable costs)',
      'Tax reserve is currently 0 (NOL shelter)',
    ],
  },

  poSchedule: {
    rule: `Auto-trigger when weeksOfSupply <= ${DEFAULT_ASSUMPTIONS.poTriggerWeeks}, covers ${DEFAULT_ASSUMPTIONS.poCoversWeeks} weeks of forward demand`,
    leadTimeWeeks: DEFAULT_ASSUMPTIONS.leadTime,
    cooldownWeeks: DEFAULT_ASSUMPTIONS.poCooldownWeeks,
    paymentSplit: { deposit: '30%', production: '40% (week 5)', net30: '30% (week 9)' },
    autoGenerated: poSchedule,
    generatedFromAssumptions: true,
  },

  unitEconomics: {
    products: unitEconProducts,
    blendedLanded: DEFAULT_ASSUMPTIONS.blendedLanded,
    blendedGM: DEFAULT_ASSUMPTIONS.productGM,
    effectiveGM: DEFAULT_ASSUMPTIONS.effectiveGM,
    formula: 'cogs = production + packaging + (weight × freightPerKg) + shippingLabel + pickPack + stickersCard + (price × paymentProcessingPercent)',
  },

  creative: {
    adUnitTypes: AD_UNIT_TYPES,
    creatorDealEconomics: CREATOR_DEAL,
    defaults: {
      founderVidsPerWeek: DEFAULT_ASSUMPTIONS.founderVidsPerWeek,
      aiConceptsPerWeek: DEFAULT_ASSUMPTIONS.aiConceptsPerWeek,
      creatorDealCadenceWeeks: 3,
    },
    weeklyCostFormula: '(week % 3 === 0 ? creatorDeal.costPerCreative : 0) + (founderVidsPerWeek × 20) + (aiConceptsPerWeek × 5)',
  },

  opex: {
    subscriptions: OPEX_SUBSCRIPTIONS,
    warehouse: OPEX_WAREHOUSE,
    totals: {
      activeSubscriptionsMonthly: +activeSubscriptionsMonthly.toFixed(2),
      warehouseMonthly: +warehouseMonthly.toFixed(2),
      totalMonthly: +(activeSubscriptionsMonthly + warehouseMonthly).toFixed(2),
      weeklyRunRate: +((activeSubscriptionsMonthly + warehouseMonthly) / 4.33).toFixed(2),
    },
    categories: [...new Set(OPEX_SUBSCRIPTIONS.map((s) => s.category))],
    billingDatesConfigured: OPEX_SUBSCRIPTIONS.filter((s) => s.billingDate !== null).length,
  },

  fulfillment: {
    status: 'partial',
    rateCardParser: {
      status: 'built',
      method: 'Anthropic API (claude-sonnet-4-5) called directly from browser with user-provided API key',
      acceptsMultipleFiles: true,
      supportsParsingInstructions: true,
      storage: 'localStorage + Supabase (if configured)',
    },
    perProductDefaults: Object.values(PRODUCTS).flatMap((col) =>
      col.products.map((p) => ({
        id: p.id,
        name: p.name,
        shippingLabel: p.shippingLabel,
        pickPack: p.pickPack,
        stickersCard: p.stickersCard,
        packaging: p.packaging,
        totalFulfillmentPerUnit: +(p.shippingLabel + p.pickPack + p.stickersCard + p.packaging).toFixed(2),
      }))
    ),
  },

  inventory: {
    currentUnits: CURRENT_WEEK_SEED.inventoryUnits,
    currentValue: CURRENT_WEEK_SEED.inventory,
    weeksOfSupplyFormula: 'inventoryUnits / currentWeek.unitsSold',
    poTriggerThreshold: DEFAULT_ASSUMPTIONS.poTriggerWeeks,
    alertRule: `flag weeksOfSupply <= ${DEFAULT_ASSUMPTIONS.poTriggerWeeks}`,
  },

  liabilities: {
    creditCards: CREDIT_CARDS,
    loans: LOANS,
    totalCreditCardBalance: +CREDIT_CARDS.reduce((sum, c) => sum + c.balance, 0).toFixed(2),
    totalCreditCardMinPayment: +CREDIT_CARDS.reduce((sum, c) => sum + c.minPayment, 0).toFixed(2),
  },

  auth: {
    provider: 'Supabase Auth',
    enabledWhen: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY secrets are set in GitHub',
    methods: ['email/password', 'magic link', 'Google OAuth'],
    storage: 'Supabase Postgres table `user_state` with Row-Level Security',
    fallback: 'localStorage only — app skips auth entirely when not configured',
  },

  integrations: {
    shopify:   { status: 'cors-blocked',        method: 'Admin API token',      notes: 'Needs backend proxy (Cloudflare Worker or Vercel function)' },
    meta:      { status: 'working-client-side', method: 'Graph API token',      notes: 'Meta Marketing API supports browser CORS' },
    klaviyo:   { status: 'cors-blocked',        method: 'Private API key',      notes: 'Needs backend proxy' },
    banking:   { status: 'manual-only',         method: 'Plaid (not built)',    notes: 'Requires backend, cash entered manually for now' },
    anthropic: { status: 'working-client-side', method: 'API key in localStorage', notes: 'Used for rate card parsing, model: claude-sonnet-4-5' },
    threePL:   { status: 'built',               method: 'Rate card upload',     notes: 'Handled via Fulfillment tab with AI parser' },
  },

  openIssues: [
    {
      id: 'gh-pages-404',
      title: 'GitHub Pages intermittent 404 on mobile',
      severity: 'high',
      notes: 'Verify repo → Settings → Pages → Source is "GitHub Actions" (not "Deploy from branch"). URL: https://matasmillion.github.io/cashmodel/',
    },
    {
      id: 'cors-shopify',
      title: 'Shopify Admin API blocked by CORS',
      severity: 'medium',
      notes: 'IntegrationsPanel → Shopify will fail with "Failed to fetch". Needs a Cloudflare Worker or Vercel function proxy.',
    },
    {
      id: 'cors-klaviyo',
      title: 'Klaviyo Private API blocked by CORS',
      severity: 'medium',
      notes: 'Same fix as Shopify — lightweight backend proxy required.',
    },
    {
      id: 'retention-placeholder',
      title: 'Retention revenue layer hardcoded to 0',
      severity: 'medium',
      notes: 'calculations.js line ~50: retentionRevenue = 0. Needs Shopify cohort data to compute repeat-purchase revenue.',
    },
    {
      id: 'banking-manual',
      title: 'Bank cash balance is manual entry only',
      severity: 'low',
      notes: 'Plaid integration requires a backend — users update seed.totalCash manually via the Dashboard.',
    },
    {
      id: 'opex-tiers-unused',
      title: 'opexTier2 and opexTier3 defined but unused',
      severity: 'low',
      notes: 'Projection engine only uses tier1. Logic for escalating OPEX at revenue milestones not yet built.',
    },
    {
      id: 'api-key-localstorage',
      title: 'Anthropic API key stored in browser localStorage',
      severity: 'low',
      notes: 'Acceptable for single-user internal tool. Would need backend proxy for multi-user scenario.',
    },
  ],

  changelog,
};

// ─── Write output ────────────────────────────────────────────────────────────
const outPath = path.join(repoRoot, 'public', 'state.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(state, null, 2) + '\n');

console.log(`✓ Generated ${path.relative(repoRoot, outPath)}`);
console.log(`  ${state.tabs.length} tabs · ${unitEconProducts.length} products · ${poSchedule.length} auto-POs · ${state.openIssues.length} open issues · ${changelog.length} changelog entries`);
