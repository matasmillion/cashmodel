// FileSlot — generic file attachment dropzone for any non-image asset
// (DXF, ZFAB, .ai, .psd, .ase, .icc, .dst, .safetensors, etc.). Used by
// every PLM atom builder that needs a CLO3D / Adobe / vendor file.
//
// Two interaction modes share the same state:
//   • Drop or click → reads the file with FileReader.readAsDataURL,
//     stores it as a data URL string in `value`. The original filename
//     is encoded into the data URL via a custom `;name=...` parameter
//     so display still has it after a reload.
//   • "Or paste a URL" → toggles a tiny URL input. When the user pastes
//     a URL the value is set to that URL string verbatim — useful when
//     a PBR map or a .safetensors checkpoint is too large to base64.
//
// Storage cap: localStorage caps at ~5 MB per origin. The component
// blocks files larger than `maxBytes` (default 4 MB) with a clear
// message so the user understands why the upload didn't take.
//
// Display affordances:
//   • Filename + KB chip
//   • "Open" button (downloads / opens in a new tab)
//   • "Replace" + "Remove" buttons

import { useRef, useState } from 'react';
import { FileText, Link as LinkIcon, X, Download, Upload } from 'lucide-react';
import { FR } from './techPackConstants';

const NAME_PARAM_RE = /^data:([^;]+)(;name=([^;]+))?(;base64)?,/;

function decodeName(value) {
  if (!value) return null;
  if (!value.startsWith('data:')) return null;
  const m = NAME_PARAM_RE.exec(value);
  return m && m[3] ? decodeURIComponent(m[3]) : null;
}

function approxBytes(value) {
  if (!value || !value.startsWith('data:')) return null;
  const idx = value.indexOf('base64,');
  if (idx < 0) return null;
  const b64 = value.slice(idx + 7);
  // base64 expands by ~4/3 — convert back to byte count.
  return Math.round((b64.length * 3) / 4);
}

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const INPUT_STYLE = {
  width: '100%', padding: '6px 8px', border: `1px solid ${FR.sand}`,
  borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};

export default function FileSlot({
  value,
  onChange,
  accept,
  hint = 'Drop a file or click to browse',
  maxBytes = 4 * 1024 * 1024,
}) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [showUrlField, setShowUrlField] = useState(false);

  const isData = value && typeof value === 'string' && value.startsWith('data:');
  const isUrl = value && typeof value === 'string' && !value.startsWith('data:');
  const fileName = isData ? decodeName(value) : null;
  const fileSize = isData ? approxBytes(value) : null;

  const handleFile = (file) => {
    setError(null);
    if (!file) return;
    if (file.size > maxBytes) {
      setError(`File is ${formatBytes(file.size)} — over the ${formatBytes(maxBytes)} limit. Paste a URL instead.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result; // data:<mime>;base64,<...>
      // Inject the filename as a custom data-URL parameter so we can
      // recover it after a reload.
      const m = /^data:([^;]+);base64,(.*)$/.exec(raw);
      if (m) {
        const tagged = `data:${m[1]};name=${encodeURIComponent(file.name)};base64,${m[2]}`;
        onChange(tagged);
      } else {
        onChange(raw);
      }
    };
    reader.onerror = () => setError('Could not read file.');
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const remove = () => { onChange(''); setError(null); };

  const open = () => {
    if (!value) return;
    if (isData) {
      // Trigger a download by creating a Blob from the data URL.
      const a = document.createElement('a');
      a.href = value;
      a.download = fileName || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.open(value, '_blank', 'noopener');
    }
  };

  // Empty state: full dropzone + URL toggle.
  if (!value) {
    return (
      <div>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          style={{
            padding: '16px 14px',
            border: `2px dashed ${FR.sand}`,
            borderRadius: 6,
            background: FR.salt,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <input ref={fileRef} type="file" accept={accept} onChange={onPick} style={{ display: 'none' }} />
          <Upload size={18} style={{ color: FR.sand, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: FR.slate }}>{hint}</div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
              {accept ? `Accepts ${accept}` : 'Any file type'} · max {formatBytes(maxBytes)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowUrlField(s => !s)}
            style={{ background: 'none', border: 'none', color: FR.soil, fontSize: 11, padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <LinkIcon size={11} /> {showUrlField ? 'Hide URL field' : 'Or paste a URL instead'}
          </button>
        </div>
        {showUrlField && (
          <input
            value=""
            onChange={e => onChange(e.target.value)}
            placeholder="https://… or path/to/file"
            style={{ ...INPUT_STYLE, marginTop: 6 }}
          />
        )}
        {error && <div style={{ color: '#A32D2D', fontSize: 11, marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  // Filled state — uploaded file.
  if (isData) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 6, background: '#fff' }}>
          <FileText size={18} style={{ color: FR.soil, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: FR.slate, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName || 'Uploaded file'}
            </div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
              {formatBytes(fileSize)} · stored locally
            </div>
          </div>
          <button type="button" onClick={open} title="Download" style={{ padding: 4, background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
            <Download size={14} />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} title="Replace" style={{ padding: '4px 8px', background: 'transparent', color: FR.stone, border: `0.5px solid ${FR.sand}`, borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>
            Replace
          </button>
          <button type="button" onClick={remove} title="Remove" style={{ padding: 4, background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept={accept} onChange={onPick} style={{ display: 'none' }} />
        {error && <div style={{ color: '#A32D2D', fontSize: 11, marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  // Filled state — pasted URL.
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 6, background: '#fff' }}>
        <LinkIcon size={16} style={{ color: FR.soil, flexShrink: 0 }} />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 12, color: FR.slate, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: 'transparent' }}
        />
        <button type="button" onClick={open} title="Open" style={{ padding: 4, background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
          <Download size={14} />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} title="Upload a file instead" style={{ padding: '4px 8px', background: 'transparent', color: FR.stone, border: `0.5px solid ${FR.sand}`, borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>
          Upload
        </button>
        <button type="button" onClick={remove} title="Remove" style={{ padding: 4, background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>
      <input ref={fileRef} type="file" accept={accept} onChange={onPick} style={{ display: 'none' }} />
    </div>
  );
}
