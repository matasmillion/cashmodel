// Trim Pack wizard step panels. 6 pages total:
//   1. Overview        — lifecycle (revisions, samples, final approval)
//   2. Materials       — 3 material cards
//   3. Construction    — 16:9 measurement diagram + 3 callouts
//   4. Embellishments  — colorways, artwork, file attachments
//   5. Treatment       — 3 finish cards (image + text)
//   6. Quality Control — 3 QC focus cards (image + text)

import { STATUSES, COMPONENT_TYPES, APPROVAL_STATUSES, SAMPLE_TYPES, SAMPLE_VERDICTS } from './componentPackConstants';
import { FR, FR_COLOR_OPTIONS } from './techPackConstants';
import { Input, Select, Row, SectionTitle, CoverPhoto, EditableSelect, ArrayTable, FRColorCell, labelStyle, inputBase } from './TechPackPrimitives';
import { addSupplier } from '../../utils/plmDirectory';
import { useState, useRef } from 'react';
import { CheckCircle, XCircle, Clock, Plus } from 'lucide-react';

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
          No samples logged yet. Log Proto / Fit / SMS / PP / TOP iterations as the factory delivers them.
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
  existingSuppliers = [], existingPeople = [], onAddPerson,
  createSnapshot, confirmRole, unconfirmRole,
  addSample, updateSample, removeSample,
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

  const setApprovalSlot = (role, slot) => {
    const fa = data.finalApproval || {};
    set('finalApproval', { ...fa, [role]: slot });
  };

  const onRequestRevision = () => {
    const note = (prompt('Revision request — what needs to change?') ?? '').trim();
    if (!note) return;
    createSnapshot(`Revision requested: ${note}`);
  };

  const fa = data.finalApproval || {};
  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Overview</SectionTitle>

      <CoverPhoto label="Trim Photo" slotKey="component-cover" images={images} onUpload={onUpload} onRemove={onRemove} />

      <Row cols="1fr 1fr 1fr">
        <Input label="Trim Name" value={data.componentName} onChange={v => set('componentName', v)} placeholder="e.g. Main Label — Woven" />
        <Select label="Trim Type" value={data.componentType} onChange={v => set('componentType', v)} options={COMPONENT_TYPES} />
        <Input label="Season" value={data.season} onChange={v => set('season', v)} placeholder="SS26 / FW26 / Core" />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <EditableSelect
          label="Factory"
          value={data.supplier}
          onChange={v => set('supplier', v)}
          options={existingSuppliers}
          onAddOption={addSupplier}
          placeholder="Add a new factory…" />
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

      {/* Samples — Proto / Fit / SMS / PP / TOP lifecycle log */}
      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Samples</label>
        <SampleLog
          samples={data.samples || []}
          onAdd={addSample}
          onUpdate={updateSample}
          onRemove={removeSample} />
      </div>

      {/* Final approval — Designer / Manager / Factory */}
      <div style={{ marginBottom: 18 }}>
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
          <ApprovalSlot role="factory" title="Factory"
            value={fa.factory} onUpdate={setApprovalSlot}
            onConfirm={confirmRole} onUnconfirm={unconfirmRole}
            people={existingPeople} onAddPerson={onAddPerson} />
        </div>
      </div>

      {/* Workflow actions — drive the designer → manager → factory review loop */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => createSnapshot('Submitted to manager')}
          style={{ padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Submit to Manager
        </button>
        <button onClick={() => createSnapshot('Submitted to factory')}
          style={{ padding: '8px 14px', background: FR.soil, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Submit to Factory
        </button>
        <button onClick={onRequestRevision}
          style={{ padding: '8px 14px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.slate}`, borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Request Revision
        </button>
        <span style={{ fontSize: 10, color: FR.stone, alignSelf: 'center', marginLeft: 'auto' }}>
          Each action captures a snapshot + revision entry above.
        </span>
      </div>
    </div>
  );
}

// ── Shared subtitle helper ──────────────────────────────────────────────────
const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

// ── Page 2: Materials ───────────────────────────────────────────────────────
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
    set('materials', [...materials, { name: '', composition: '', weightGauge: '', factory: '' }]);
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
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>MATERIAL {i + 1}</span>
              {materials.length > 1 && (
                <button onClick={() => removeMat(i)}
                  style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
              )}
            </div>
            <CoverPhoto label="" slotKey={`material-${i}`} images={images} onUpload={onUpload} onRemove={onRemove} height={150} autoCropOnUpload={false} />
            <Input label="Name" value={m.name} onChange={v => updateMat(i, 'name', v)} placeholder="e.g. Cotton Twill" />
            <Input label="Composition" value={m.composition} onChange={v => updateMat(i, 'composition', v)} placeholder="100% Cotton" />
            <Input label="Weight / Gauge" value={m.weightGauge} onChange={v => updateMat(i, 'weightGauge', v)} placeholder="400 GSM" />
            <EditableSelect
              label="Factory"
              value={m.factory}
              onChange={v => updateMat(i, 'factory', v)}
              options={existingSuppliers}
              onAddOption={addSupplier}
              placeholder="Add a new factory…" />
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
        <label style={sectionLabel}>Measurement Diagram (16:9)</label>
        <CoverPhoto label="" slotKey="construction-diagram" images={images} onUpload={onUpload} onRemove={onRemove} height={360} autoCropOnUpload={false} />
      </div>

      <label style={sectionLabel}>Callouts — the three rules the factory must follow</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {callouts.slice(0, 3).map((c, i) => (
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 9, color: FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>CALLOUT {i + 1}</span>
            <Input label="Label" value={c.label} onChange={v => updateCallout(i, 'label', v)} placeholder="e.g. Seam type" />
            <Input label="Detail" value={c.detail} onChange={v => updateCallout(i, 'detail', v)} placeholder="Spec, tolerance, notes…" multiline />
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
export function StepEmbellishments({ data, set, images, onUpload, onRemove }) {
  const colorways = data.colorwaysList && data.colorwaysList.length
    ? data.colorwaysList
    : [{ name: '', frColor: '', pantone: '', hex: '', swatch: '', approvalStatus: 'Pending' }];

  const updateCW = (i, k, v) => {
    set('colorwaysList', colorways.map((r, idx) => {
      if (idx !== i) return r;
      if (k === 'frColor') {
        const match = FR_COLOR_OPTIONS.find(c => c.name === v);
        return { ...r, frColor: v, hex: match ? match.hex : r.hex };
      }
      return { ...r, [k]: v };
    }));
  };
  const addCW = () => set('colorwaysList', [...colorways, { name: '', frColor: '', pantone: '', hex: '', swatch: '', approvalStatus: 'Pending' }]);
  const removeCW = (i) => set('colorwaysList', colorways.filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionTitle>Embellishments</SectionTitle>

      <div style={{ marginBottom: 20 }}>
        <label style={sectionLabel}>Colorways</label>
        <ArrayTable
          headers={[
            { key: 'name',           label: 'Name',           placeholder: 'Natural / Black' },
            { key: 'frColor',        label: 'FR Color',       render: (v, onChange) => <FRColorCell value={v} onChange={onChange} /> },
            { key: 'pantone',        label: 'Pantone',        placeholder: '19-4305' },
            { key: 'hex',            label: 'Hex',            placeholder: '#3A3A3A' },
            { key: 'approvalStatus', label: 'Approval',       render: (v, onChange) => (
              <select value={v || 'Pending'} onChange={e => onChange(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
                {APPROVAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) },
          ]}
          rows={colorways} onUpdate={updateCW} onAdd={addCW} onRemove={removeCW} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={sectionLabel}>Artwork</label>
        <Row>
          <CoverPhoto label="Front" slotKey="embellishment-artwork-front" images={images} onUpload={onUpload} onRemove={onRemove} height={200} autoCropOnUpload={false} />
          <CoverPhoto label="Back"  slotKey="embellishment-artwork-back"  images={images} onUpload={onUpload} onRemove={onRemove} height={200} autoCropOnUpload={false} />
        </Row>
      </div>

      <div>
        <label style={sectionLabel}>Attachments — SVG / AI / PDF source files</label>
        <AttachmentZone attachments={data.attachments || []} onChange={v => set('attachments', v)} />
        <p style={{ fontSize: 10, color: FR.stone, marginTop: 6 }}>
          Files persist with the pack. They'll live-link on the exported PDF and attach to the factory email / portal once those phases ship.
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
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 9, color: FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>FINISH {i + 1}</span>
            <CoverPhoto label="" slotKey={`treatment-${i}`} images={images} onUpload={onUpload} onRemove={onRemove} height={220} autoCropOnUpload={false} />
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
        The three things the factory must verify before bulk.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {qcPoints.slice(0, 3).map((q, i) => (
          <div key={i} style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 9, color: FR.soil, fontWeight: 700, letterSpacing: 1.5 }}>QC FOCUS {i + 1}</span>
            <CoverPhoto label="" slotKey={`qc-${i}`} images={images} onUpload={onUpload} onRemove={onRemove} height={220} autoCropOnUpload={false} />
            <Input label="Focus" value={q.focus} onChange={v => update(i, 'focus', v)} placeholder="e.g. Pull strength" />
            <Input label="Method / Pass" value={q.method} onChange={v => update(i, 'method', v)} placeholder="Test method + pass criterion" multiline />
          </div>
        ))}
      </div>
    </div>
  );
}

export const COMPONENT_STEP_FNS = [StepCover, StepMaterials, StepConstruction, StepEmbellishments, StepTreatment, StepQC];
