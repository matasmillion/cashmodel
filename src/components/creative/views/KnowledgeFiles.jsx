// Knowledge editor — structured questionnaire per kind.
// Replaces the old read-only markdown viewer. Each kind has a schema
// defined in src/types/creativeKnowledge.js that drives the form layout.

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { KNOWLEDGE_SCHEMAS, KNOWLEDGE_KINDS } from '../../../types/creativeKnowledge';
import { getAllKnowledge, saveKnowledge } from '../../../utils/creativeKnowledgeStore';

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
        These four files are injected into every brief generation. Edit them in plain English — the agent reads what you write directly.
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

  return (
    <div>
      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 24px' }}>
        <p style={{ fontSize: 12, color: FR.stone, marginBottom: 20 }}>{schema.description}</p>

        {schema.fields.map(field => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={fields[field.key]}
            onChange={(v) => setFields(prev => ({ ...prev, [field.key]: v }))}
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

function FieldRenderer({ field, value, onChange }) {
  if (field.type === 'group') {
    if (field.repeating) {
      return <RepeatingGroup field={field} value={value || []} onChange={onChange} />;
    }
    return <FixedGroup field={field} value={value || {}} onChange={onChange} />;
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

function FixedGroup({ field, value, onChange }) {
  return (
    <div style={{ marginBottom: 18, padding: '14px 16px', background: FR.salt, borderRadius: 8, border: '0.5px solid rgba(58,58,58,0.08)' }}>
      <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 12 }}>{field.label}</p>
      {field.fields.map(sub => (
        <FieldRenderer
          key={sub.key}
          field={sub}
          value={value[sub.key]}
          onChange={(v) => onChange({ ...value, [sub.key]: v })}
        />
      ))}
    </div>
  );
}

function RepeatingGroup({ field, value, onChange }) {
  const items = Array.isArray(value) ? value : [];

  const addItem = () => onChange([...items, {}]);
  const removeItem = (i) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i, patch) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  return (
    <div style={{ marginBottom: 18 }}>
      <Label>{field.label}</Label>
      {items.length === 0 && (
        <p style={{ fontSize: 12, color: FR.stone, marginBottom: 8 }}>No entries yet.</p>
      )}
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 12, padding: '14px 16px', background: FR.salt, borderRadius: 8, border: '0.5px solid rgba(58,58,58,0.08)', position: 'relative' }}>
          <button
            type="button"
            onClick={() => removeItem(i)}
            style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: FR.stone }}
            title="Remove"
          >
            <Trash2 size={13} />
          </button>
          <p style={{ fontSize: 11, letterSpacing: '0.06em', color: FR.stone, textTransform: 'uppercase', marginBottom: 12 }}>
            #{i + 1}
          </p>
          {field.fields.map(sub => (
            <FieldRenderer
              key={sub.key}
              field={sub}
              value={item[sub.key]}
              onChange={(v) => updateItem(i, { [sub.key]: v })}
            />
          ))}
        </div>
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
