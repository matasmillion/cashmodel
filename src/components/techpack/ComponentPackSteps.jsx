// Trim Pack wizard step panels. 7 pages total:
//   1. Overview        — lifecycle (revisions, samples, final approval)
//   2. Design          — 9:16 sketch + reference + render
//   3. Materials       — 3 material cards
//   4. Construction    — 16:9 measurement diagram + 3 callouts
//   5. Embellishments  — colorways, artwork, file attachments
//   6. Treatment       — 3 finish cards (image + text)
//   7. Quality Control — 3 QC focus cards (image + text)

import { STATUSES, COMPONENT_TYPES, APPROVAL_STATUSES, SAMPLE_TYPES, SAMPLE_VERDICTS, MATERIAL_FINISHES } from './componentPackConstants';
import { FR, FR_COLOR_OPTIONS } from './techPackConstants';
import { Input, Select, Row, SectionTitle, AspectPhoto, ASPECTS, EditableSelect, ArrayTable, FRColorCell, labelStyle, inputBase } from './TechPackPrimitives';
import { addSupplier } from '../../utils/plmDirectory';
import { getFRColor, updateFRColor } from '../../utils/colorLibrary';
import { setPLMHash } from '../../utils/plmRouting';
import { useState, useRef, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Plus, Download, Eye, EyeOff } from 'lucide-react';
import { downloadBlob } from '../../utils/downloadBlob';

const TRIMPACK_TEMPLATE_FILENAME = 'Trimpack Template.ai';
async function handleDownloadTrimpackTemplate() {
  const url = `${import.meta.env.BASE_URL}${encodeURIComponent(TRIMPACK_TEMPLATE_FILENAME)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Template fetch failed: ${res.status}`);
  const blob = await res.blob();
  await downloadBlob(blob, TRIMPACK_TEMPLATE_FILENAME);
}

// Toggle button used in the top-right of every modular card (material,
// callout, colorway, treatment, QC point, artwork slot). Clicking hides
// the item from the A4 live preview and the downloaded PDF / SVG, but
// keeps the data intact so un-hiding restores everything.
function HideToggle({ hidden, onClick }) {
  return (
    <button type="button"
      onClick={onClick}
      title={hidden ? 'Show in preview & export' : 'Hide from preview & export'}
      aria-label={hidden ? 'Show item in export' : 'Hide item from export'}
      style={{ background: 'none', border: 'none', color: hidden ? '#C0392B' : FR.stone, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}

// Visual styling overlay applied to a card in the builder when it's hidden.
function hiddenCardStyle(hidden) {
  if (!hidden) return {};
  return { opacity: 0.55, borderStyle: 'dashed', background: 'rgba(192,57,43,0.04)' };
}

// ── Approval sign-off card ──────────────────────────────────────────────────
// Name is an editable dropdown (populated from plmDirectory.listAllPeople),
// Signature is a plain text input, Date is read-only and stamped by the
// Confirm button. Factory uses `dateChop` to stay aligned with traditional
// factory chop sign-off conventions (same as on tech packs).
function ApprovalSlot({ role, title, value, onUpdate, onConfirm, onUnconfirm, people = [], onAddPerson }) {
  const dateKey = role === 'factory' ? 'dateChop' : 'date';
  const v = value || { name: '', signature: '', [dateKey]: '' };
  const date = v[dateKey] || '';
  const confirmed = Boolean(date);
  const update = (k, val) => onUpdate(role, { ...v, [k]: val });

  return (
    <div style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: FR.soil, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>{title}</div>

      <div>
        <label style={labelStyle}>Name</label>
        <EditableSelect
          value={v.name}
          onChange={val => update('name', val)}
          options={people}
          onAddOption={onAddPerson}
          placeholder="Add a new person…" />
      </div>

      <div>
        <label style={labelStyle}>Signature</label>
        <input value={v.signature || ''} onChange={e => update('signature', e.target.value)}
          placeholder="Typed signature" style={inputBase} />
      </div>

      <div>
        <label style={labelStyle}>{role === 'factory' ? 'Date / Chop' : 'Date'}</label>
        <input readOnly value={date}
          style={{ ...inputBase, background: FR.salt, color: FR.stone, cursor: 'not-allowed' }} />
      </div>

      <button onClick={() => (confirmed ? onUnconfirm(role) : onConfirm(role))}
        disabled={!confirmed && !v.name}
        style={{
          marginTop: 4,
          padding: '6px 10px',
          background: confirmed ? 'transparent' : ((!v.name) ? FR.sand : FR.slate),
          color: confirmed ? FR.slate : FR.salt,
          border: confirmed ? `1px solid ${FR.slate}` : 'none',
          borderRadius: 3, fontSize: 11, fontWeight: 600,
          cursor: (!confirmed && !v.name) ? 'not-allowed' : 'pointer',
        }}>
        {confirmed ? 'Unconfirm' : 'Confirm'}
      </button>
    </div>
  );
}

// ── Sample log row ─────────────────────────────────────────────────────────
// Inline version of the Tech Pack SamplePanel for use on the trim Overview.
function SampleRow({ sample, idx, onUpdate, onRemove }) {
  const icon = sample.verdict === 'Approved' ? <CheckCircle size={11} style={{ color: '#4CAF7D' }} />
             : sample.verdict === 'Rejected' ? <XCircle size={11} style={{ color: '#C0392B' }} />
             : <Clock size={11} style={{ color: FR.stone }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 4, background: FR.white, fontSize: 11 }}>
      {icon}
      <span style={{ fontWeight: 600, color: FR.slate, minWidth: 120 }}>{sample.type}</span>
      <span style={{ color: FR.stone, minWidth: 90 }}>{sample.date || '—'}</span>
      <span style={{ color: FR.stone, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sample.courier ? `via ${sample.courier}` : ''} {sample.trackingNumber ? `· ${sample.trackingNumber}` : ''}
      </span>
      <select value={sample.verdict} onChange={e => onUpdate(idx, { ...sample, verdict: e.target.value })}
        style={{ fontSize: 10, padding: '2px 4px', border: `1px solid ${FR.sand}`, borderRadius: 3, color: FR.slate, background: FR.white }}>
        {SAMPLE_VERDICTS.map(v => <option key={v}>{v}</option>)}
      </select>
      <button onClick={() => onRemove(idx)}
        style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 13, padding: 0 }}>×</button>
    </div>
  );
}

function SampleLog({ samples, onAdd, onUpdate, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ type: 'Proto', date: '', courier: '', trackingNumber: '', verdict: 'Pending', notes: '' });

  const commit = () => {
    if (!draft.type) return;
    onAdd({ ...draft, id: Date.now().toString(), createdAt: new Date().toISOString() });
    setDraft({ type: 'Proto', date: '', courier: '', trackingNumber: '', verdict: 'Pending', notes: '' });
    setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(samples || []).length === 0 && !adding && (
        <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic', padding: '6px 2px' }}>
          No samples logged yet. Log Proto / Fit / SMS / PP / TOP iterations as the vendor delivers them.
        </div>
      )}

      {(samples || []).map((s, i) => (
        <SampleRow key={s.id || i} sample={s} idx={i} onUpdate={onUpdate} onRemove={onRemove} />
      ))}

      {adding && (
        <div style={{ padding: 10, border: `1px dashed ${FR.soil}`, borderRadius: 4, background: FR.salt, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto', gap: 6, alignItems: 'center' }}>
          <select value={draft.type} onChange={e => setDraft(p => ({ ...p, type: e.target.value }))}
            style={{ fontSize: 11, padding: 5, border: `1px solid ${FR.sand}`, borderRadius: 3 }}>
            {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <input type="date" value={draft.date} onChange={e => setDraft(p => ({ ...p, date: e.target.value }))}
            style={{ fontSize: 11, padding: 5, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
          <input value={draft.courier} onChange={e => setDraft(p => ({ ...p, courier: e.target.value }))}
            placeholder="Courier" style={{ fontSize: 11, padding: 5, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
          <input value={draft.trackingNumber} onChange={e => setDraft(p => ({ ...p, trackingNumber: e.target.value }))}
            placeholder="Tracking #" style={{ fontSize: 11, padding: 5, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
          <select value={draft.verdict} onChange={e => setDraft(p => ({ ...p, verdict: e.target.value }))}
            style={{ fontSize: 11, padding: 5, border: `1px solid ${FR.sand}`, borderRadius: 3 }}>
            {SAMPLE_VERDICTS.map(v => <option key={v}>{v}</option>)}
          </select>
          <input value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notes" style={{ fontSize: 11, padding: 5, border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={commit}
              style={{ fontSize: 11, padding: '5px 10px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setAdding(false)}
              style={{ fontSize: 11, padding: '5px 10px', background: 'none', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {!adding && (
        <button onClick={() => setAdding(true)}
          style={{ alignSelf: 'flex-start', marginTop: 4, padding: '5px 12px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.soil, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={11} /> Log sample
        </button>
      )}
    </div>
  );
}

export function StepCover({
  data, set, images, onUpload, onRemove,
  existingSuppliers = [],
}) {
  const revisionCount = (data.revisions || []).length;
  const derivedRevision = `V${revisionCount + 1}.0`;

  // Revision History — editable table synced with the same array that the
  // snapshot system appends to. Rows without a rev number come from manual
  // edits; rows like "V1.0" come from automated snapshots.
  const seedRow = () => ({ rev: '1.0', date: data.dateCreated || '', changedBy: '', description: 'Initial release', approvedBy: '' });
  const revRows = data.revisions && data.revisions.length ? data.revisions : [seedRow()];
  const updateRev = (i, k, v) => set('revisions', revRows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRev = () => set('revisions', [...revRows, { rev: '', date: '', changedBy: '', description: '', approvedBy: '' }]);
  const removeRev = (i) => set('revisions', revRows.filter((_, idx) => idx !== i));

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Overview</SectionTitle>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '9px 14px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
        <div style={{ flex: 1, fontSize: 11, color: FR.stone }}>
          <strong style={{ color: FR.slate, fontWeight: 600 }}>Working files template</strong> — pre-cropped slots and aspect ratios for every image in this trim pack.
        </div>
        <button type="button"
          aria-label="Download trim pack template (Illustrator .ai file)"
          onClick={() => { handleDownloadTrimpackTemplate().catch(err => { console.error(err); alert('Template download failed.'); }); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Download size={11} /> Trim Pack Template (.ai)
        </button>
      </div>

      <div style={{ maxWidth: 320, marginBottom: 4 }}>
        <AspectPhoto label="Trim Photo" slotKey="component-cover" aspect={ASPECTS.LANDSCAPE_3_2} images={images} onUpload={onUpload} onRemove={onRemove} />
      </div>

      <Row cols="1fr 1fr 1fr">
        <Input label="Trim Name" value={data.componentName} onChange={v => set('componentName', v)} placeholder="e.g. Main Label — Woven" />
        <Select label="Trim Type" value={data.componentType} onChange={v => set('componentType', v)} options={COMPONENT_TYPES} />
        <Input label="Season" value={data.season} onChange={v => set('season', v)} placeholder="SS26 / FW26 / Core" />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <EditableSelect
          label="Vendor"
          value={data.supplier}
          onChange={v => set('supplier', v)}
          options={existingSuppliers}
          onAddOption={addSupplier}
          placeholder="Add a new vendor…" />
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Date Last Updated</label>
          <input readOnly value={data.dateCreated || ''}
            style={{ ...inputBase, background: FR.salt, color: FR.stone, cursor: 'not-allowed' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Revision (auto)</label>
          <input value={derivedRevision} readOnly style={{ ...inputBase, background: FR.salt, color: FR.stone, cursor: 'not-allowed' }} />
        </div>
      </Row>

      <Row cols="1fr 1fr 1fr">
        <Input label="Colorways" value={data.colorways} onChange={v => set('colorways', v)} placeholder="e.g. Black, Natural, Slate" />
        <Input label="Target Unit Cost ($)" value={data.targetUnitCost} onChange={v => set('targetUnitCost', v)} placeholder="0.85" />
        <Input label="MOQ" value={data.moq} onChange={v => set('moq', v)} placeholder="1000" />
      </Row>

      <Row>
        <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
        <div />
      </Row>

      {/* Revision history — iteration log of snapshots + manual entries */}
      <div style={{ marginTop: 20, marginBottom: 18 }}>
        <label style={sectionLabel}>Revision History</label>
        <ArrayTable
          headers={[
            { key: 'rev',         label: 'Rev #',                  placeholder: '1.0' },
            { key: 'date',        label: 'Date',                   placeholder: 'YYYY-MM-DD' },
            { key: 'changedBy',   label: 'Changed By',             placeholder: 'Name' },
            { key: 'description', label: 'Description of Change',  placeholder: 'Initial release' },
            { key: 'approvedBy',  label: 'Approved By',            placeholder: 'Name' },
          ]}
          rows={revRows} onUpdate={updateRev} onAdd={addRev} onRemove={removeRev} />
      </div>

      <p style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>
        Samples, approvals, and the final download live on the last page (Samples &amp; Approval).
      </p>
    </div>
  );
}

// ── Page 8: Samples &amp; Approval ───────────────────────────────────────────
// Final internal page — sits after the deliverable content so factories see
// the spec first and never the asset-versioning / sign-off machinery.
// Contains the sample lifecycle log (Proto / Fit / SMS / PP / TOP), the
// three-role final approval, the designer → manager → factory workflow
// buttons, and a big "Download Final Trim Pack" button.
export function StepApproval({
  data, set, existingPeople = [], onAddPerson,
  createSnapshot, confirmRole, unconfirmRole,
  addSample, updateSample, removeSample,
  onDownloadPDF, onDownloadSVG, exporting, exportError,
}) {
  const fa = data.finalApproval || {};
  const setApprovalSlot = (role, slot) => set('finalApproval', { ...fa, [role]: slot });

  const onRequestRevision = () => {
    const note = (prompt('Revision request — what needs to change?') ?? '').trim();
    if (!note) return;
    createSnapshot(`Revision requested: ${note}`);
  };

  return (
    <div>
      <SectionTitle>Samples &amp; Approval</SectionTitle>

      <p style={{ fontSize: 11, color: FR.stone, marginTop: -10, marginBottom: 18 }}>
        Internal page — asset versioning, sign-off, and the final downloadable trim pack.
      </p>

      <div style={{ marginBottom: 22 }}>
        <label style={sectionLabel}>Samples</label>
        <SampleLog
          samples={data.samples || []}
          onAdd={addSample}
          onUpdate={updateSample}
          onRemove={removeSample} />
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={sectionLabel}>Final Approval</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <ApprovalSlot role="designer" title="Designer"
            value={fa.designer} onUpdate={setApprovalSlot}
            onConfirm={confirmRole} onUnconfirm={unconfirmRole}
            people={existingPeople} onAddPerson={onAddPerson} />
          <ApprovalSlot role="manager" title="Manager"
            value={fa.manager} onUpdate={setApprovalSlot}
            onConfirm={confirmRole} onUnconfirm={unconfirmRole}
            people={existingPeople} onAddPerson={onAddPerson} />
          <ApprovalSlot role="factory" title="Vendor"
            value={fa.factory} onUpdate={setApprovalSlot}
            onConfirm={confirmRole} onUnconfirm={unconfirmRole}
            people={existingPeople} onAddPerson={onAddPerson} />
        </div>
      </div>

      <div style={{ marginBottom: 22, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => createSnapshot('Submitted to manager')}
          style={{ padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Submit to Manager
        </button>
        <button onClick={() => createSnapshot('Submitted to vendor')}
          style={{ padding: '8px 14px', background: FR.soil, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Submit to Vendor
        </button>
        <button onClick={onRequestRevision}
          style={{ padding: '8px 14px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.slate}`, borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Request Revision
        </button>
        <span style={{ fontSize: 10, color: FR.stone, alignSelf: 'center', marginLeft: 'auto' }}>
          Each action captures a snapshot + revision entry on the Overview page.
        </span>
      </div>

      {/* Final download block — the "deliverable" export lives here so every
          internal sign-off happens in one place. The same buttons still sit
          in the top-right of the builder chrome, but surfacing them here
          makes the "we're done" moment obvious. */}
      <div style={{ padding: 18, border: `2px solid ${FR.slate}`, borderRadius: 8, background: FR.salt }}>
        <div style={{ fontSize: 11, color: FR.soil, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Final deliverable</div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate, marginTop: 2 }}>Download Final Trim Pack</div>
        <p style={{ fontSize: 11, color: FR.stone, margin: '6px 0 14px' }}>
          8-page A4 landscape rendering of every page above. Skipped pages carry a "PAGE NOT USED" slash; hidden items are suppressed.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onDownloadPDF} disabled={!!exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer' }}>
            <Download size={13} /> {exporting === 'pdf' ? 'Exporting…' : 'Download PDF'}
          </button>
          <button onClick={onDownloadSVG} disabled={!!exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.slate}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer' }}>
            <Download size={13} /> {exporting === 'svg' ? 'Exporting…' : 'Download SVG'}
          </button>
          {exportError && (
            <span style={{ fontSize: 11, color: '#C0392B', alignSelf: 'center' }}>⚠︎ {exportError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared subtitle helper ──────────────────────────────────────────────────
const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

// ── Page 2: Design ──────────────────────────────────────────────────────────
// One 9:16 sketch at top + two equally-sized reference/render images below.
// Pure visual page — no text fields. Lets the factory see the intent before
// wading into materials / construction specs.
export function StepDesign({ images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Design</SectionTitle>

      <p style={{ fontSize: 11, color: FR.stone, marginTop: -10, marginBottom: 16 }}>
        Sketch, reference, render — the three visuals that communicate the design.
      </p>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Sketch (A4 landscape)</label>
        <AspectPhoto slotKey="design-sketch" aspect={ASPECTS.A4_LANDSCAPE} images={images} onUpload={onUpload} onRemove={onRemove} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={sectionLabel}>Reference (2:3 portrait)</label>
          <AspectPhoto slotKey="design-reference" aspect={ASPECTS.TWO_THIRDS} images={images} onUpload={onUpload} onRemove={onRemove} />
        </div>
        <div>
          <label style={sectionLabel}>Render (2:3 portrait)</label>
          <AspectPhoto slotKey="design-render" aspect={ASPECTS.TWO_THIRDS} images={images} onUpload={onUpload} onRemove={onRemove} />
        </div>
      </div>
    </div>
  );
}

// ── Page 3: Materials ───────────────────────────────────────────────────────
// Three material cards side by side. Card = photo + name + composition +
// weight/gauge + factory. Users can add more with an explicit button; the
// rule-of-three ceiling is a default, not a cap.
export function StepMaterials({ data, set, images, onUpload, onRemove, existingSuppliers = [] }) {
  const materials = data.materials && data.materials.length
    ? data.materials
    : [{}, {}, {}];

  const updateMat = (i, k, v) =>
    set('materials', materials.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addMat = () =>
    set('materials', [...materials, { name: '', composition: '', weightGauge: '', factory: '', color: '', finish: '' }]);
  const removeMat = (i) => {
    if (materials.length <= 1) return;
    set('materials', materials.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <SectionTitle>Materials</SectionTitle>

      <p style={{ fontSize: 11, color: FR.stone, marginTop: -10, marginBottom: 16 }}>
        Three core materials by default. Add more only if the trim genuinely needs them.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(materials.length, 3)}, 1fr)`, gap: 14 }}>
        {materials.map((m, i) => (
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8, ...hiddenCardStyle(m.hidden) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: m.hidden ? '#C0392B' : FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>
                MATERIAL {i + 1}{m.hidden && ' · HIDDEN'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HideToggle hidden={!!m.hidden} onClick={() => updateMat(i, 'hidden', !m.hidden)} />
                {materials.length > 1 && (
                  <button onClick={() => removeMat(i)}
                    style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                )}
              </div>
            </div>
            <AspectPhoto slotKey={`material-${i}`} aspect={ASPECTS.TWO_THIRDS} images={images} onUpload={onUpload} onRemove={onRemove} />
            <Input label="Name" value={m.name} onChange={v => updateMat(i, 'name', v)} placeholder="e.g. Cotton Twill" />
            <Input label="Composition" value={m.composition} onChange={v => updateMat(i, 'composition', v)} placeholder="100% Cotton" />
            <Input label="Weight / Gauge" value={m.weightGauge} onChange={v => updateMat(i, 'weightGauge', v)} placeholder="400 GSM" />
            <Row>
              <div>
                <label style={labelStyle}>Color</label>
                <FRColorCell value={m.color || ''} onChange={v => updateMat(i, 'color', v)} />
              </div>
              <Select label="Finish" value={m.finish || ''} onChange={v => updateMat(i, 'finish', v)} options={MATERIAL_FINISHES} />
            </Row>
            <EditableSelect
              label="Vendor"
              value={m.factory}
              onChange={v => updateMat(i, 'factory', v)}
              options={existingSuppliers}
              onAddOption={addSupplier}
              placeholder="Add a new vendor…" />
          </div>
        ))}
      </div>

      {materials.length < 6 && (
        <button onClick={addMat}
          style={{ marginTop: 14, padding: '6px 14px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, color: FR.soil, cursor: 'pointer' }}>
          + Add material
        </button>
      )}
    </div>
  );
}

// ── Page 3: Construction ────────────────────────────────────────────────────
// One 16:9 measurement diagram hero + three construction callouts below.
export function StepConstruction({ data, set, images, onUpload, onRemove }) {
  const callouts = data.constructionCallouts && data.constructionCallouts.length
    ? data.constructionCallouts
    : [{}, {}, {}];

  const updateCallout = (i, k, v) =>
    set('constructionCallouts', callouts.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  return (
    <div>
      <SectionTitle>Construction</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Measurement Diagram (A4 landscape)</label>
        <AspectPhoto slotKey="construction-diagram" aspect={ASPECTS.A4_LANDSCAPE} images={images} onUpload={onUpload} onRemove={onRemove} />
      </div>

      <label style={sectionLabel}>Callouts — the three rules the vendor must follow</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {callouts.slice(0, 3).map((c, i) => (
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8, ...hiddenCardStyle(c.hidden) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: '#C0392B', fontWeight: 700, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
                CALLOUT {i + 1}{c.hidden && ' · HIDDEN'}
              </span>
              <span style={{ color: FR.stone, fontSize: 11 }}>—</span>
              <input
                value={c.label || ''}
                onChange={e => updateCallout(i, 'label', e.target.value)}
                placeholder="Callout title"
                style={{ flex: 1, fontSize: 11, padding: '3px 6px', border: `1px solid ${FR.sand}`, borderRadius: 3, color: FR.slate, background: 'white', fontFamily: "'Inter', sans-serif", outline: 'none' }}
              />
              <HideToggle hidden={!!c.hidden} onClick={() => updateCallout(i, 'hidden', !c.hidden)} />
            </div>
            <Input label="Specification" value={c.specification || c.detail || ''} onChange={v => updateCallout(i, 'specification', v)} placeholder="Spec, tolerance, notes…" multiline />
            <div>
              <label style={{ ...sectionLabel, marginTop: 4 }}>Reference Image</label>
              <AspectPhoto slotKey={`callout-ref-${i}`} aspect={ASPECTS.TWO_THIRDS} images={images} onUpload={onUpload} onRemove={onRemove} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page 4: Embellishments ──────────────────────────────────────────────────
// Colorways + front/back artwork images + file attachments for SVG / AI /
// PDF source art. Attachments are stored inline as base64 data URIs inside
// data.attachments, so they persist with the pack and can be downloaded
// later. Download links also show up in the exported PDF and will flow
// into the factory portal + email automation when those phases land.
const COLORWAY_CAP = 4;
const emptyColorway = () => ({ name: '', usage: '', frColor: '' });

// Compact colorway card. Picks an FR color; Pantone codes, hex, RGB, and the
// Pantone TCX card image all live in the shared color library (edited on the
// PLM → Colors tab). This card only stores {name, usage, frColor}. Legacy
// packs with inline pantone/hex values get seeded into the library on first
// mount, then those fields are dropped from the pack on the next save.
function ColorwayCard({ index, value, onChange, onRemove, canRemove }) {
  const c = value || emptyColorway();
  const [library, setLibrary] = useState(() => (c.frColor ? getFRColor(c.frColor) : null));

  // Re-read the library whenever the selected color changes so another pack's
  // edit to the palette shows up here.
  useEffect(() => {
    setLibrary(c.frColor ? getFRColor(c.frColor) : null);
  }, [c.frColor]);

  // One-time migration: if this card was saved before the palette-manager
  // unification and carries pantone/hex/rgb values inline, seed any fields
  // the library doesn't already know about. Never overwrite library values.
  useEffect(() => {
    if (!c.frColor) return;
    const entry = getFRColor(c.frColor);
    if (!entry) return;
    const legacy = {
      pantoneTCX: c.pantoneTCX, pantoneTPG: c.pantoneTPG,
      pantoneC: c.pantoneC,     hex: c.hex, rgb: c.rgb,
    };
    const toSeed = {};
    Object.entries(legacy).forEach(([k, v]) => {
      if (v && !entry[k]) toSeed[k] = v;
    });
    if (Object.keys(toSeed).length) {
      updateFRColor(c.frColor, toSeed);
      setLibrary(getFRColor(c.frColor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Narrow save — editing any field strips legacy pantone/hex/rgb from the
  // pack JSONB. Library stays authoritative. `hidden` is preserved.
  const patch = (k, v) => onChange({
    name: c.name || '', usage: c.usage || '', frColor: c.frColor || '',
    hidden: c.hidden || false,
    [k]: v,
  });

  const swatchHex = library?.hex || FR.salt;
  const cardImage = library?.cardImage;

  return (
    <div style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8, ...hiddenCardStyle(c.hidden) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: c.hidden ? '#C0392B' : FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>
          COLORWAY {index + 1}{c.hidden && ' · HIDDEN'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HideToggle hidden={!!c.hidden} onClick={() => patch('hidden', !c.hidden)} />
          {canRemove && (
            <button onClick={onRemove}
              style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          )}
        </div>
      </div>

      {/* Swatch strip + TCX card thumbnail (if library has one for this color) */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, height: 48, background: swatchHex, border: `1px solid ${FR.sand}`, borderRadius: 4 }} />
        {cardImage && (
          <img src={cardImage} alt={`${c.frColor} TCX card`}
            style={{ width: 32, height: 48, objectFit: 'cover', border: `1px solid ${FR.sand}`, borderRadius: 3 }} />
        )}
      </div>

      <Input label="Name" value={c.name} onChange={v => patch('name', v)} placeholder="Natural / Black" />
      <Input label="Used For" value={c.usage} onChange={v => patch('usage', v)} placeholder="Logo / Base fabric / Thread" />

      <div>
        <label style={labelStyle}>FR Color</label>
        <FRColorCell value={c.frColor} onChange={v => patch('frColor', v)} />
      </div>

      {/* Read-only library summary + edit link */}
      {c.frColor && (
        <div style={{ padding: '8px 10px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.stone, lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.3 }}>TCX</span>
            <span style={{ color: FR.slate }}>{library?.pantoneTCX || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.3 }}>HEX</span>
            <span style={{ color: FR.slate, fontFamily: 'monospace' }}>{library?.hex || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.3 }}>RGB</span>
            <span style={{ color: FR.slate }}>{library?.rgb || '—'}</span>
          </div>
          <button onClick={() => setPLMHash({ section: 'colors' })}
            style={{ marginTop: 4, background: 'none', border: 'none', color: FR.soil, fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            Edit in Colors →
          </button>
        </div>
      )}
    </div>
  );
}

export function StepEmbellishments({ data, set, images, onUpload, onRemove }) {
  // Coerce legacy / missing colorway rows into the new shape. Older packs
  // stored {name, frColor, pantone, hex, swatch, approvalStatus}; map into
  // the new shape while preserving anything useful.
  const raw = (data.colorwaysList && data.colorwaysList.length) ? data.colorwaysList : [emptyColorway()];
  const colorways = raw.slice(0, COLORWAY_CAP).map(r => ({
    name: r.name || '',
    usage: r.usage || '',
    frColor: r.frColor || '',
    hidden: !!r.hidden,
    pantoneTCX: r.pantoneTCX || r.pantone || '',
    pantoneTPG: r.pantoneTPG || '',
    pantoneC: r.pantoneC || '',
    hex: r.hex || '',
    rgb: r.rgb || '',
  }));

  const updateCW = (i, next) => set('colorwaysList', colorways.map((r, idx) => (idx === i ? next : r)));
  const addCW = () => {
    if (colorways.length >= COLORWAY_CAP) return;
    set('colorwaysList', [...colorways, emptyColorway()]);
  };
  const removeCW = (i) => set('colorwaysList', colorways.filter((_, idx) => idx !== i));

  // Display the colorway row as a grid that matches the number of cards,
  // capped at 4. Keeps each card comfortably wide on desktop and wraps on
  // narrower viewports.
  const cwCols = Math.min(Math.max(colorways.length, 1), COLORWAY_CAP);

  return (
    <div>
      <SectionTitle>Embellishments</SectionTitle>

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={sectionLabel}>Colorways</label>
          <span style={{ fontSize: 10, color: FR.stone }}>{colorways.length} / {COLORWAY_CAP}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cwCols}, 1fr)`, gap: 14 }}>
          {colorways.map((cw, i) => (
            <ColorwayCard key={i}
              index={i} value={cw}
              onChange={next => updateCW(i, next)}
              onRemove={() => removeCW(i)}
              canRemove={colorways.length > 1} />
          ))}
        </div>
        {colorways.length < COLORWAY_CAP && (
          <button onClick={addCW}
            style={{ marginTop: 12, padding: '6px 14px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, color: FR.soil, cursor: 'pointer' }}>
            + Add colorway
          </button>
        )}
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={sectionLabel}>Artwork — up to three A4 landscape tiles</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[0, 1, 2].map(idx => {
            const artHidden = Array.isArray(data.artworkHidden) ? !!data.artworkHidden[idx] : false;
            const toggleArtworkHidden = () => {
              const next = Array.isArray(data.artworkHidden) ? [...data.artworkHidden] : [false, false, false];
              next[idx] = !artHidden;
              set('artworkHidden', next);
            };
            return (
              <div key={idx} style={{ padding: 8, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, ...hiddenCardStyle(artHidden) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: artHidden ? '#C0392B' : FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>
                    ARTWORK {idx + 1}{artHidden && ' · HIDDEN'}
                  </span>
                  <HideToggle hidden={artHidden} onClick={toggleArtworkHidden} />
                </div>
                <AspectPhoto slotKey={`embellishment-artwork-${idx + 1}`} aspect={ASPECTS.A4_LANDSCAPE} images={images} onUpload={onUpload} onRemove={onRemove} />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label style={sectionLabel}>Attachments — SVG / AI / PDF source files</label>
        <AttachmentZone attachments={data.attachments || []} onChange={v => set('attachments', v)} />
        <p style={{ fontSize: 10, color: FR.stone, marginTop: 6 }}>
          Files persist with the pack. They'll live-link on the exported PDF and attach to the vendor email / portal once those phases ship.
        </p>
      </div>
    </div>
  );
}

// Inline base64 file uploader. Matches the image upload pattern but doesn't
// resize or re-encode — SVG / AI / PDF blobs are stored as-is. Individual
// files are capped at 10 MB to keep the pack row size manageable.
const ATTACHMENT_SIZE_LIMIT = 10 * 1024 * 1024;

function AttachmentZone({ attachments, onChange }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFiles = async (files) => {
    setError(null);
    const next = [...attachments];
    for (const f of files) {
      if (f.size > ATTACHMENT_SIZE_LIMIT) {
        setError(`${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB — over the 10 MB limit.`);
        continue;
      }
      try {
        const dataUri = await readAsDataURL(f);
        next.push({
          id: `${Date.now()}-${f.name}`,
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream',
          dataUri,
        });
      } catch (err) {
        console.error(err);
        setError(`Couldn't read ${f.name}.`);
      }
    }
    onChange(next);
  };

  const removeFile = (id) => onChange(attachments.filter(a => a.id !== id));

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div>
      <div onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{ border: `2px dashed ${dragging ? FR.soil : FR.sand}`, borderRadius: 6, padding: attachments.length ? 14 : 28, textAlign: 'center', cursor: 'pointer', background: dragging ? FR.sand : FR.salt, transition: 'all 0.2s' }}>
        <input ref={fileRef} type="file" multiple
          accept=".svg,.ai,.pdf,image/svg+xml,application/pdf,application/illustrator,application/postscript"
          onChange={e => { if (e.target.files.length) handleFiles(Array.from(e.target.files)); e.target.value = ''; }}
          style={{ display: 'none' }} />
        {attachments.length === 0
          ? (
            <>
              <div style={{ fontSize: 22, color: FR.sand, lineHeight: 1 }}>＋</div>
              <div style={{ fontSize: 12, color: FR.stone, marginTop: 6 }}>Drop files here or click to upload</div>
              <div style={{ fontSize: 10, color: FR.sand, marginTop: 3 }}>SVG · AI · PDF · up to 10 MB each</div>
            </>
          )
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' }}>
              {attachments.map(a => (
                <div key={a.id} style={{ position: 'relative', width: 180, padding: 10, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 4, textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: FR.slate, fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {a.name}</div>
                  <div style={{ fontSize: 10, color: FR.stone, marginBottom: 8 }}>{formatSize(a.size)}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={a.dataUri} download={a.name} onClick={e => e.stopPropagation()}
                      style={{ flex: 1, padding: '4px 8px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 10, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', fontWeight: 600 }}>
                      ⇩ Download
                    </a>
                    <button onClick={e => { e.stopPropagation(); removeFile(a.id); }}
                      style={{ padding: '4px 8px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.stone, cursor: 'pointer' }}>×</button>
                  </div>
                </div>
              ))}
              <div style={{ width: 180, height: 74, border: `2px dashed ${FR.sand}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FR.stone, fontSize: 20 }}>＋</div>
            </div>
          )}
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#C0392B' }}>{error}</div>}
    </div>
  );
}

// ── Page 5: Treatment ───────────────────────────────────────────────────────
// Three finish cards. Each = 2:3 photo + name + description textarea.
export function StepTreatment({ data, set, images, onUpload, onRemove }) {
  const treatments = data.treatments && data.treatments.length
    ? data.treatments
    : [{}, {}, {}];

  const update = (i, k, v) =>
    set('treatments', treatments.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  return (
    <div>
      <SectionTitle>Treatment</SectionTitle>

      <p style={{ fontSize: 11, color: FR.stone, marginTop: -10, marginBottom: 16 }}>
        Up to three finishes applied to this trim — wash, coating, distress, print, etc.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {treatments.slice(0, 3).map((t, i) => (
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8, ...hiddenCardStyle(t.hidden) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: t.hidden ? '#C0392B' : FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>
                FINISH {i + 1}{t.hidden && ' · HIDDEN'}
              </span>
              <HideToggle hidden={!!t.hidden} onClick={() => update(i, 'hidden', !t.hidden)} />
            </div>
            <AspectPhoto slotKey={`treatment-${i}`} aspect={ASPECTS.TWO_THIRDS} images={images} onUpload={onUpload} onRemove={onRemove} />
            <Input label="Name" value={t.name} onChange={v => update(i, 'name', v)} placeholder="e.g. Garment wash" />
            <Input label="Description" value={t.description} onChange={v => update(i, 'description', v)} placeholder="Temperature, duration, chemicals…" multiline />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page 6: Quality Control ─────────────────────────────────────────────────
// Same 3-card grid as Treatment. Each = 2:3 reference photo + focus + method.
export function StepQC({ data, set, images, onUpload, onRemove }) {
  const qcPoints = data.qcPoints && data.qcPoints.length
    ? data.qcPoints
    : [{}, {}, {}];

  const update = (i, k, v) =>
    set('qcPoints', qcPoints.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  return (
    <div>
      <SectionTitle>Quality Control</SectionTitle>

      <p style={{ fontSize: 11, color: FR.stone, marginTop: -10, marginBottom: 16 }}>
        The three things the vendor must verify before bulk.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {qcPoints.slice(0, 3).map((q, i) => (
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8, ...hiddenCardStyle(q.hidden) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: q.hidden ? '#C0392B' : FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>
                QC FOCUS {i + 1}{q.hidden && ' · HIDDEN'}
              </span>
              <HideToggle hidden={!!q.hidden} onClick={() => update(i, 'hidden', !q.hidden)} />
            </div>
            <AspectPhoto slotKey={`qc-${i}`} aspect={ASPECTS.TWO_THIRDS} images={images} onUpload={onUpload} onRemove={onRemove} />
            <Input label="Focus" value={q.focus} onChange={v => update(i, 'focus', v)} placeholder="e.g. Pull strength" />
            <Input label="Method" value={q.method} onChange={v => update(i, 'method', v)} placeholder="Test method (e.g. ISO 13935 seam strength)" multiline />
            <Input label="Pass" value={q.pass} onChange={v => update(i, 'pass', v)} placeholder="Pass criterion (e.g. ≥ 15 N, no fraying)" multiline />
          </div>
        ))}
      </div>
    </div>
  );
}

export const COMPONENT_STEP_FNS = [StepCover, StepDesign, StepMaterials, StepConstruction, StepEmbellishments, StepTreatment, StepQC, StepApproval];
