// Classify Plaid depository accounts (Mercury, Chase, etc.) into the buckets
// that map to rows on the 13-week cashflow:
//   operating      → SB Main row (the primary checking account)
//   salesTax       → SB Sales Tax row (state sales tax reserve)
//   corporateTax   → SB Corporate Tax row
//   workingCapital → Working Capital row (PO / inventory float)
//   other          → not mapped to a specific row, summed into operating
//
// Classification is name-based — Mercury account names are user-controlled, so
// we look for keywords. Order matters: more specific keywords first.

// Order matters — the most specific patterns must come first so a name
// like "Sales Tax Reserve" routes to salesTax (not workingCapital).
const PATTERNS = [
  { role: 'salesTax',       test: /\b(sales\s*tax|state\s*tax|nexus)\b/i },
  { role: 'corporateTax',   test: /\b(corp(orate)?\s*tax|federal\s*tax|fed\s*tax|income\s*tax|irs)\b/i },
  { role: 'workingCapital', test: /\b(working\s*capital|wc|po\s*(reserve|fund)|inventory|vendor|supplier|inventory\s*float)\b/i },
  { role: 'fulfillment',    test: /\b(fulfillment|fulfilment|shipping|3pl|warehouse)\b/i },
  // Mercury default sub-account names ("Treasury", "Vault", "Reserve",
  // "Savings", "High Yield") all act as the user's main store of cash
  // unless the name explicitly says otherwise — bucket them as operating
  // so the SB Main row reflects total available cash.
  { role: 'operating',      test: /\b(operating|main|primary|checking|ops|treasury|vault|reserve|holding|savings|high\s*yield|hy)\b/i },
];

// Mask → role overrides. Wins over name-based PATTERNS so a renamed
// Mercury sub-account can't accidentally re-bucket itself.
const DEPOSITORY_MASK_MAP = {
  // Mercury checking (Foreign Resource) — the sole "operating cash"
  // account. sbMain pins to this mask specifically so renamed Treasury /
  // Vault / Savings sub-accounts don't silently sum into it.
  '6848': 'operating',
  // Mercury sub-account that funds 3PL / shipping invoices. Balance is
  // surfaced on the cashflow as the "Mercury Fulfillment (7301)" row.
  '7301': 'fulfillment',
};

// The single Mercury account that backs the "Operating Cash" cashflow row.
// sbMain = balance of this exact account, not a sum of operating-classified
// sub-accounts.
export const OPERATING_MASK = '6848';

export function classifyAccount(nameOrAcc = '') {
  // Accept either a string (legacy) or the account object so mask
  // overrides can win over name-based pattern matching.
  if (typeof nameOrAcc === 'object' && nameOrAcc !== null) {
    if (nameOrAcc.mask && DEPOSITORY_MASK_MAP[nameOrAcc.mask]) {
      return DEPOSITORY_MASK_MAP[nameOrAcc.mask];
    }
    return classifyAccount(nameOrAcc.name || '');
  }
  const name = nameOrAcc;
  for (const p of PATTERNS) {
    if (p.test.test(name)) return p.role;
  }
  return 'other';
}

/**
 * Group Plaid depositoryAccounts into role-keyed buckets.
 * @param {Array<{name,mask,balance,institution}>} accounts
 * @returns {{
 *   operating: number,
 *   salesTax: number,
 *   corporateTax: number,
 *   workingCapital: number,
 *   fulfillment: number,
 *   total: number,
 *   accounts: Array<{role, name, mask, balance, institution}>,
 * }}
 */
export function bucketDepositoryAccounts(accounts = []) {
  const buckets = { operating: 0, salesTax: 0, corporateTax: 0, workingCapital: 0, fulfillment: 0, total: 0 };
  const tagged = accounts.map(a => {
    const role = classifyAccount(a);
    buckets.total += a.balance || 0;
    // Anything we can't classify rolls into operating so cash-on-hand stays correct.
    const target = role === 'other' ? 'operating' : role;
    buckets[target] += a.balance || 0;
    return { ...a, role };
  });
  // Round to 2 dp
  for (const k of Object.keys(buckets)) buckets[k] = Math.round(buckets[k] * 100) / 100;
  return { ...buckets, accounts: tagged };
}

// Mask → seeded credit-card id. Keep in lockstep with seedData CREDIT_CARDS.
const CARD_MASK_MAP = {
  '5718': 'chase-5718',
  '1005': 'amex-blue',
  // Chase 7248 is the active ads card — its balance + pending charges
  // drive the Ads Payable cashflow row alongside Meta's amount-owed.
  '7248': 'chase-7248',
};
export function cardIdFromMask(mask) {
  if (!mask) return null;
  return CARD_MASK_MAP[mask] || null;
}

// Classify Plaid credit-card account → key used by the cashflow engine.
// (chase5718 / chase7248 / amexBlue / amexPlum). Falls back to a name-based
// match if mask isn't recognised — handy for AMEX Plum which has no last-4.
export function classifyCreditAccount({ mask, name = '', subtype = '' }) {
  if (mask && CARD_MASK_MAP[mask]) {
    const id = CARD_MASK_MAP[mask];
    if (id === 'chase-5718') return 'chase5718';
    if (id === 'chase-7248') return 'chase7248';
    if (id === 'amex-blue') return 'amexBlue';
    return null;
  }
  const lc = name.toLowerCase();
  if (lc.includes('plum')) return 'amexPlum';
  if (lc.includes('blue')) return 'amexBlue';
  if (lc.includes('7248')) return 'chase7248';
  if (lc.includes('chase')) return 'chase5718';
  return null;
}
