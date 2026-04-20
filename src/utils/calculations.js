import { CURRENT_WEEK_SEED, GA_CASHFLOW_WEEKLY, CREATOR_DEAL } from '../data/seedData';

// ============================================================
// WEEK DATE GENERATOR — current Monday through Dec 31
// ============================================================
export function generateWeekDates() {
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);

  const endOfYear = new Date(today.getFullYear(), 11, 31);
  const dates = [];
  const d = new Date(monday);
  while (d <= endOfYear) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

// ============================================================
// MAIN PROJECTION ENGINE — Revenue Layer Cake + Cash Flow
// ============================================================
export function generateWeeklyProjections(assumptions, seed, pos, adUnits, events, creditCards, loans) {
  const weekDates = generateWeekDates();
  const weeks = [];
  const a = assumptions;

  // Weekly OPEX (use tier 1 for now, escalates with revenue)
  const weeklyOPEX = (a.opexTier1 || 2000) / 4.33;

  for (let i = 0; i < weekDates.length; i++) {
    const prev = i > 0 ? weeks[i - 1] : null;
    const isCurrent = i === 0;
    const date = weekDates[i];
    const isH2 = new Date(date + 'T00:00:00').getMonth() >= 6;

    // ---- ACQUISITION LAYER ----
    // Seed values (from live Shopify / Meta sync, when available) anchor week 0.
    // Future weeks project forward from that anchor using the growth assumption.
    const growthMultiplier = Math.pow(1 + a.weeklyGrowthRate, i);

    const hasSeedAdSpend = typeof seed.adSpend === 'number' && seed.adSpend > 0;
    const baseWeeklyAdSpend = hasSeedAdSpend ? seed.adSpend : a.startingDailyAdSpend * 7;
    const weeklyAdSpend = Math.round(baseWeeklyAdSpend * growthMultiplier);
    const dailyAdSpend = weeklyAdSpend / 7;

    const hasSeedRevenue = typeof seed.revenue === 'number' && seed.revenue > 0;
    const baseWeeklyRevenue = hasSeedRevenue ? seed.revenue : (baseWeeklyAdSpend / a.targetMER);
    const revenue = Math.round(baseWeeklyRevenue * growthMultiplier);
    const orders = Math.round(revenue / a.aov);
    const unitsSold = Math.round(orders * a.unitsPerOrder);

    // ---- RETENTION LAYER (placeholder — needs Shopify cohort data) ----
    // For now: retention = 0 (conservative). Will be populated from cohort API.
    const retentionRevenue = 0;

    // ---- EVENT LAYER ----
    let eventRevenue = 0;
    let eventCM = 0;
    let activeEvents = [];
    if (events) {
      events.forEach(ev => {
        if (ev.weekIndex === i) {
          eventRevenue += ev.estimatedRevenue || 0;
          eventCM += ev.estimatedCM || 0;
          activeEvents.push(ev);
        }
      });
    }

    // ---- TOTAL REVENUE ----
    const totalRevenue = revenue + retentionRevenue + eventRevenue;

    // ---- P&L (Four Quarter Accounting) ----
    const cogs = -Math.round(totalRevenue * a.cogsRate);
    const grossProfit = totalRevenue + cogs;
    const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0;

    // Creative costs — based on ad unit schedule
    let creativeCost = 0;
    if (adUnits && adUnits.length > 0) {
      adUnits.forEach(au => {
        if (au.weekIndex === i) {
          creativeCost += au.totalCost || 0;
        }
      });
    }
    // Default: ~$15/wk creative unless a big batch lands
    if (creativeCost === 0) {
      const creatorVids = 1; // 1 creator deal per 3 weeks avg
      const founderVids = a.founderVidsPerWeek || 3;
      const aiConcepts = a.aiConceptsPerWeek || 7;
      creativeCost = Math.round((i % 3 === 0 ? CREATOR_DEAL.costPerCreative : 0) + (founderVids * 20) + (aiConcepts * 5));
    }

    const contributionMargin = grossProfit - weeklyAdSpend - creativeCost;
    const cmPercent = totalRevenue > 0 ? contributionMargin / totalRevenue : 0;

    // Variable costs (fulfillment, payment processing, shipping — 13.8% of revenue)
    const variableCosts = -Math.round(totalRevenue * a.variablePercent);
    const opex = -Math.round(weeklyOPEX);

    const plNetProfit = contributionMargin + variableCosts + opex;
    const plMargin = totalRevenue > 0 ? plNetProfit / totalRevenue : 0;

    // ---- CASH FLOW ----
    let poPayments = 0;
    if (pos) {
      pos.forEach(po => {
        if (po.payments) {
          po.payments.forEach(pmt => {
            if (pmt.weekIndex === i) poPayments += pmt.amount;
          });
        }
      });
    }

    const taxReserve = 0; // NOL shelter for now
    const weeklyCash = contributionMargin + variableCosts + opex - taxReserve - poPayments;
    const cumulativeCash = isCurrent ? (seed.totalCash || 0) : (prev.cumulativeCash + weeklyCash);

    // ---- INVENTORY ----
    const prevUnits = isCurrent ? (seed.inventoryUnits || 741) : prev.inventoryUnits;
    const inventoryUnits = prevUnits - unitsSold;
    let poUnitsAdded = 0;
    if (pos) {
      pos.forEach(po => {
        if (po.arrivalWeekIndex === i) poUnitsAdded += po.units || 0;
      });
    }
    const inventoryUnitsNet = inventoryUnits + poUnitsAdded;
    const weeksOfInventory = unitsSold > 0 ? parseFloat((inventoryUnitsNet / unitsSold).toFixed(1)) : 99;

    // PO Trigger check
    const needsPO = weeksOfInventory <= (a.poTriggerWeeks || 11);

    // ---- CONTENT & CREATORS ----
    const creatorVideos = i % 3 === 0 ? 3 : 0;
    const founderVideos = a.founderVidsPerWeek || 3;
    const aiConcepts = a.aiConceptsPerWeek || 7;
    const totalConcepts = creatorVideos + founderVideos + aiConcepts;
    const winners = Math.round(totalConcepts * (CREATOR_DEAL.hitRate || 0.10));

    // ---- FREE CASH (ST liabilities) ----
    const stAdsPayable = isCurrent ? (seed.stAdsPayable || 0) : (prev.stAdsPayable + weeklyAdSpend - (i % 4 === 0 ? weeklyAdSpend * 4 : 0));
    const stFulfillmentPayable = isCurrent ? (seed.stFulfillmentPayable || 0) : (prev.stFulfillmentPayable + Math.abs(variableCosts) - (i % 4 === 2 ? Math.abs(variableCosts) * 4 : 0));
    const workingCapital = isCurrent ? (seed.workingCapital || 0) : (prev.workingCapital + Math.abs(variableCosts) * 0.96);
    const stLiabilities = Math.max(0, stAdsPayable) + Math.max(0, stFulfillmentPayable) + workingCapital;
    const freeCash = cumulativeCash - stLiabilities;

    // ---- STATUS ----
    const status = cumulativeCash >= (a.cashBuffer || 500) ? 'OK' : 'LOW';

    weeks.push({
      week: i, date, isCurrent, isActual: isCurrent, status,
      // Revenue Layer Cake
      revenue: totalRevenue,
      acquisitionRevenue: revenue,
      retentionRevenue,
      eventRevenue,
      activeEvents,
      // P&L
      orders, unitsSold,
      cogs, grossProfit, grossMargin,
      weeklyAdSpend, dailyAdSpend: Math.round(dailyAdSpend),
      creativeCost: -creativeCost,
      contributionMargin, cmPercent,
      variableCosts, opex,
      plNetProfit, plMargin,
      // Cash Flow
      taxReserve, poPayments: -poPayments,
      weeklyCash, cumulativeCash,
      totalCash: cumulativeCash,
      // Free Cash
      stAdsPayable, stFulfillmentPayable, workingCapital,
      stLiabilities, freeCash,
      // Inventory
      inventoryUnits: inventoryUnitsNet, weeksOfInventory, needsPO,
      // Content
      creatorVideos, founderVideos, aiConcepts: aiConcepts, totalConcepts, winners,
      // Legacy compat
      inventory: inventoryUnitsNet * a.blendedLanded,
      fbAdSpend: weeklyAdSpend,
      cogsPercent: a.cogsRate,
      onlineStoreInflow: totalRevenue * (1 - a.paymentProcessingPercent),
      transferToWC: 0, totalInflows: totalRevenue * (1 - a.paymentProcessingPercent),
      adsPayable: 0, fulfillmentPayable: 0, creditCardPayments: 0,
      shopifyCapitalPayment: 0, loanInterest: 0, gaExpenses: 0,
      totalOutflows: Math.abs(weeklyAdSpend + creativeCost + variableCosts + opex + poPayments),
      netCashFlow: weeklyCash,
    });
  }

  return weeks;
}

// ============================================================
// AUTO PO SCHEDULE GENERATOR (from Growth Model logic)
// ============================================================
export function generatePOSchedule(projections, assumptions) {
  const a = assumptions;
  const pos = [];
  let lastPOWeek = -a.poCooldownWeeks;

  for (let i = 0; i < projections.length; i++) {
    const w = projections[i];
    if (w.needsPO && (i - lastPOWeek) >= a.poCooldownWeeks) {
      // Calculate PO size to cover poCoversWeeks of demand
      let totalUnitsNeeded = 0;
      for (let j = i; j < Math.min(i + a.poCoversWeeks, projections.length); j++) {
        totalUnitsNeeded += projections[j].unitsSold;
      }
      const fullCost = totalUnitsNeeded * a.blendedLanded;
      const deposit = Math.round(fullCost * a.depositPercent);
      const prodPay = Math.round(fullCost * a.prodPayPercent);
      const net30 = Math.round(fullCost * a.net30Percent);

      const depWeek = i;
      const prodPayWeek = i + a.prodPayWeek;
      const net30Week = i + a.net30PayWeek;
      const arrivalWeek = i + a.leadTime;

      pos.push({
        id: `PO-${String(pos.length + 1).padStart(2, '0')}`,
        orderDate: projections[i]?.date,
        weekIndex: i,
        units: totalUnitsNeeded,
        fullCost: Math.round(fullCost),
        payments: [
          { label: '30% Deposit', amount: deposit, weekIndex: depWeek, date: projections[depWeek]?.date },
          { label: '40% Production', amount: prodPay, weekIndex: prodPayWeek, date: projections[prodPayWeek]?.date },
          { label: '30% Net-30', amount: net30, weekIndex: net30Week, date: projections[net30Week]?.date },
        ],
        arrivalWeekIndex: arrivalWeek,
        arrivalDate: projections[arrivalWeek]?.date,
      });
      lastPOWeek = i;
    }
  }
  return pos;
}

// ============================================================
// UNIT ECONOMICS CALCULATOR
// ============================================================
export function calculateUnitEconomics(product, assumptions) {
  const freightForwarding = product.weight * product.freightPerKg;
  const paymentProcessing = product.price * (assumptions.paymentProcessingPercent || 0.04);
  const shipping = product.shippingLabel + product.pickPack + product.stickersCard;
  const production = product.production || product.unitCost || 0;
  const packaging = product.packaging || 0;
  const cogs = production + packaging + freightForwarding + shipping + paymentProcessing;
  const grossProfit = product.price - cogs;
  const grossMargin = product.price > 0 ? grossProfit / product.price : 0;
  const variableOverhead = product.price * (assumptions.mer + (assumptions.creativePercent || 0.06) + (assumptions.shopifyCapitalRate || 0.06));
  const contributionProfit = grossProfit - variableOverhead;
  const contributionMargin = product.price > 0 ? contributionProfit / product.price : 0;
  const opexPerUnit = product.price * 0.10;
  const operatingProfit = contributionProfit - opexPerUnit;
  const operatingMargin = product.price > 0 ? operatingProfit / product.price : 0;
  return { ...product, freightForwarding, paymentProcessing, shipping, cogs, grossProfit, grossMargin, variableOverhead, contributionProfit, contributionMargin, operatingProfit, operatingMargin };
}

// ============================================================
// FORMATTERS
// ============================================================
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1000000) return (value < 0 ? '(' : '') + '$' + (abs / 1000000).toFixed(1) + 'M' + (value < 0 ? ')' : '');
  if (abs >= 1000) return (value < 0 ? '(' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + (value < 0 ? ')' : '');
  return (value < 0 ? '(' : '') + '$' + abs.toFixed(2) + (value < 0 ? ')' : '');
}

export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return (value * 100).toFixed(1) + '%';
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getMonthFromDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short' });
}
