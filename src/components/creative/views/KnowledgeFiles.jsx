// Knowledge editor — structured questionnaire per kind, with file
// uploads + AI auto-fill on top.
//
// Two upload paths:
//   1. Top-level reference files per kind  → "Analyze with AI" fills
//      the whole kind's form (e.g. drop a brand kit PDF into Brand).
//   2. Per-product photos (inside hero_skus repeating group) →
//      "Analyze photos with AI" fills that single product card.
//
// Files are uploaded via plmAssets.uploadAsset (scope: creative-knowledge)
// so they live under {org}/creative-knowledge/{ownerId}/... in the
// shared plm-assets bucket. Refs live inside `fields._attachments` for
// kind-level uploads or inside the sku item's `photos` field for per-card.

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, Sparkles, X, Loader2, FileText } from 'lucide-react';
import { KNOWLEDGE_SCHEMAS, KNOWLEDGE_KINDS } from '../../../types/creativeKnowledge';
import { getAllKnowledge, saveKnowledge } from '../../../utils/creativeKnowledgeStore';
import { uploadAsset, getAssetUrl, deleteAsset } from '../../../utils/plmAssets';
import { callAnalyzeKnowledgeUpload } from '../../../utils/liveDataSync';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

export default function KnowledgeFiles() {
  const [active, setActive] = useState('avatar');
  const [knowledge, setKnowledge] = useState(null);

  useEffect(() => { getAllKnowledge().then(setKnowledge); }, []);

  if (!knowledge) return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;

  const schema = KNOWLEDGE_SCHEMAS[active];

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 4 }}>
        Knowledge Files
      </h2>
      <p style={{ fontSize: 13, color: FR.stone, marginBottom: 20 }}>
        These four files are injected into every brief generation. Type directly, or upload reference files and let AI fill them in for you.
      </p>

      {/* Kind tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '0.5px solid rgba(58,58,58,0.08)', paddingBottom: 8 }}>
        {KNOWLEDGE_KINDS.map(kind => {
          const isActive = kind === active;
          const row = knowledge[kind];
          const filled = row?.version > 0;
          return (
            <button
              key={kind}
              onClick={() => setActive(kind)}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 6,
                background: isActive ? FR.slate : 'transparent',
                color: isActive ? FR.salt : FR.stone,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {KNOWLEDGE_SCHEMAS[kind].label}
              {filled && (
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: isActive ? '#9DBE82' : '#3B6D11',
                }} />
              )}
            </button>
          );
        })}
      </div>

      <KnowledgeEditor
        kind={active}
        schema={schema}
        initialFields={knowledge[active]?.fields || {}}
        version={knowledge[active]?.version || 0}
        onSave={async (fields) => {
          const updated = await saveKnowledge(active, fields);
          setKnowledge(prev => ({ ...prev, [active]: updated }));
        }}
      />
    </div>
  );
}

function KnowledgeEditor({ kind, schema, initialFields, version, onSave }) {
  const [fields, setFields] = useState(initialFields);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => { setFields(initialFields); setSavedAt(null); }, [kind, initialFields]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(fields);
      setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  };

  const applySuggestions = (suggestions) => {
    setFields(prev => mergeSuggestions(prev, suggestions));
  };

  return (
    <div>
      <ReferenceFilesPanel
        kind={kind}
        attachments={fields._attachments || []}
        onAttachmentsChange={(_attachments) => setFields(prev => ({ ...prev, _attachments }))}
        existingFields={stripAttachments(fields)}
        onSuggestions={applySuggestions}
      />

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 24px' }}>
        <p style={{ fontSize: 12, color: FR.stone, marginBottom: 20 }}>{schema.description}</p>

        {schema.fields.map(field => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={fields[field.key]}
            onChange={(v) => setFields(prev => ({ ...prev, [field.key]: v }))}
            kind={kind}
            ownerScope={`${kind}-${field.key}`}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontSize: 12, padding: '7px 18px', borderRadius: 6,
            background: saving ? FR.sand : FR.slate, color: saving ? FR.stone : FR.salt,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {version > 0 && <span style={{ fontSize: 11, color: FR.stone }}>v{version} · saved</span>}
        {savedAt && <span style={{ fontSize: 11, color: '#3B6D11' }}>Saved {new Date(savedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Top-level reference files panel — drop zone + analyze button per kind
// ─────────────────────────────────────────────────────────────────────

function ReferenceFilesPanel({ kind, attachments, onAttachmentsChange, existingFields, onSuggestions }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const suggestions = await callAnalyzeKnowledgeUpload({
        kind,
        scope: 'kind',
        attachment_paths: attachments.map(a => a.path),
        existing_fields: existingFields,
      });
      onSuggestions(suggestions);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{
      background: FR.salt, border: '0.5px dashed rgba(58,58,58,0.25)',
      borderRadius: 8, padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', margin: 0 }}>
            Reference files
          </p>
          <p style={{ fontSize: 11, color: FR.stone, margin: '2px 0 0', fontStyle: 'italic' }}>
            PDFs, images, screenshots — drop anything that describes this {kind}. AI will read them and fill the form below.
          </p>
        </div>
        {attachments.length > 0 && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 6,
              background: analyzing ? FR.sand : FR.slate,
              color: analyzing ? FR.stone : FR.salt,
              border: 'none', cursor: analyzing ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              flexShrink: 0,
            }}
          >
            {analyzing
              ? <><Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> Analyzing…</>
              : <><Sparkles size={12} /> Analyze with AI</>}
          </button>
        )}
      </div>

      <FileGrid
        attachments={attachments}
        onChange={onAttachmentsChange}
        ownerId={`knowledge-${kind}`}
        accept="image/*,application/pdf,text/*"
      />

      {error && <p style={{ fontSize: 11, color: '#A32D2D', marginTop: 8, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// File grid — thumbnail row + upload button. Used by both the top-level
// reference panel and the per-product photos field.
// ─────────────────────────────────────────────────────────────────────

function FileGrid({ attachments, onChange, ownerId, accept = 'image/*' }) {
  const [uploading, setUploading] = useState(false);

  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const refs = [];
      for (const file of files) {
        try {
          const skipCompress = !file.type.startsWith('image/');
          const ref = await uploadAsset({
            scope: 'creative-knowledge',
            ownerId,
            slot: 'attachment',
            blob: file,
            skipCompress,
          });
          refs.push({ ...ref, name: file.name });
        } catch (err) {
          console.error('upload failed:', err);
        }
      }
      if (refs.length) onChange([...(attachments || []), ...refs]);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (path) => {
    onChange((attachments || []).filter(a => a.path !== path));
    deleteAsset(path).catch(() => { /* best-effort */ });
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {(attachments || []).map(att => (
        <Thumbnail key={att.path} attachment={att} onRemove={() => handleRemove(att.path)} />
      ))}
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, padding: '6px 10px', borderRadius: 6,
        border: '0.5px dashed rgba(58,58,58,0.3)', color: FR.slate,
        background: 'transparent',
        cursor: uploading ? 'not-allowed' : 'pointer',
        opacity: uploading ? 0.5 : 1,
      }}>
        {uploading
          ? <><Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> Uploading…</>
          : <><Upload size={12} /> Add files</>}
        <input
          type="file"
          multiple
          accept={accept}
          onChange={handlePickFiles}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Thumbnail({ attachment, onRemove }) {
  const [url, setUrl] = useState(null);
  const isImage = (attachment.content_type || '').startsWith('image/');
  const isPdf = attachment.content_type === 'application/pdf';
  const path = attachment.path;

  useEffect(() => {
    if (!isImage || !path) return;
    let cancelled = false;
    getAssetUrl(path).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path, isImage]);

  return (
    <div style={{
      position: 'relative', width: 72, height: 72, borderRadius: 6,
      overflow: 'hidden', background: '#fff',
      border: '0.5px solid rgba(58,58,58,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {isImage && url
        ? <img src={url} alt={attachment.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4 }}>
            <FileText size={20} color={FR.stone} />
            <span style={{ fontSize: 9, color: FR.stone, textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.1 }}>
              {isPdf ? 'PDF' : (attachment.name || '').slice(0, 14)}
            </span>
          </div>
        )}
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          position: 'absolute', top: 2, right: 2,
          background: 'rgba(0,0,0,0.55)', color: 'white',
          border: 'none', borderRadius: '50%',
          width: 18, height: 18, padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Field rendering
// ─────────────────────────────────────────────────────────────────────

function FieldRenderer({ field, value, onChange, kind, ownerScope }) {
  if (field.type === 'group') {
    if (field.repeating) {
      return (
        <RepeatingGroup
          field={field}
          value={value || []}
          onChange={onChange}
          kind={kind}
          ownerScope={ownerScope}
        />
      );
    }
    return (
      <FixedGroup
        field={field}
        value={value || {}}
        onChange={onChange}
        kind={kind}
        ownerScope={ownerScope}
      />
    );
  }

  if (field.type === 'photos') {
    return (
      <div style={{ marginBottom: 18 }}>
        <Label>{field.label}</Label>
        {field.hint && <Hint>{field.hint}</Hint>}
        <FileGrid
          attachments={Array.isArray(value) ? value : []}
          onChange={onChange}
          ownerId={ownerScope}
          accept="image/*"
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <Label>{field.label}</Label>
      {field.hint && <Hint>{field.hint}</Hint>}
      {field.type === 'text' && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={inputStyle}
        />
      )}
      {field.type === 'textarea' && (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
        />
      )}
      {field.type === 'list' && (
        <textarea
          value={Array.isArray(value) ? value.join('\n') : (value || '')}
          onChange={(e) => onChange(e.target.value.split('\n').map(l => l.trim()).filter(Boolean))}
          placeholder={field.placeholder || 'One per line…'}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 96, fontFamily: 'inherit' }}
        />
      )}
    </div>
  );
}

function FixedGroup({ field, value, onChange, kind, ownerScope }) {
  return (
    <div style={{ marginBottom: 18, padding: '14px 16px', background: FR.salt, borderRadius: 8, border: '0.5px solid rgba(58,58,58,0.08)' }}>
      <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 12 }}>{field.label}</p>
      {field.fields.map(sub => (
        <FieldRenderer
          key={sub.key}
          field={sub}
          value={value[sub.key]}
          onChange={(v) => onChange({ ...value, [sub.key]: v })}
          kind={kind}
          ownerScope={`${ownerScope}-${sub.key}`}
        />
      ))}
    </div>
  );
}

function RepeatingGroup({ field, value, onChange, kind, ownerScope }) {
  const items = Array.isArray(value) ? value : [];
  const photosKey = useMemo(() => field.fields.find(f => f.type === 'photos')?.key, [field]);
  const analyzeScope = field.analyzeScope; // 'sku_item' on hero_skus

  const addItem = () => onChange([...items, {}]);
  const removeItem = (i) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i, patch) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const replaceItem = (i, next) => onChange(items.map((it, idx) => idx === i ? next : it));

  return (
    <div style={{ marginBottom: 18 }}>
      <Label>{field.label}</Label>
      {items.length === 0 && (
        <p style={{ fontSize: 12, color: FR.stone, marginBottom: 8 }}>No entries yet.</p>
      )}
      {items.map((item, i) => (
        <RepeatingItem
          key={i}
          idx={i}
          item={item}
          field={field}
          kind={kind}
          ownerScope={`${ownerScope}-${i}`}
          photosKey={photosKey}
          analyzeScope={analyzeScope}
          onRemove={() => removeItem(i)}
          onUpdate={(patch) => updateItem(i, patch)}
          onReplace={(next) => replaceItem(i, next)}
        />
      ))}
      <button
        type="button"
        onClick={addItem}
        style={{
          fontSize: 12, padding: '6px 12px', borderRadius: 6,
          background: 'transparent', border: '0.5px dashed rgba(58,58,58,0.3)',
          color: FR.slate, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Plus size={12} /> {field.addLabel || 'Add'}
      </button>
    </div>
  );
}

function RepeatingItem({ idx, item, field, kind, ownerScope, photosKey, analyzeScope, onRemove, onUpdate, onReplace }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const photos = photosKey ? (item[photosKey] || []) : [];
  const canAnalyze = !!photosKey && !!analyzeScope && photos.length > 0;

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const { [photosKey]: _photosIgnored, ...existingFields } = item;
      void _photosIgnored;
      const suggestions = await callAnalyzeKnowledgeUpload({
        kind,
        scope: analyzeScope,
        attachment_paths: photos.map(p => p.path),
        existing_fields: existingFields,
      });
      // Keep photos, merge suggestions for everything else
      onReplace({ ...item, ...stripEmpty(suggestions), [photosKey]: photos });
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{ marginBottom: 12, padding: '14px 16px', background: FR.salt, borderRadius: 8, border: '0.5px solid rgba(58,58,58,0.08)', position: 'relative' }}>
      <button
        type="button"
        onClick={onRemove}
        style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: FR.stone }}
        title="Remove"
      >
        <Trash2 size={13} />
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingRight: 24, gap: 12 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.06em', color: FR.stone, textTransform: 'uppercase', margin: 0 }}>
          #{idx + 1}{item.name ? ` · ${item.name}` : ''}
        </p>
        {canAnalyze && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6,
              background: analyzing ? FR.sand : FR.slate,
              color: analyzing ? FR.stone : FR.salt,
              border: 'none', cursor: analyzing ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              flexShrink: 0,
            }}
          >
            {analyzing
              ? <><Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> Analyzing…</>
              : <><Sparkles size={11} /> Analyze photos with AI</>}
          </button>
        )}
      </div>
      {error && <p style={{ fontSize: 11, color: '#A32D2D', marginTop: 0, marginBottom: 8 }}>{error}</p>}
      {field.fields.map(sub => (
        <FieldRenderer
          key={sub.key}
          field={sub}
          value={item[sub.key]}
          onChange={(v) => onUpdate({ [sub.key]: v })}
          kind={kind}
          ownerScope={`${ownerScope}-${sub.key}`}
        />
      ))}
    </div>
  );
}

function Label({ children }) {
  return <p style={{ fontSize: 11, letterSpacing: '0.06em', color: FR.stone, textTransform: 'uppercase', marginBottom: 4 }}>{children}</p>;
}

function Hint({ children }) {
  return <p style={{ fontSize: 11, color: FR.stone, marginBottom: 6, fontStyle: 'italic' }}>{children}</p>;
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  fontSize: 13, padding: '7px 10px', borderRadius: 6,
  border: '0.5px solid rgba(58,58,58,0.2)', background: '#fff', color: FR.slate,
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function stripAttachments(fields) {
  const { _attachments, ...rest } = fields || {};
  void _attachments;
  return rest;
}

// Drop empty strings / empty arrays so AI suggestions don't blow away
// fields the user already filled in with the model's "" placeholder.
function stripEmpty(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// Merge AI suggestions into the existing fields blob. Suggestions
// override scalars and replace arrays — but we never touch
// `_attachments` (uploaded files) and we drop empty values so the
// model leaving a field as "" doesn't wipe what the user typed.
function mergeSuggestions(prev, suggestions) {
  if (!suggestions || typeof suggestions !== 'object') return prev;
  const next = { ...prev };
  for (const [k, v] of Object.entries(suggestions)) {
    if (v === '' || v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    next[k] = v;
  }
  return next;
}
