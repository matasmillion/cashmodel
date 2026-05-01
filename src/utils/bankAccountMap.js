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

const PATTERNS = [
  { role: 'salesTax',       test: /\b(sales\s*tax)\b/i },
  { role: 'corporateTax',   test: /\b(corp(orate)?\s*tax|federal\s*tax|fed\s*tax|income\s*tax)\b/i },
  { role: 'workingCapital', test: /\b(working\s*capital|wc|po\s*(reserve|fund)|inventory)\b/i },
  { role: 'operating',      test: /\b(operating|main|primary|checking|ops)\b/i },
];

export function classifyAccount(name = '') {
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
 *   total: number,
 *   accounts: Array<{role, name, mask, balance, institution}>,
 * }}
 */
export function bucketDepositoryAccounts(accounts = []) {
  const buckets = { operating: 0, salesTax: 0, corporateTax: 0, workingCapital: 0, total: 0 };
  const tagged = accounts.map(a => {
    const role = classifyAccount(a.name);
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
};
export function cardIdFromMask(mask) {
  if (!mask) return null;
  return CARD_MASK_MAP[mask] || null;
}

// Classify Plaid credit-card account → key used by the cashflow engine.
// (chase5718 / amexBlue / amexPlum). Falls back to a name-based match if mask
// isn't recognised — handy for the AMEX Plum which has no last-4 from Plaid.
export function classifyCreditAccount({ mask, name = '', subtype = '' }) {
  if (mask && CARD_MASK_MAP[mask]) {
    const id = CARD_MASK_MAP[mask];
    return id === 'chase-5718' ? 'chase5718' : id === 'amex-blue' ? 'amexBlue' : null;
  }
  const lc = name.toLowerCase();
  if (lc.includes('plum')) return 'amexPlum';
  if (lc.includes('blue')) return 'amexBlue';
  if (lc.includes('chase')) return 'chase5718';
  return null;
}
