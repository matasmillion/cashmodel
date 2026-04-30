// PLM data backup — local "Download everything as JSON" safety net.
//
// The 6 phases of the asset-storage migration prevent the most common
// lost-work failure modes (silent save failures, accidental delete), but
// they don't protect against:
//   • a user mass-deleting + emptying Trash on purpose
//   • a Supabase outage / account suspension
//   • a database migration that goes sideways
//
// This utility reads every PLM table the app touches, dumps it as one
// JSON file, and downloads it. Image bytes are NOT included (paths only)
// because that would inflate the file 100x — Supabase Storage replicates
// objects across multiple availability zones automatically, so the bytes
// are independently durable.
//
// Restoration: there's no automatic restore yet. The JSON is a record;
// to restore a row, you'd insert it back via the SQL editor or rebuild
// it via the app.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { downloadBlob } from './downloadBlob';

// Tables that carry organization_id — the cloud-side query filters on it.
const ORG_TABLES = [
  'tech_packs',
  'component_packs',
  'fabrics',
  'patterns',
  'treatments',
  'embellishments',
  'colors',
  'vendors',
  'purchase_orders',
  'bom_snapshots',
  'atom_usage',
  'drift_logs',
];

// localStorage keys for tables we mirror locally — used as fallback if
// the cloud read fails (auth race, network blip, RLS hiccup) so a backup
// is still useful even when you can't reach Supabase.
const LOCAL_FALLBACK_KEYS = {
  tech_packs:      'cashmodel_techpacks',
  component_packs: 'cashmodel_component_packs',
  fabrics:         'cashmodel_fabrics',
  patterns:        'cashmodel_patterns',
  treatments:      'cashmodel_treatments',
  embellishments:  'cashmodel_embellishments',
  colors:          'cashmodel_fr_colors',
  vendors:         'cashmodel_vendors',
};

function readLocalFallback(table) {
  const key = LOCAL_FALLBACK_KEYS[table];
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch every PLM row the org owns and bundle into a single JSON object.
 * Returns { result, blob, json }. When `download` is true (default), also
 * triggers a browser download of the JSON file.
 */
export async function exportAllPlmData({ download = true } = {}) {
  const now = new Date();
  const orgId = getCurrentOrgIdSync();
  const supabase = IS_SUPABASE_ENABLED ? await getAuthedSupabase() : null;

  const result = {
    schema_version: 1,
    exported_at: now.toISOString(),
    org_id: orgId || null,
    source: (supabase && orgId) ? 'supabase' : 'localStorage',
    tables: {},
    counts: {},
    errors: {},
  };

  for (const table of ORG_TABLES) {
    let rows = null;
    if (supabase && orgId) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('organization_id', orgId);
      if (error) {
        result.errors[table] = error.message;
      } else {
        rows = data || [];
      }
    }
    if (rows === null) {
      // Fall through to localStorage for tables that have a mirror.
      // For cloud-only tables (purchase_orders, bom_snapshots, etc.)
      // we get an empty array — better than failing the whole export.
      rows = readLocalFallback(table);
    }
    result.tables[table] = rows;
    result.counts[table] = rows.length;
  }

  const json = JSON.stringify(result, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  if (download) {
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await downloadBlob(blob, `plm-backup-${stamp}.json`);
  }

  return { result, blob, json };
}

// Total row count across every table — handy for the backup-button
// label so the user sees "Back up 1,247 rows" rather than a blind action.
export async function getPlmRowCount() {
  const orgId = getCurrentOrgIdSync();
  const supabase = IS_SUPABASE_ENABLED ? await getAuthedSupabase() : null;
  if (!supabase || !orgId) {
    let n = 0;
    for (const table of ORG_TABLES) n += readLocalFallback(table).length;
    return n;
  }
  let total = 0;
  for (const table of ORG_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (!error && typeof count === 'number') total += count;
  }
  return total;
}

// Expose on window so power-users can trigger the backup from the
// browser console without needing the UI button:
//   await window.plmBackup()
if (typeof window !== 'undefined') {
  window.plmBackup = exportAllPlmData;
  window.plmRowCount = getPlmRowCount;
}
