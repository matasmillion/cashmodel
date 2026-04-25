// Unified lookup for vendors and people across the PLM.
// Aggregates from:
//   1. localStorage mirrors of tech_packs + component_packs (fast path)
//   2. Supabase JSONB projections of data.vendor / data.factory / data.supplier
//      / approval names (covers rows that live in cloud but haven't been
//      opened on this device, so their full data isn't in localStorage yet)
//   3. custom persisted lists of manually-onboarded vendors / people
// New entries added through EditableSelect are written to the custom lists so
// they show up immediately, even before the pack is saved.
//
// Post-migration note: the `data.factory` field name is still written by the
// frozen tech pack builder (renaming it would require editing that builder,
// which is out of scope for Prompt 1). Aggregation reads both the new
// `data.vendor` and legacy `data.factory` so UI labels can drift toward
// "Vendor" without disturbing stored records.

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';

const TECHPACKS_KEY = 'cashmodel_techpacks';
const COMPONENT_PACKS_KEY = 'cashmodel_component_packs';
const CUSTOM_SUPPLIERS_KEY = 'cashmodel_plm_suppliers';
const CUSTOM_PEOPLE_KEY = 'cashmodel_plm_people';

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.error(err); }
}

function addNormalized(set, value) {
  if (!value) return;
  const trimmed = String(value).trim();
  if (trimmed) set.add(trimmed);
}

// ── Vendors ───────────────────────────────────────────────────────────────
// Pulls vendors from:
//   • trim (component) packs — data.supplier + data.materials[].supplier
//   • tech packs — (data.vendor ?? data.factory) + data.{bom,fabrics,
//     trimsAccessories,labelsBranding}[].supplier
//   • Supabase projection so rows not mirrored locally still count
//   • custom persisted list (manually added)
// Legacy read path: `data.factory` is still the field written by the frozen
// tech pack builder, so we pull both the new `data.vendor` and the legacy
// `data.factory` keys to keep every pack's maker surfaced.
export async function listAllSuppliers() {
  const suppliers = new Set();

  readJSON(COMPONENT_PACKS_KEY, []).forEach(p => {
    addNormalized(suppliers, p?.data?.supplier);
    (p?.data?.materials || []).forEach(m => addNormalized(suppliers, m?.supplier));
  });

  const techPackSupplierKeys = ['bom', 'fabrics', 'trimsAccessories', 'labelsBranding'];
  readJSON(TECHPACKS_KEY, []).forEach(p => {
    const d = p?.data || {};
    // Read `vendor` first (new canonical field) with `factory` fallback for
    // records written by the pre-rename tech pack builder.
    addNormalized(suppliers, d.vendor ?? d.factory);
    techPackSupplierKeys.forEach(k => (d[k] || []).forEach(row => addNormalized(suppliers, row?.supplier)));
  });

  readJSON(CUSTOM_SUPPLIERS_KEY, []).forEach(s => addNormalized(suppliers, s));

  // Cloud fallback: covers packs that exist in Supabase but haven't been
  // fetched in full on this device yet. Projections keep the payload small —
  // just the vendor/factory/supplier strings we need, not the whole JSONB blob.
  if (IS_SUPABASE_ENABLED) {
    try {
      const [techRes, compRes] = await Promise.all([
        // Legacy JSONB key `data.factory` still contains the vendor name on
        // existing records. Projecting `data.vendor` first would miss every
        // pre-migration record.
        supabase.from('tech_packs').select('vendor:data->>vendor, factory:data->>factory'),
        supabase.from('component_packs').select('supplier'),
      ]);
      (techRes.data || []).forEach(r => addNormalized(suppliers, r.vendor || r.factory));
      (compRes.data || []).forEach(r => addNormalized(suppliers, r.supplier));
    } catch (err) {
      console.error('listAllSuppliers supabase:', err);
    }
  }

  return [...suppliers].sort((a, b) => a.localeCompare(b));
}

export function addSupplier(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  const current = readJSON(CUSTOM_SUPPLIERS_KEY, []);
  if (!current.includes(trimmed)) {
    current.push(trimmed);
    writeJSON(CUSTOM_SUPPLIERS_KEY, current);
  }
}

// ── People ────────────────────────────────────────────────────────────────
// Designers and approvers used across the PLM. Sourced from both pack
// families' approval name fields, plus an explicit onboarded list. Uses the
// same local-plus-cloud aggregation as listAllSuppliers so people added in
// cloud-only packs still appear in the dropdown on a fresh device.
export async function listAllPeople() {
  const people = new Set();

  readJSON(COMPONENT_PACKS_KEY, []).forEach(p => {
    const d = p?.data || {};
    addNormalized(people, d.designedBy?.name);
    addNormalized(people, d.approvedBy?.name);
    const fa = d.finalApproval || {};
    addNormalized(people, fa.designer?.name);
    addNormalized(people, fa.brandOwner?.name);
    addNormalized(people, fa.factory?.name);
  });

  readJSON(TECHPACKS_KEY, []).forEach(p => {
    const d = p?.data || {};
    addNormalized(people, d.designedBy?.name);
    addNormalized(people, d.approvedBy?.name);
    addNormalized(people, d.factoryConfirmed?.name);
    const fa = d.finalApproval || {};
    addNormalized(people, fa.designer?.name);
    addNormalized(people, fa.brandOwner?.name);
    addNormalized(people, fa.factory?.name);
  });

  readJSON(CUSTOM_PEOPLE_KEY, []).forEach(s => addNormalized(people, s));

  if (IS_SUPABASE_ENABLED) {
    try {
      const [techRes, compRes] = await Promise.all([
        supabase.from('tech_packs').select(
          'designedByName:data->designedBy->>name, approvedByName:data->approvedBy->>name, factoryConfirmedName:data->factoryConfirmed->>name'
        ),
        supabase.from('component_packs').select(
          'designedByName:data->designedBy->>name, approvedByName:data->approvedBy->>name'
        ),
      ]);
      (techRes.data || []).forEach(r => {
        addNormalized(people, r.designedByName);
        addNormalized(people, r.approvedByName);
        addNormalized(people, r.factoryConfirmedName);
      });
      (compRes.data || []).forEach(r => {
        addNormalized(people, r.designedByName);
        addNormalized(people, r.approvedByName);
      });
    } catch (err) {
      console.error('listAllPeople supabase:', err);
    }
  }

  return [...people].sort((a, b) => a.localeCompare(b));
}

export function addPerson(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  const current = readJSON(CUSTOM_PEOPLE_KEY, []);
  if (!current.includes(trimmed)) {
    current.push(trimmed);
    writeJSON(CUSTOM_PEOPLE_KEY, current);
  }
}
