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

import { HISTORICAL_WEEKS, CARD_PAYMENT_SCHEDULE, CASHFLOW_HORIZON_WEEKS, getCashflowHorizonStart } from '../data/historicalCashflow';
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
  // Manual H2 daily-spend reset on growthSwitchDate. Workbook stepped
  // from ~$128 (last H1 week) to $150 (first H2 week) as a planning
  // override, then compounded at H2 rate. Without this, daily spend
  // continuously compounds through the boundary and undershoots the H2
  // target by ~15% across the rest of the year.
  h2StartingDailySpend: 150,
  // Fixed overhead (fired on specific weeks of the projection)
  rdMonthlyAmount: 180,
  interestPayment: 125,
  interestEveryNWeeks: 4,
  // Admin/tech allocation accrued into fulfillment payable each week
  // (Excel: OPEX!I28/4 = $598/4 = $149.50)
  fulfillmentAdminWeekly: 149.50,
  // Creative as % of ad spend (Excel A56 = 0)
  creativePercentOfAdSpend: 0,
  // Ads-payable and fulfillment-payable both pay down on a 4-week
  // (~monthly) cadence, anchored on the current Monday so the first
  // projected paydown lands on this week. Real cadence drifts with
  // statement closing dates — Plaid actuals override on past weeks.
  paydownEveryNWeeks: 4,
};

// ────────────────────────────────────────────────────────────────────────────
// Date helpers
// ────────────────────────────────────────────────────────────────────────────

// Parse YYYY-MM-DD as LOCAL midnight, unambiguously. `new Date('YYYY-MM-DD')`
// or `new Date('YYYY-MM-DDT00:00:00')` is parsed as UTC by some browsers and
// local by others — using components avoids the ambiguity.
function parseLocalDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Format a Date as YYYY-MM-DD using LOCAL time components.
// We deliberately avoid `.toISOString().slice(0,10)` because that converts
// to UTC first and silently shifts the date by 1 day in any timezone east
// of UTC. liveDataSync.getPast13Weeks already uses local-time keys, so all
// date lookups (actualsHistory, cardPaymentsActuals, growth switch, etc.)
// must match that convention.
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addWeeks(isoDate, n) {
  const d = parseLocalDate(isoDate);
  d.setDate(d.getDate() + n * 7);
  return toLocalISODate(d);
}

function currentMondayISO() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return toLocalISODate(monday);
}

function paymentForCard(date, cardKey, schedule) {
  return schedule
    .filter(s => s.date === date && s[cardKey] != null)
    .reduce((sum, s) => sum + s[cardKey], 0);
}

// Rule-based forward payment generator. Used when the static schedule
// runs out (e.g. the rolling horizon extends past 2027-03-08). The rules
// match the cadence we see in the workbook:
//
//   CHASE 5718  → $180 on the first Monday of each month, starting Aug 3, 2026
//   AMEX BLUE   → $175 every Monday from Aug 24, 2026 onward;
//                 $173 every 4th Monday (28-day cycle) before that
//   AMEX PLUM   → variable + paid off post Jun 2026 → $0
//   LT Loan     → $0 (interest is a separate weekly outflow)
//
// Shopify Capital is not a static rule — it's revenue × 6% computed inline.
const RULE_GEN_CARDS = ['chase5718', 'amexBlue'];

function ruleBasedPayment(date, cardKey) {
  const d = parseLocalDate(date);

  if (cardKey === 'chase5718') {
    // First Monday of the month, $180. Effective Aug 3, 2026.
    if (date < '2026-08-03') return 0;
    return d.getDate() <= 7 ? 180 : 0;
  }

  if (cardKey === 'amexBlue') {
    // Weekly $175 from Aug 24, 2026
    if (date >= '2026-08-24') return 175;
    // Otherwise ~monthly $173 (every 4th Monday from the Feb 2 anchor)
    const anchor = new Date('2026-02-02T00:00:00');
    const weeksFromAnchor = Math.round((d - anchor) / (7 * 86_400_000));
    return weeksFromAnchor >= 0 && weeksFromAnchor % 4 === 0 ? 173 : 0;
  }

  return 0;
}

// Look up a card payment for a given week. Precedence:
//   1. Live actuals from Plaid transactions (cardPaymentsActuals)
//   2. Hand-baked entry in CARD_PAYMENT_SCHEDULE
//   3. Rule-based generator (only for RULE_GEN_CARDS)
function paymentForCardWithFallback(date, cardKey, schedule, actuals) {
  const live = actuals?.[date]?.[cardKey];
  if (live != null) return live;

  // Static schedule covers 2026-02-02 → 2027-03-08. Use it for that window.
  const fromSchedule = paymentForCard(date, cardKey, schedule);
  if (fromSchedule > 0) return fromSchedule;
  if (date >= '2026-02-02' && date <= '2027-03-08') return 0;

  // Outside the schedule window, fall back to rules so the rolling horizon
  // keeps producing sensible projected payments past 2027-03-08.
  if (RULE_GEN_CARDS.includes(cardKey)) return ruleBasedPayment(date, cardKey);
  return 0;
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
  // Live actuals from Shopify / Meta sync, keyed by Monday ISO date.
  // Each entry: { revenue, orders, adSpend, impressions, clicks }.
  // Used to fill weeks between the seeded historical block and "this Monday"
  // — and to overlay actuals onto historical seed where the live numbers
  // differ from the workbook snapshot.
  actualsHistory = {},
  // Live card payments aggregated from Plaid transactions, keyed by Monday
  // ISO date → { chase5718, amexPlum, amexBlue, ltLoan }. Overrides both the
  // static schedule and the rule-based generator for any week we have data.
  cardPaymentsActuals = {},
  // eslint-disable-next-line no-unused-vars
  manualPOs = [],
  todayMonday = currentMondayISO(),
  horizonStart = getCashflowHorizonStart(todayMonday),
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
    const live = actualsHistory[date] || null;
    const isHistorical = date < todayMonday;
    const isCurrent = date === todayMonday;
    const dt = parseLocalDate(date);
    const monthLabel = dt.toLocaleDateString('en-US', { month: 'short' });
    const dateLabel = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const useGrowth = date >= C.growthSwitchDate ? C.h2Growth : C.h1Growth;

    // ── Drivers (rows 5–8) ──────────────────────────────────────────────
    // Precedence for the week's ad spend:
    //   • past week → live Meta insights, else seeded workbook actuals
    //   • current week → Meta CBO "Acquisition" daily budget × 7
    //   • future weeks → roll forward from prev × weekly growth rate
    let dailyAdSpend, fbAdSpend, shopifyRevenue, cogsRate = C.cogsRate;
    const liveRevenue = live?.revenue;
    const liveAdSpend = live?.adSpend;
    const metaDailyBudget = seed.metaDailyBudget;

    if (liveAdSpend != null) {
      fbAdSpend = liveAdSpend;
      dailyAdSpend = fbAdSpend / 7;
    } else if (hist) {
      fbAdSpend = hist.fbAdSpend;
      dailyAdSpend = hist.dailyAdSpend;
    } else if (isCurrent) {
      // Anchor on the CBO daily budget the operator has configured in
      // Ads Manager today. Falls back to seed.adSpend (this-week insights)
      // if budget hasn't synced yet, then to a continuation of the
      // historical trend.
      if (metaDailyBudget != null) {
        dailyAdSpend = metaDailyBudget;
      } else if (seed.adSpend != null) {
        dailyAdSpend = seed.adSpend / 7;
      } else if (prev) {
        dailyAdSpend = prev.dailyAdSpend * useGrowth;
      } else {
        dailyAdSpend = 539 / 7;
      }
      fbAdSpend = dailyAdSpend * 7;
    } else {
      // Future week: compound prev daily spend at the H1/H2 growth rate.
      const seedDaily = metaDailyBudget ?? (seed.adSpend != null ? seed.adSpend / 7 : 539 / 7);
      dailyAdSpend = (prev ? prev.dailyAdSpend : seedDaily) * useGrowth;
      fbAdSpend = dailyAdSpend * 7;
    }

    if (liveRevenue != null) {
      shopifyRevenue = liveRevenue;
    } else if (hist) {
      shopifyRevenue = hist.shopifyRevenue;
      cogsRate = hist.cogsRate;
    } else if (isCurrent) {
      shopifyRevenue = seed.revenue ?? fbAdSpend / C.mer;
    } else {
      shopifyRevenue = fbAdSpend / C.mer;
    }

    // ── Inflows (rows 42–44) ────────────────────────────────────────────
    const onlineStore = shopifyRevenue * (1 - C.ppPercent);
    const transferToWC = -(shopifyRevenue * cogsRate);
    const totalInflows = onlineStore + transferToWC;

    // ── Card / loan repayments (rows 50–54) ─────────────────────────────
    const payChase = paymentForCardWithFallback(date, 'chase5718', schedule, cardPaymentsActuals);
    const payAmexPlum = paymentForCardWithFallback(date, 'amexPlum', schedule, cardPaymentsActuals);
    const payAmexBlue = paymentForCardWithFallback(date, 'amexBlue', schedule, cardPaymentsActuals);
    const payShopifyCapital = shopifyRevenue * C.shopifyCapitalRate;
    const payLtLoan = paymentForCardWithFallback(date, 'ltLoan', schedule, cardPaymentsActuals);

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
    const weeksFromRdAnchor = Math.round((dt - parseLocalDate(rdAnchor)) / (7 * 86400000));
    const rd = (weeksFromRdAnchor >= 0 && weeksFromRdAnchor % 4 === 0) ? C.rdMonthlyAmount : 0;
    // Interest: $125 every 4 weeks starting same anchor
    const interestAnchor = '2026-08-31';
    const weeksFromInterest = Math.round((dt - parseLocalDate(interestAnchor)) / (7 * 86400000));
    const interest = (weeksFromInterest >= 0 && weeksFromInterest % 4 === 0) ? C.interestPayment : 0;

    // ── Paydown cadence ─────────────────────────────────────────────────
    // Both ads payable and fulfillment payable pay down every N weeks
    // (default 4) anchored on todayMonday, mirroring the workbook's
    // ~monthly statement cycle. Plaid transaction actuals will override
    // these on past weeks.
    const weeksFromToday = Math.round((dt - parseLocalDate(todayMonday)) / (7 * 86_400_000));
    // First paydown is 1 week after todayMonday (statement cycle closes at the
    // end of the current week, gets paid down the following Monday). Then
    // every paydownEveryNWeeks. Matches the workbook's 5/4 → 6/1 → 6/29 …
    // ads-paid cadence when projection-start = 4/27.
    const isPaydownWeek = !isHistorical && weeksFromToday >= 1 && (weeksFromToday % C.paydownEveryNWeeks === 1);

    // ── Fulfillment payable (rows 28 & 62) ──────────────────────────────
    // Workbook lags accruals by 1 week — this week's payable rolls in
    // PRIOR week's revenue × fulfillment %. Matches statement-cycle
    // reality: shipped this week → invoiced next week.
    let fulfillmentPaid = 0;
    let fulfillmentPayable;
    if (hist) {
      fulfillmentPayable = hist.fulfillmentPayable;
      fulfillmentPaid = isPaydownWeek ? (prev ? prev.fulfillmentPayable : 0) : 0;
    } else {
      fulfillmentPaid = isPaydownWeek ? (prev?.fulfillmentPayable ?? 0) : 0;
      const accrual = (prev?.shopifyRevenue ?? 0) * C.fulfillmentPercent;
      fulfillmentPayable = (prev?.fulfillmentPayable ?? 0) - fulfillmentPaid + accrual + C.fulfillmentAdminWeekly;
    }

    // ── Ads payable (rows 27 & 47) ──────────────────────────────────────
    // Same 1-week lag — this week's payable rolls in PRIOR week's ad
    // spend (matches Meta billing: charged this week, statement closes
    // next week).
    let adsPaid = 0;
    let adsPayable;
    if (hist) {
      adsPayable = hist.adsPayable;
    } else {
      adsPaid = isPaydownWeek ? (prev?.adsPayable ?? 0) : 0;
      adsPayable = (prev?.adsPayable ?? 0) + (prev?.fbAdSpend ?? 0) - adsPaid;
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
      shopifyPayouts = 0; // projection-only — would double-count onlineStore
      sbMain = seed.sbMain ?? (prev?.totalCashOnHand ?? 0) + netCashFlow - transferToWC;
      sbSalesTax = seed.sbSalesTax ?? prev?.sbSalesTax ?? 0;
      sbCorpTax = seed.sbCorpTax ?? prev?.sbCorpTax ?? 0;
      // Shopify Capital repayment is already captured in netCashFlow via
      // payShopifyCapital, so this row is informational only and stays 0
      // for projection (workbook left it blank).
      shopifyCapRepayment = 0;
    } else {
      // Projection rows: collapse cash to a single sbMain bucket. Treating
      // shopifyPayouts as a separate line double-counts with onlineStore
      // (which already feeds netCashFlow → sbMain).
      shopifyPayouts = 0;
      // SB Main = prev Total Cash + Net Cash Flow - Transfer to WC (Excel R12)
      sbMain = (prev?.totalCashOnHand ?? 0) + netCashFlow - transferToWC;
      sbSalesTax = prev?.sbSalesTax ?? 0;
      sbCorpTax = prev?.sbCorpTax ?? 0;
      shopifyCapRepayment = 0;
    }
    const totalCashOnHand = hist
      ? hist.totalCashOnHand ?? (sbMain + (sbSalesTax || 0) + (sbCorpTax || 0) + (shopifyCapRepayment || 0))
      : sbMain + sbSalesTax + sbCorpTax + shopifyCapRepayment;

    // ── Inventory (row 22) ──────────────────────────────────────────────
    const inventory = hist ? hist.inventory : (prev?.inventory ?? 0) + transferToWC;

    // ── Working capital cash (row 23) ───────────────────────────────────
    // Anchor on Plaid live balance when this is "today's Monday" — that's
    // the real-money truth. Historical block wins for past weeks; future
    // weeks roll forward from the prior week (mirroring COGS deduction).
    const workingCapital = isCurrent && seed.workingCapital != null
      ? seed.workingCapital
      : hist
        ? hist.workingCapital
        : (prev?.workingCapital ?? 0) - transferToWC;

    // ── Total assets (row 24) ───────────────────────────────────────────
    // Cash + inventory + working capital. Working capital is the 2465
    // bank account, which IS an asset. (The workbook's pre-Aug formula
    // omits it — that's a workbook bug; the post-Aug formula is right.)
    const totalAssets = totalCashOnHand + inventory + workingCapital;

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
