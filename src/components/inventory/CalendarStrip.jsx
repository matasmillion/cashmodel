// Horizontal week-grouped day-cell strip. Reusable across the cockpit
// multi-SKU view (compact mode) and the SKU detail 12-month calendar
// (default mode). Driven entirely by the `mode` prop.
//
// Layout:
//   [W19] [W20] [W21] ...
//   [□□□□□□□] [□□□□□□□] ...
//   ↑  M T W T F S S        ← days flow L→R within each week
//      week column           ← weeks separated by gap, week numbers above
//
// Modes:
//   compact (cockpit):   7px × 13px cells, 0px day gap, 3px week gap, no week numbers
//   default (SKU page):  12px × 12px cells, 1px day gap, 5px week gap, week numbers
//
// Props:
//   days:    DayState[] from utils/coverProjection.projectDailyCover
//            (length = WEEKS × 7, indexed 0…N-1 from today)
//   weeks:   number (default 52)
//   mode:    'compact' | 'default'
//   onCellHover: (e, dayState, date) => void  // for tooltip
//   onCellLeave: () => void
//   showWeekNums: bool

import { INV } from './inventoryTokens';

const STATE_BG = {
  healthy:  INV.good,
  restock:  INV.warn,
  stockout: INV.bad,
  overstock: INV.sea,
};

const MODES = {
  compact: { cell: 7,  rowH: 13, gapDay: 0, gapWeek: 3 },
  default: { cell: 12, rowH: 12, gapDay: 1, gapWeek: 5 },
};

export default function CalendarStrip({
  days,
  weeks = 52,
  mode = 'compact',
  onCellHover,
  onCellLeave,
  showWeekNums = false,
  startDate = null, // Date instance representing day 0 (today)
}) {
  const cfg = MODES[mode] || MODES.compact;
  const today = startDate || new Date();

  // Today is day 0. Render `weeks * 7` cells.
  return (
    <div style={{
      display: 'flex',
      gap: cfg.gapWeek,
    }}>
      {Array.from({ length: weeks }, (_, w) => (
        <WeekColumn
          key={w}
          weekIdx={w}
          days={days}
          cfg={cfg}
          showWeekNum={showWeekNums}
          today={today}
          onCellHover={onCellHover}
          onCellLeave={onCellLeave}
        />
      ))}
    </div>
  );
}

function WeekColumn({ weekIdx, days, cfg, showWeekNum, today, onCellHover, onCellLeave }) {
  // Compute week number of year for the Monday of this week column.
  const monday = new Date(today);
  monday.setDate(monday.getDate() + (weekIdx * 7) - dayOfWeekMonStart(today));
  const weekNum = isoWeekNumber(monday);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {showWeekNum && (
        <div style={{
          fontSize: 9,
          color: 'rgba(58,58,58,0.45)',
          letterSpacing: '0.04em',
          fontFamily: "'SF Mono', monospace",
          textAlign: 'center',
          minHeight: 11,
        }}>
          W{weekNum}
        </div>
      )}
      <div style={{ display: 'flex', gap: cfg.gapDay }}>
        {Array.from({ length: 7 }, (_, d) => {
          const dayIdx = weekIdx * 7 + d;
          const day = days[dayIdx];
          if (!day) {
            return <div key={d} style={{ width: cfg.cell, height: cfg.rowH }} />;
          }

          const date = new Date(today);
          date.setDate(date.getDate() + dayIdx);

          const isToday  = dayIdx === 0;
          const bg = STATE_BG[day.state] || INV.good;

          return (
            <div
              key={d}
              role="button"
              onMouseEnter={(e) => onCellHover && onCellHover(e, day, date)}
              onMouseMove={(e) => onCellHover && onCellHover(e, day, date)}
              onMouseLeave={() => onCellLeave && onCellLeave()}
              style={{
                width: cfg.cell,
                height: cfg.rowH,
                background: bg,
                borderRadius: 1,
                outline: isToday
                  ? `1px solid ${INV.slate}`
                  : day.poArrival
                    ? `1px solid ${INV.sienna}`
                    : 'none',
                outlineOffset: -1,
                cursor: 'default',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Date helpers ───────────────────────────────────────────────────────────

// Days since Monday (Mon=0, Sun=6). JavaScript native getDay() is Sun=0.
function dayOfWeekMonStart(d) {
  const dow = d.getDay();
  return (dow + 6) % 7;
}

function isoWeekNumber(d) {
  const target = new Date(d.getTime());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
