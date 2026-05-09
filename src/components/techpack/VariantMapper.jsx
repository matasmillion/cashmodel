// VariantMapper — one-time backfill UI for operator review of auto-fuzzy
// variant mappings. Shows every mapping where source='auto-fuzzy' and
// confidence < 0.95 so the operator can confirm or reject them.
//
// Accessible at #product/library/variant-mapping.
// Plumbing-only: minimal visual treatment, brand palette, 4px cards.

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, RefreshCw, GitMerge } from 'lucide-react';
import { FR } from './techPackConstants';
import {
  listMappings,
  updateMapping,
  archiveMapping,
} from '../../utils/variantMappingStore';

// ── Styles ────────────────────────────────────────────────────────────────

const S = {
  page: {
    padding: '0 0 40px',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 22,
    fontWeight: 400,
    color: FR.slate,
    margin: 0,
  },
  count: {
    fontSize: 11,
    color: FR.stone,
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  card: {
    background: '#FBF7EE',
    border: `1px solid rgba(58,58,58,0.10)`,
    borderRadius: 4,
    padding: '14px 18px',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 10,
    color: FR.stone,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    marginBottom: 3,
    fontWeight: 500,
  },
  value: {
    fontSize: 12,
    color: FR.slate,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mono: {
    fontFamily: "'SF Mono', 'Menlo', monospace",
    fontSize: 11,
    color: FR.slate,
  },
  confidence: (pct) => ({
    fontSize: 11,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: pct >= 0.80 ? '#6B8E6B' : pct >= 0.60 ? '#C8924A' : '#A8543C',
    fontWeight: 600,
  }),
  actions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  btn: (variant) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 12px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    border: 'none',
    ...(variant === 'confirm'
      ? { background: FR.slate, color: FR.salt }
      : { background: 'transparent', color: '#A8543C', border: `1px solid rgba(168,84,60,0.35)` }),
  }),
  empty: {
    padding: '48px 0',
    textAlign: 'center',
    color: FR.stone,
    fontSize: 13,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  divider: {
    width: 1,
    height: 36,
    background: `rgba(58,58,58,0.10)`,
    flexShrink: 0,
  },
};

// ── Component ─────────────────────────────────────────────────────────────

export default function VariantMapper() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listMappings({});
      const needsReview = all.filter(
        m => m.source === 'auto-fuzzy' && m.confidence < 0.95,
      );
      setRows(needsReview);
    } catch (err) {
      console.error('VariantMapper load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConfirm(id) {
    setBusy(prev => new Set(prev).add(id));
    try {
      await updateMapping(id, { source: 'manual', confidence: 1 }, { reason: 'confirmed by operator' });
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('VariantMapper confirm:', err);
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function handleReject(id) {
    setBusy(prev => new Set(prev).add(id));
    try {
      await archiveMapping(id, { reason: 'rejected by operator — needs manual match' });
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('VariantMapper reject:', err);
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <GitMerge size={16} color={FR.stone} />
        <h2 style={S.title}>Variant Mapping Review</h2>
        {!loading && (
          <span style={S.count}>
            {rows.length === 0 ? 'All clear' : `${rows.length} pending`}
          </span>
        )}
        <button
          onClick={load}
          title="Refresh"
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: FR.stone, display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading && (
        <p style={S.empty}>Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <p style={S.empty}>
          No fuzzy-match mappings need review. Every variant is confirmed or manually mapped.
        </p>
      )}

      {!loading && rows.map(m => {
        const options = m.variant_options || {};
        const optStr  = Object.entries(options).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
        const isBusy  = busy.has(m.id);

        return (
          <div key={m.id} style={{ ...S.card, opacity: isBusy ? 0.5 : 1 }}>
            <div style={S.col}>
              <div style={S.label}>PLM style</div>
              <div style={S.value}>{m.style_id || '—'}</div>
              <div style={{ ...S.mono, marginTop: 2 }}>{optStr}</div>
            </div>

            <div style={S.divider} />

            <div style={S.col}>
              <div style={S.label}>Shopify variant</div>
              <div style={{ ...S.mono }}>{m.shopify_sku || '—'}</div>
              <div style={{ ...S.value, fontSize: 10, color: FR.stone, marginTop: 2 }}>
                {(m.shopify_variant_gid || '').split('/').pop()}
              </div>
            </div>

            <div style={S.divider} />

            <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 52 }}>
              <div style={S.label}>Confidence</div>
              <div style={S.confidence(m.confidence || 0)}>
                {Math.round((m.confidence || 0) * 100)}%
              </div>
            </div>

            <div style={S.actions}>
              <button
                disabled={isBusy}
                onClick={() => handleConfirm(m.id)}
                style={S.btn('confirm')}
                title="Confirm this match — marks as manually verified"
              >
                <CheckCircle size={12} /> Confirm
              </button>
              <button
                disabled={isBusy}
                onClick={() => handleReject(m.id)}
                style={S.btn('reject')}
                title="Reject — archives this mapping for manual re-entry"
              >
                <XCircle size={12} /> Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
