// 58-week weekly cashflow engine — ported 1:1 from "13 Week Cashflow.xlsx".
//
// Each week object mirrors the row labels in the workbook so the renderer
// can read them directly. Historical weeks (date < currentMonday) use the
// seeded actuals verbatim; the current week is anchored by `seed`; future
// weeks are projected using the formulas below.
//
// Column-A scalars in the workbook map to these constants:
//   H1 weekly growth (1.04) → CONST.h1Growth
//   H2 weekly growth (1.07) → CONST.h2Growth
//   MER (0.33)              → CONST.mer
//   COGS % (0.27)           → CONST.cogsRate (overridable per week)
//   PP %  (0.04)            → CONST.ppPercent
//   Fulfillment % (0.09)    → CONST.fulfillmentPercent
//   Shopify Capital % (0.06)→ CONST.shopifyCapitalRate
//   Profit % (0.09)         → CONST.profitPercentForWC
//   Growth switch date      → CONST.growthSwitchDate (Aug 3, 2026)

import { HISTORICAL_WEEKS, CARD_PAYMENT_SCHEDULE, CASHFLOW_HORIZON_START, CASHFLOW_HORIZON_WEEKS } from '../data/historicalCashflow';
import { buildOpexBuckets, gaForWeek } from './opexBuckets';

export const CASHFLOW_DEFAULTS = {
  h1Growth: 1.04,
  h2Growth: 1.07,
  mer: 0.33,
  cogsRate: 0.27,
  ppPercent: 0.04,
  fulfillmentPercent: 0.09,
  shopifyCapitalRate: 0.06,
  profitPercentForWC: 0.09,
  growthSwitchDate: '2026-08-03',
  // Fixed overhead (fired on specific weeks of the projection)
  rdMonthlyAmount: 180,
  interestPayment: 125,
  interestEveryNWeeks: 4,
  // Admin/tech allocation accrued into fulfillment payable each week
  // (Excel: OPEX!I28/4 = $598/4 = $149.50)
  fulfillmentAdminWeekly: 149.50,
  // Creative as % of ad spend (Excel A56 = 0)
  creativePercentOfAdSpend: 0,
};

// ────────────────────────────────────────────────────────────────────────────
// Date helpers
// ────────────────────────────────────────────────────────────────────────────

function addWeeks(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function currentMondayISO() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function paymentForCard(date, cardKey, schedule) {
  return schedule
    .filter(s => s.date === date && s[cardKey] != null)
    .reduce((sum, s) => sum + s[cardKey], 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Engine
// ────────────────────────────────────────────────────────────────────────────

export function generateCashflow58({
  assumptions = {},
  seed = {},
  subscriptions = [],
  creditCards = [],
  loans = {},
  // eslint-disable-next-line no-unused-vars
  manualPOs = [],
  todayMonday = currentMondayISO(),
  horizonStart = CASHFLOW_HORIZON_START,
  weeks = CASHFLOW_HORIZON_WEEKS,
} = {}) {
  const C = { ...CASHFLOW_DEFAULTS, ...assumptions };
  const opexBuckets = buildOpexBuckets(subscriptions);
  const schedule = CARD_PAYMENT_SCHEDULE;

  // Seed lookups for historical weeks
  const histByDate = Object.fromEntries(HISTORICAL_WEEKS.map(h => [h.date, h]));

  // Initial card balances (week before horizon start) come from seedData CREDIT_CARDS
  // and LOANS — the engine treats those as the t=-1 anchor. Historical weeks
  // override on the way through.
  const cardOpening = {
    chase5718: creditCards.find(c => c.id === 'chase-5718')?.balance ?? 0,
    amexPlum: creditCards.find(c => c.id === 'amex-plum')?.balance ?? 734,
    amexBlue: creditCards.find(c => c.id === 'amex-blue')?.balance ?? 17173,
    shopifyCapital: loans.shopifyCapital?.balance ?? 18080,
    longTermLoan: loans.longTermLoan?.balance ?? 20000,
  };

  const out = [];
  for (let i = 0; i < weeks; i++) {
    const date = addWeeks(horizonStart, i);
    const prev = i > 0 ? out[i - 1] : null;
    const hist = histByDate[date];
    const isHistorical = date < todayMonday;
    const isCurrent = date === todayMonday;
    const dt = new Date(date + 'T00:00:00');
    const monthLabel = dt.toLocaleDateString('en-US', { month: 'short' });
    const dateLabel = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const useGrowth = date >= C.growthSwitchDate ? C.h2Growth : C.h1Growth;

    // ── Drivers (rows 5–8) ──────────────────────────────────────────────
    let dailyAdSpend, fbAdSpend, shopifyRevenue, cogsRate;
    if (hist) {
      dailyAdSpend = hist.dailyAdSpend;
      fbAdSpend = hist.fbAdSpend;
      shopifyRevenue = hist.shopifyRevenue;
      cogsRate = hist.cogsRate;
    } else if (isCurrent) {
      // Anchor on live-synced seed values when available; fall back to projection
      fbAdSpend = seed.adSpend ?? (prev ? prev.dailyAdSpend * useGrowth * 7 : 539);
      dailyAdSpend = fbAdSpend / 7;
      shopifyRevenue = seed.revenue ?? fbAdSpend / C.mer;
      cogsRate = C.cogsRate;
    } else {
      dailyAdSpend = (prev ? prev.dailyAdSpend : (seed.adSpend ?? 539) / 7) * useGrowth;
      fbAdSpend = dailyAdSpend * 7;
      shopifyRevenue = fbAdSpend / C.mer;
      cogsRate = C.cogsRate;
    }

    // ── Inflows (rows 42–44) ────────────────────────────────────────────
    const onlineStore = shopifyRevenue * (1 - C.ppPercent);
    const transferToWC = -(shopifyRevenue * cogsRate);
    const totalInflows = onlineStore + transferToWC;

    // ── Card / loan repayments (rows 50–54) ─────────────────────────────
    const payChase = paymentForCard(date, 'chase5718', schedule);
    const payAmexPlum = paymentForCard(date, 'amexPlum', schedule);
    const payAmexBlue = paymentForCard(date, 'amexBlue', schedule);
    const payShopifyCapital = shopifyRevenue * C.shopifyCapitalRate;
    const payLtLoan = paymentForCard(date, 'ltLoan', schedule);

    // ── Card / loan rolling balances (rows 31–35) ───────────────────────
    let chase5718, amexPlum, amexBlue, shopifyCapital, longTermLoan;
    if (hist) {
      chase5718 = hist.chase5718;
      amexPlum = hist.amexPlum;
      amexBlue = hist.amexBlue;
      shopifyCapital = hist.shopifyCapital;
      longTermLoan = hist.longTermLoan;
    } else if (isCurrent) {
      // Anchor cards on Plaid live balances when present, otherwise project
      chase5718 = seed.chase5718Balance ?? Math.max(0, (prev?.chase5718 ?? cardOpening.chase5718) - payChase);
      amexPlum = seed.amexPlumBalance ?? Math.max(0, (prev?.amexPlum ?? cardOpening.amexPlum) - payAmexPlum);
      amexBlue = seed.amexBlueBalance ?? Math.max(0, (prev?.amexBlue ?? cardOpening.amexBlue) - payAmexBlue);
      shopifyCapital = (prev?.shopifyCapital ?? cardOpening.shopifyCapital) - payShopifyCapital;
      longTermLoan = (prev?.longTermLoan ?? cardOpening.longTermLoan) - payLtLoan;
    } else {
      const opening = prev ?? {
        chase5718: cardOpening.chase5718,
        amexPlum: cardOpening.amexPlum,
        amexBlue: cardOpening.amexBlue,
        shopifyCapital: cardOpening.shopifyCapital,
        longTermLoan: cardOpening.longTermLoan,
      };
      chase5718 = Math.max(0, opening.chase5718 - payChase);
      amexPlum = Math.max(0, opening.amexPlum - payAmexPlum);
      amexBlue = Math.max(0, opening.amexBlue - payAmexBlue);
      shopifyCapital = opening.shopifyCapital - payShopifyCapital;
      longTermLoan = opening.longTermLoan - payLtLoan;
    }

    // ── Fixed overhead (rows 57–62) ─────────────────────────────────────
    const creativeProduction = fbAdSpend * C.creativePercentOfAdSpend;
    const salary = 0; // not modeled in xlsx for the projection block
    const ga = gaForWeek(date, opexBuckets);
    // R&D: $180 every 4 weeks starting week of June 8, 2026 (xlsx pattern)
    const rdAnchor = '2026-06-08';
    const weeksFromRdAnchor = Math.round((dt - new Date(rdAnchor + 'T00:00:00')) / (7 * 86400000));
    const rd = (weeksFromRdAnchor >= 0 && weeksFromRdAnchor % 4 === 0) ? C.rdMonthlyAmount : 0;
    // Interest: $125 every 4 weeks starting same anchor
    const interestAnchor = '2026-08-31';
    const weeksFromInterest = Math.round((dt - new Date(interestAnchor + 'T00:00:00')) / (7 * 86400000));
    const interest = (weeksFromInterest >= 0 && weeksFromInterest % 4 === 0) ? C.interestPayment : 0;

    // ── Fulfillment payable (rows 28 & 62) ──────────────────────────────
    // Outflow paid this week = previous balance, then accrue this week's bill.
    let fulfillmentPaid = 0;
    let fulfillmentPayable;
    if (hist) {
      fulfillmentPayable = hist.fulfillmentPayable;
      fulfillmentPaid = prev ? prev.fulfillmentPayable : 0;
    } else {
      fulfillmentPaid = prev ? prev.fulfillmentPayable : 0;
      const accrual = shopifyRevenue * C.fulfillmentPercent;
      fulfillmentPayable = (prev?.fulfillmentPayable ?? 0) - fulfillmentPaid + accrual + C.fulfillmentAdminWeekly;
    }

    // ── Ads payable (rows 27 & 47) ──────────────────────────────────────
    // Excel pattern: pay full prior balance once a month (week of month #1).
    let adsPaid = 0;
    let adsPayable;
    if (hist) {
      adsPayable = hist.adsPayable;
    } else {
      const isFirstWeekOfMonth = dt.getDate() <= 7;
      adsPaid = isFirstWeekOfMonth ? (prev?.adsPayable ?? 0) : 0;
      adsPayable = (prev?.adsPayable ?? 0) + fbAdSpend - adsPaid;
    }

    // ── Outflows (row 64) ───────────────────────────────────────────────
    const totalOutflows =
      adsPaid + fulfillmentPaid + payChase + payAmexPlum + payAmexBlue +
      payShopifyCapital + payLtLoan + creativeProduction + salary + ga + rd + interest;

    // ── Net cash flow (row 65) ──────────────────────────────────────────
    const netCashFlow = totalInflows - totalOutflows;

    // ── Cash on hand (rows 11–21) ───────────────────────────────────────
    let shopifyPayouts, sbMain, sbSalesTax, sbCorpTax, shopifyCapRepayment;
    if (hist) {
      shopifyPayouts = hist.shopifyPayouts;
      sbMain = hist.sbMain;
      sbSalesTax = hist.sbSalesTax;
      sbCorpTax = hist.sbCorpTax;
      shopifyCapRepayment = hist.shopifyCapRepayment;
    } else if (isCurrent) {
      // Current week is anchored on live Plaid balances (Mercury → seed)
      shopifyPayouts = onlineStore;
      sbMain = seed.sbMain ?? (prev?.totalCashOnHand ?? 0) + netCashFlow - transferToWC;
      sbSalesTax = seed.sbSalesTax ?? prev?.sbSalesTax ?? 0;
      sbCorpTax = seed.sbCorpTax ?? prev?.sbCorpTax ?? 0;
      shopifyCapRepayment = -payShopifyCapital;
    } else {
      shopifyPayouts = onlineStore; // simplification: payouts = online store inflow
      // SB Main = prev Total Cash + Net Cash Flow - Transfer to WC (Excel R12)
      sbMain = (prev?.totalCashOnHand ?? 0) + netCashFlow - transferToWC;
      sbSalesTax = prev?.sbSalesTax ?? 0;
      sbCorpTax = prev?.sbCorpTax ?? 0;
      shopifyCapRepayment = -payShopifyCapital;
    }
    const totalCashOnHand = hist
      ? hist.totalCashOnHand ?? (sbMain + (sbSalesTax || 0) + (sbCorpTax || 0) + (shopifyCapRepayment || 0))
      : sbMain + sbSalesTax + sbCorpTax + shopifyCapRepayment;

    // ── Inventory (row 22) ──────────────────────────────────────────────
    const inventory = hist ? hist.inventory : (prev?.inventory ?? 0) + transferToWC;

    // ── Working capital cash (row 23) ───────────────────────────────────
    const workingCapital = hist
      ? hist.workingCapital
      : (prev?.workingCapital ?? 0) - transferToWC;

    // ── Total assets (row 24) ───────────────────────────────────────────
    const totalAssets = totalCashOnHand + inventory;

    // ── Total liabilities (row 37) ──────────────────────────────────────
    const totalLiabilities = adsPayable + fulfillmentPayable + chase5718 + amexPlum + amexBlue + shopifyCapital + longTermLoan;

    // ── Total equity & ST liabilities net (rows 38–39) ─────────────────
    const totalEquity = totalAssets - totalLiabilities;
    const netCashOfStLiab = totalCashOnHand - adsPayable - fulfillmentPayable - workingCapital;

    // ── Working-capital summary (rows 68–69) ───────────────────────────
    const workingCapitalTotal = workingCapital + inventory;
    const workingCapitalOwed = workingCapitalTotal - longTermLoan;

    out.push({
      // identity
      weekIndex: i,
      date,
      monthLabel,
      dateLabel,
      isHistorical,
      isCurrent,
      // drivers
      dailyAdSpend,
      fbAdSpend,
      shopifyRevenue,
      cogsRate,
      // cash on hand
      shopifyPayouts,
      sbMain,
      sbSalesTax,
      sbCorpTax,
      shopifyCapRepayment,
      totalCashOnHand,
      inventory,
      workingCapital,
      totalAssets,
      // liabilities
      adsPayable,
      fulfillmentPayable,
      chase5718,
      amexPlum,
      amexBlue,
      shopifyCapital,
      longTermLoan,
      totalLiabilities,
      totalEquity,
      netCashOfStLiab,
      // inflows
      onlineStore,
      transferToWC,
      totalInflows,
      // outflows
      adsPaid,
      fulfillmentPaid,
      payChase,
      payAmexPlum,
      payAmexBlue,
      payShopifyCapital,
      payLtLoan,
      creativeProduction,
      salary,
      ga,
      rd,
      interest,
      totalOutflows,
      netCashFlow,
      // working capital summary
      workingCapitalTotal,
      workingCapitalOwed,
    });
  }

  return out;
}
