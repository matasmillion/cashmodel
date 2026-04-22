// Unified lookup for suppliers and people across the PLM.
// Scans dual-written localStorage for both tech_packs and component_packs so
// every supplier dropdown (on tech packs, trim packs, BOM rows) sees the same
// aggregate list, and every person dropdown (Designed By / Approved By / final
// approval names) shares one pool. New entries added through EditableSelect
// are persisted to dedicated local keys so they survive even before a pack is
// saved with that supplier/person.

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

// ── Suppliers ──────────────────────────────────────────────────────────────
// Pulls suppliers from:
//   • trim (component) packs — data.supplier + data.materials[].supplier
//   • tech packs — data.{bom,fabrics,trimsAccessories,labelsBranding}[].supplier
//   • custom persisted list (manually added)
export function listAllSuppliers() {
  const suppliers = new Set();

  readJSON(COMPONENT_PACKS_KEY, []).forEach(p => {
    addNormalized(suppliers, p?.data?.supplier);
    (p?.data?.materials || []).forEach(m => addNormalized(suppliers, m?.supplier));
  });

  const techPackSupplierKeys = ['bom', 'fabrics', 'trimsAccessories', 'labelsBranding'];
  readJSON(TECHPACKS_KEY, []).forEach(p => {
    const d = p?.data || {};
    // data.factory is the tech pack's top-level Cover & Identity supplier —
    // same pool as BOM/fabric/trim row suppliers.
    addNormalized(suppliers, d.factory);
    techPackSupplierKeys.forEach(k => (d[k] || []).forEach(row => addNormalized(suppliers, row?.supplier)));
  });

  readJSON(CUSTOM_SUPPLIERS_KEY, []).forEach(s => addNormalized(suppliers, s));

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
// families' approval name fields, plus an explicit onboarded list.
export function listAllPeople() {
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
