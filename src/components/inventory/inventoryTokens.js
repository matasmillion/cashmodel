// Shared visual tokens for the inventory module. Matches
// docs/mockups/inventory-portal.html exactly. Do not deviate.

export const INV = {
  // Surfaces & structure
  slate:  '#3A3A3A',     // primary text, structural lines
  salt:   '#F5F0E8',     // page background
  sand:   '#EBE5D5',     // accent surfaces (filter chips, hover)
  card:   '#FBF7EE',     // warmer card background (NOT pure white)
  stone:  '#716F70',     // secondary text
  soil:   '#9A816B',     // Drop tier label, secondary accent

  // The single "movement" accent — vs-prior deltas, ad-projection,
  // PO arrival markers. Use sparingly.
  sienna: '#D4956A',

  // Calendar / status states (muted)
  good: '#6B8E6B',
  warn: '#C8924A',
  bad:  '#A8543C',
  sea:  '#B5C7D3',       // overstock
};

// Faded slate variants — use for borders, dividers, secondary text.
export const FADE = {
  slate60: 'rgba(58,58,58,0.60)',
  slate10: 'rgba(58,58,58,0.10)',
  slate06: 'rgba(58,58,58,0.06)',
};

// Type families
export const TYPE = {
  serif: "'Cormorant Garamond', Georgia, serif",
  sans:  "'Inter', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
  mono:  "'SF Mono', 'Menlo', ui-monospace, monospace",
};

// Card pattern — memorize.
export const CARD = {
  background: INV.card,
  border: `1px solid ${FADE.slate10}`,
  borderRadius: 4,
  padding: 20,
};

// Eyebrow label pattern.
export const EYEBROW = {
  fontFamily: TYPE.sans,
  fontSize: 10,
  fontWeight: 500,
  color: FADE.slate60,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

// KPI hero number.
export const KPI_VALUE = {
  fontFamily: TYPE.serif,
  fontSize: 32,
  fontWeight: 400,
  color: INV.slate,
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
};

// Section title (Cormorant 20).
export const SECTION_TITLE = {
  fontFamily: TYPE.serif,
  fontSize: 20,
  fontWeight: 400,
  color: INV.slate,
  margin: 0,
};

// Pill — tiny status / tier chip.
export const PILL = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 6px',
  borderRadius: 2,
  fontSize: 9,
  fontFamily: TYPE.sans,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};
