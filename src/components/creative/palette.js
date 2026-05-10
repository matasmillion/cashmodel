// Central palette for the Creative Engine.
//
// Anchored to the FR brand (Salt / Slate / Sand) but extends with
// the V5 mockup's accent system for status pills, lane chips, and
// outcome states. Imported by every Creative Engine view so colors
// stay consistent and we change them in one place.

export const FR = {
  // Base brand surfaces (same as the rest of the app)
  salt: '#F5F0E8',
  saltLight: '#F8F3EA',
  slate: '#3A3A3A',
  sand: '#EBE5D5',
  sandLight: '#F0E9D7',
  sandDeep: '#C4A97D',
  stone: '#716F70',
  ink: '#1C1915',
  navy: '#1B2741',

  // V5 status accent ramps — used for pills, dots, callouts.
  green: '#2D7D4F',  greenLight: '#E8F5EE',
  red: '#C0392B',    redLight: '#FDEDEB',
  amber: '#C07B2B',  amberLight: '#FEF3E2',
  blue: '#2563EB',   blueLight: '#EFF6FF',
  purple: '#6D28D9', purpleLight: '#F5F3FF',
  teal: '#0D7A5F',   tealLight: '#ECFDF5',
  creatorFg: '#92400E',
  creatorBg: '#FFF6E8',
};

// Lane-level coloring. Drives the chip on every sprint / render card.
export const LANE_TOKEN = {
  ai:              { bg: FR.purpleLight,            fg: FR.purple,    label: 'AI',           stripe: FR.purple },
  high_production: { bg: FR.tealLight,              fg: FR.teal,      label: 'High Prod',    stripe: FR.teal },
  creator:         { bg: FR.creatorBg,              fg: FR.creatorFg, label: 'Creator',      stripe: FR.creatorFg },
  founder:         { bg: 'rgba(27,39,65,0.08)',     fg: FR.navy,      label: 'Founder',      stripe: FR.navy },
};

// Sprint kanban column + card status.
export const SPRINT_STATUS_TOKEN = {
  drafting:    { bg: 'rgba(0,0,0,0.06)', fg: FR.stone, label: 'Drafting' },
  brief_ready: { bg: FR.blueLight,       fg: FR.blue,  label: 'Brief Ready' },
  rendering:   { bg: FR.amberLight,      fg: FR.amber, label: 'Rendering' },
  in_queue:    { bg: FR.purpleLight,     fg: FR.purple, label: 'In Queue' },
  live:        { bg: FR.greenLight,      fg: FR.green, label: 'Live' },
  closed:      { bg: 'rgba(0,0,0,0.06)', fg: FR.stone, label: 'Closed' },
};

export const RENDER_STATUS_TOKEN = {
  pending:    { bg: 'rgba(0,0,0,0.06)', fg: FR.stone, label: 'Pending',    dot: 'grey' },
  processing: { bg: FR.amberLight,      fg: FR.amber, label: 'Rendering',  dot: 'amber' },
  done:       { bg: FR.tealLight,       fg: FR.teal,  label: 'Ready',      dot: 'green' },
  approved:   { bg: FR.greenLight,      fg: FR.green, label: 'Approved',   dot: 'green' },
  rejected:   { bg: FR.redLight,        fg: FR.red,   label: 'Rejected',   dot: 'red' },
};

export const AD_STATUS_TOKEN = {
  paused: { bg: 'rgba(0,0,0,0.06)', fg: FR.stone,  label: 'Paused' },
  active: { bg: FR.greenLight,      fg: FR.green,  label: 'Active' },
  killed: { bg: FR.redLight,        fg: FR.red,    label: 'Killed' },
  scaled: { bg: FR.purpleLight,     fg: FR.purple, label: 'Scaled' },
};

export const OUTCOME_TOKEN = {
  winner:       { bg: FR.greenLight,        fg: FR.green, label: 'Winner' },
  loser:        { bg: FR.redLight,          fg: FR.red,   label: 'Loser' },
  inconclusive: { bg: 'rgba(0,0,0,0.06)',   fg: FR.stone, label: 'Inconclusive' },
};

// Live indicator dot (used in render queue, today view, etc.)
export const DOT_COLOR = {
  green: FR.green,
  amber: FR.amber,
  red: FR.red,
  grey: FR.sandDeep,
};

// Status pill — small inline lozenge used everywhere. Pass one of the
// _TOKEN entries above as `token`.
export function pillStyle(token) {
  return {
    display: 'inline-block',
    background: token.bg,
    color: token.fg,
    fontSize: 10.5,
    letterSpacing: '0.04em',
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 5,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };
}

// Live-style colored dot — pulses if `pulse` is true.
export function dotStyle(color, pulse = false) {
  return {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    animation: pulse ? 'pulseDot 1.5s infinite' : undefined,
  };
}

// One global keyframes block for the pulse — drop into a <style> tag in
// the shell so we don't repeat it.
export const KEYFRAMES = `
@keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:.45} }
@keyframes spin { to { transform: rotate(360deg); } }
`;
