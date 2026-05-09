// Modular assumptions — 4-cell horizontal strip per spec §6A.
//
// Cells:
//   1. Planned daily ad spend (editable input)
//   2. Planned MER            (editable input)
//   3. Planned daily revenue  (derived = spend × MER)
//   4. Demand lift applied    (derived = planned_rev / trailing_rev)
//
// Each cell shows a "Last 7d" anchor under its value.
//
// On change → persists to forecastAssumptionsStore + dispatches the new
// liftMultiplier into state.assumptions so cockpit / urgent / OTB pick it up.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  readForecastAssumptions,
  writeForecastAssumptions,
  deriveForecast,
} from '../../utils/forecastAssumptionsStore';
import { INV, FADE, TYPE } from './inventoryTokens';

export default function AssumptionsStrip() {
  const { state, dispatch } = useApp();
  const [vals, setVals] = useState(() => readForecastAssumptions());

  // Trailing 7d numbers come from the cashflow seed (current weekly totals
  // populated by Shopify auto-sync) divided by 7.
  const trailing7d = useMemo(() => ({
    dailyAdSpend: (state.seed?.adSpend || 0) / 7,
    dailyRevenue: (state.seed?.revenue || 0) / 7,
    mer:          state.seed?.adSpend > 0 ? state.seed.revenue / state.seed.adSpend : null,
  }), [state.seed]);

  const derived = useMemo(
    () => deriveForecast({
      plannedDailyAdSpend: vals.plannedDailyAdSpend,
      plannedMER:          vals.plannedMER,
      trailing7dDailyRevenue: trailing7d.dailyRevenue,
    }),
    [vals, trailing7d.dailyRevenue],
  );

  // Push lift into the global assumptions whenever derived changes so
  // every consumer of state.assumptions.liftMultiplier sees the updated
  // value.
  useEffect(() => {
    if (derived.liftMultiplier == null) return;
    if (state.assumptions?.liftMultiplier === derived.liftMultiplier) return;
    dispatch({
      type: 'UPDATE_ASSUMPTIONS',
      payload: { liftMultiplier: derived.liftMultiplier },
    });
  }, [derived.liftMultiplier, dispatch, state.assumptions?.liftMultiplier]);

  function commit(patch) {
    const next = writeForecastAssumptions(patch);
    setVals(next);
  }

  return (
    <div style={{
      background: INV.card,
      border: `1px solid ${FADE.slate10}`,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
      }}>
        <Cell
          eyebrow="Planned daily ad spend"
          tag="EDIT"
          value={vals.plannedDailyAdSpend}
          onChange={v => commit({ plannedDailyAdSpend: parseMoney(v) })}
          unit="/d"
          prefix="$"
          format="money"
          anchor={`Last 7d $${formatNum(trailing7d.dailyAdSpend, 0)}`}
        />
        <Cell
          eyebrow="Planned MER"
          tag="EDIT"
          value={vals.plannedMER}
          onChange={v => commit({ plannedMER: parseFloat(v) || 0 })}
          unit="×"
          format="x"
          anchor={`Last 7d ${trailing7d.mer != null ? trailing7d.mer.toFixed(1) + '×' : '—'}`}
        />
        <Cell
          eyebrow="Planned daily revenue"
          tag="DERIVED"
          value={derived.plannedDailyRevenue}
          unit="/d"
          prefix="$"
          format="money"
          locked
          anchor={`Spend × MER · last 7d $${formatNum(trailing7d.dailyRevenue, 0)}`}
        />
        <Cell
          eyebrow="Demand lift applied"
          tag="APPLIED"
          value={derived.liftMultiplier}
          unit="×"
          format="x"
          locked
          accent
          imply="Drives FWOS · chase qty · OTB"
        />
      </div>
    </div>
  );
}

// ── Cell ─────────────────────────────────────────────────────────────────

function Cell({ eyebrow, tag, value, onChange, unit, prefix, format, locked, accent, anchor, imply }) {
  return (
    <div style={{
      padding: '16px 20px',
      borderRight: `1px solid ${FADE.slate06}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      background: accent ? 'rgba(212,149,106,0.04)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: TYPE.sans,
          fontSize: 10,
          fontWeight: 500,
          color: accent ? INV.sienna : FADE.slate60,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          {eyebrow}
        </span>
        <span style={{
          fontSize: 8,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          padding: '1px 5px',
          border: `1px solid ${accent ? INV.sienna : FADE.slate10}`,
          borderRadius: 2,
          color: accent ? INV.sienna : FADE.slate60,
          fontFamily: TYPE.sans,
        }}>
          {tag}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {prefix && <span style={{
          fontFamily: TYPE.mono,
          fontSize: 22,
          color: FADE.slate60,
        }}>{prefix}</span>}

        {locked ? (
          <span style={{
            fontFamily: TYPE.mono,
            fontSize: 22,
            color: accent ? INV.sienna : INV.slate,
            fontVariantNumeric: 'tabular-nums',
            padding: '2px 0',
          }}>
            {formatValue(value, format)}
          </span>
        ) : (
          <input
            value={formatValue(value, format)}
            onChange={(e) => onChange(e.target.value)}
            style={{
              fontFamily: TYPE.mono,
              fontSize: 22,
              color: INV.slate,
              border: 0,
              borderBottom: `1px dashed ${FADE.slate10}`,
              background: 'transparent',
              padding: '2px 0',
              width: 110,
              outline: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
            onFocus={(e) => e.target.style.borderBottomColor = INV.slate}
            onBlur={(e) => e.target.style.borderBottomColor = FADE.slate10}
          />
        )}

        {unit && <span style={{
          fontSize: 11,
          color: FADE.slate60,
          fontFamily: TYPE.sans,
        }}>{unit}</span>}
      </div>

      {anchor && (
        <div style={{
          fontSize: 11,
          color: FADE.slate60,
          fontFamily: TYPE.sans,
        }}>
          {anchor}
        </div>
      )}
      {imply && (
        <div style={{
          fontSize: 11,
          color: INV.sienna,
          marginTop: 2,
          fontFamily: TYPE.sans,
        }}>
          {imply}
        </div>
      )}
    </div>
  );
}

// ── Format helpers ───────────────────────────────────────────────────────

function formatValue(v, kind) {
  if (v == null || isNaN(v)) return '0';
  if (kind === 'money') return formatNum(v, 0);
  if (kind === 'x')     return Number(v).toFixed(2);
  return String(v);
}

function formatNum(n, digits = 0) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function parseMoney(s) {
  return Number(String(s).replace(/[^0-9.-]/g, '')) || 0;
}
