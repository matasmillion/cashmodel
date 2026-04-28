// Historical actuals + projected card-payment schedule, exactly as captured
// in the source workbook (cols D..BI of the "13 Week Cashflow" sheet).
//
// HISTORICAL_WEEKS  → 12 weeks of actual values (Feb 2 → Apr 20, 2026), one
//                     row per week. The cashflow engine uses these verbatim
//                     for any week dated before today's Monday.
//
// CARD_PAYMENT_SCHEDULE → weekly per-card repayment amounts the workbook has
//                     baked in for the full 58-week horizon. Shopify Capital
//                     is excluded because it's computed (= revenue × 6%).
//                     Anything not listed defaults to 0 for that week.

export const HISTORICAL_WEEKS = [
  { date: '2026-02-02', shopifyRevenue: 3219, dailyAdSpend: 120, fbAdSpend: 820, cogsRate: 0.27, shopifyPayouts: 150, sbMain: 4925, sbSalesTax: -150, sbCorpTax: 0, shopifyCapRepayment: 0, inventory: 16940.87, workingCapital: 0, adsPayable: 324, fulfillmentPayable: 1333, chase5718: 0, amexPlum: 734, amexBlue: 17000, shopifyCapital: 17886.86, longTermLoan: 20000 },
  { date: '2026-02-09', shopifyRevenue: 2412, dailyAdSpend: 120, fbAdSpend: 840, cogsRate: 0.27, shopifyPayouts: 240, sbMain: 3273, sbSalesTax: -244, sbCorpTax: 0, shopifyCapRepayment: -15, inventory: 16219, workingCapital: 2441, adsPayable: 1242, fulfillmentPayable: 1723.7, chase5718: 0, amexPlum: 734, amexBlue: 17000, shopifyCapital: 17742.14, longTermLoan: 20000 },
  { date: '2026-02-16', shopifyRevenue: 1905, dailyAdSpend: 120, fbAdSpend: 840, cogsRate: 0.27, shopifyPayouts: 43, sbMain: 1997.4, sbSalesTax: -274, sbCorpTax: 0, shopifyCapRepayment: -55.98, inventory: 15752, workingCapital: 2909, adsPayable: -557, fulfillmentPayable: 747, chase5718: 0, amexPlum: 734, amexBlue: 17000, shopifyCapital: 17623, longTermLoan: 20000 },
  { date: '2026-02-23', shopifyRevenue: 2206, dailyAdSpend: 60, fbAdSpend: 420, cogsRate: 0.27, shopifyPayouts: 286.26, sbMain: 1805, sbSalesTax: -298, sbCorpTax: 0, shopifyCapRepayment: -9.3, inventory: 15386, workingCapital: 3589, adsPayable: 798, fulfillmentPayable: 1117.1, chase5718: 0, amexPlum: 734, amexBlue: 17000, shopifyCapital: 17553.7, longTermLoan: 20000 },
  { date: '2026-03-02', shopifyRevenue: 1702, dailyAdSpend: 79.2, fbAdSpend: 659, cogsRate: 0.27, shopifyPayouts: 198, sbMain: 2370, sbSalesTax: -306, sbCorpTax: -37, shopifyCapRepayment: -76, inventory: 14648, workingCapital: 4297, adsPayable: 595.73, fulfillmentPayable: 1466.72, chase5718: 648, amexPlum: 959.32, amexBlue: 16831, shopifyCapital: 17440, longTermLoan: 20000 },
  { date: '2026-03-09', shopifyRevenue: 1748, dailyAdSpend: 79, fbAdSpend: 575, cogsRate: 0.27, shopifyPayouts: 200, sbMain: 7872, sbSalesTax: -358, sbCorpTax: -37, shopifyCapRepayment: -77.5, inventory: 14110, workingCapital: 4835, adsPayable: 1258, fulfillmentPayable: 1786.42, chase5718: 648, amexPlum: 959.32, amexBlue: 16831, shopifyCapital: 17354, longTermLoan: 20000 },
  { date: '2026-03-16', shopifyRevenue: 1666, dailyAdSpend: 66, fbAdSpend: 460, cogsRate: 0.27, shopifyPayouts: 1400, sbMain: 7963, sbSalesTax: -375, sbCorpTax: -37, shopifyCapRepayment: -25, inventory: 13632, workingCapital: 5363, adsPayable: 1753, fulfillmentPayable: 644.72, chase5718: 648, amexPlum: 812.46, amexBlue: 16831, shopifyCapital: 17284, longTermLoan: 20000 },
  { date: '2026-03-23', shopifyRevenue: 1499, dailyAdSpend: 68.64, fbAdSpend: 480.48, cogsRate: 0.27, shopifyPayouts: 250, sbMain: 10565, sbSalesTax: -422, sbCorpTax: -37, shopifyCapRepayment: -52, inventory: 13079, workingCapital: 5806, adsPayable: 2474, fulfillmentPayable: 960.82, chase5718: 658, amexPlum: 812.46, amexBlue: 16831, shopifyCapital: 17184.04, longTermLoan: 20000 },
  { date: '2026-03-30', shopifyRevenue: 1914, dailyAdSpend: 71.39, fbAdSpend: 514, cogsRate: 0.2825, shopifyPayouts: 262, sbMain: 11709.42, sbSalesTax: -437, sbCorpTax: -37, shopifyCapRepayment: -6.3, inventory: 12726, workingCapital: 6210.73, adsPayable: 3223, fulfillmentPayable: 1499, chase5718: 658, amexPlum: 812.46, amexBlue: 16658, shopifyCapital: 17094.1, longTermLoan: 20000 },
  { date: '2026-04-06', shopifyRevenue: 1425, dailyAdSpend: 74.24, fbAdSpend: 532, cogsRate: 0.27, shopifyPayouts: 900, sbMain: 12273, sbSalesTax: -476, sbCorpTax: -37, shopifyCapRepayment: -33, inventory: 13199, workingCapital: 5886.43, adsPayable: 3622, fulfillmentPayable: 1839.9, chase5718: 658, amexPlum: 2974, amexBlue: 16809, shopifyCapital: 16984, longTermLoan: 20000 },
  { date: '2026-04-13', shopifyRevenue: 1893, dailyAdSpend: 77.21, fbAdSpend: 550, cogsRate: 0.27, shopifyPayouts: 300, sbMain: 9977, sbSalesTax: -523, sbCorpTax: -37, shopifyCapRepayment: -34, inventory: 12798, workingCapital: 6260.43, adsPayable: 2719, fulfillmentPayable: 632.9, chase5718: 658, amexPlum: 2364, amexBlue: 16809, shopifyCapital: 16901, longTermLoan: 20000 },
  { date: '2026-04-20', shopifyRevenue: 1593, dailyAdSpend: 80.3, fbAdSpend: 580, cogsRate: 0.27, shopifyPayouts: 2155, sbMain: 9062, sbSalesTax: -523, sbCorpTax: -37, shopifyCapRepayment: -61, inventory: 12153, workingCapital: 6974.54, adsPayable: 3268, fulfillmentPayable: 971.7, chase5718: 658, amexPlum: 2364, amexBlue: 16809, shopifyCapital: 16787.42, longTermLoan: 20000 },
];

// Per-week card repayments. Numbers come straight from the workbook's
// outflow rows 50..54. Shopify Capital is omitted (recomputed weekly as
// revenue × 6% by the engine).
//
// Format: { date: 'YYYY-MM-DD', chase5718, amexPlum, amexBlue, ltLoan }
export const CARD_PAYMENT_SCHEDULE = [
  // Historical (Feb–Apr 2026)
  { date: '2026-02-02', amexBlue: 173 },
  { date: '2026-03-02', amexBlue: 173 },
  { date: '2026-03-09', amexPlum: 148 },
  { date: '2026-03-30', amexBlue: 173 },
  { date: '2026-04-06', chase5718: 658, amexPlum: 610 },
  // Projection (May 2026 → Mar 2027)
  { date: '2026-05-04', amexPlum: 418 },
  { date: '2026-05-04', amexBlue: 167 },
  { date: '2026-06-01', amexBlue: 173 },
  { date: '2026-06-08', amexPlum: 146 },
  { date: '2026-06-29', amexBlue: 173 },
  { date: '2026-07-27', amexBlue: 173 },
  { date: '2026-08-03', chase5718: 180 },
  { date: '2026-08-24', amexBlue: 175 },
  { date: '2026-08-31', amexBlue: 175 },
  { date: '2026-09-07', amexBlue: 175 },
  { date: '2026-09-07', chase5718: 180 },
  { date: '2026-09-14', amexBlue: 175 },
  { date: '2026-09-21', amexBlue: 175 },
  { date: '2026-09-28', amexBlue: 175 },
  { date: '2026-10-05', amexBlue: 175 },
  { date: '2026-10-05', chase5718: 180 },
  { date: '2026-10-12', amexBlue: 175 },
  { date: '2026-10-19', amexBlue: 175 },
  { date: '2026-10-26', amexBlue: 175 },
  { date: '2026-11-02', amexBlue: 175 },
  { date: '2026-11-02', chase5718: 180 },
  { date: '2026-11-09', amexBlue: 175 },
  { date: '2026-11-16', amexBlue: 175 },
  { date: '2026-11-23', amexBlue: 175 },
  { date: '2026-11-30', amexBlue: 175 },
  { date: '2026-11-30', chase5718: 180 },
  { date: '2026-12-07', amexBlue: 175 },
  { date: '2026-12-14', amexBlue: 175 },
  { date: '2026-12-21', amexBlue: 175 },
  { date: '2026-12-28', amexBlue: 175 },
  { date: '2026-12-28', chase5718: 180 },
  { date: '2027-01-04', amexBlue: 175 },
  { date: '2027-01-11', amexBlue: 175 },
  { date: '2027-01-18', amexBlue: 175 },
  { date: '2027-01-25', amexBlue: 175 },
  { date: '2027-01-25', chase5718: 180 },
  { date: '2027-02-01', amexBlue: 175 },
  { date: '2027-02-08', amexBlue: 175 },
  { date: '2027-02-15', amexBlue: 175 },
  { date: '2027-02-22', amexBlue: 175 },
  { date: '2027-02-22', chase5718: 180 },
  { date: '2027-03-01', amexBlue: 175 },
  { date: '2027-03-08', amexBlue: 175 },
];

export const CASHFLOW_HORIZON_START = '2026-02-02';
export const CASHFLOW_HORIZON_WEEKS = 58;
