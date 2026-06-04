// FileSlot — generic file attachment dropzone for any non-image asset
// (DXF, ZFAB, .ai, .psd, .ase, .icc, .dst, .safetensors, etc.). Used by
// every PLM atom builder that needs a CLO3D / Adobe / vendor file.
//
// Two storage backends share one UI:
//   • Legacy / inline (no assetScope+assetOwnerId): the file is read with
//     FileReader.readAsDataURL and stored as a data-URL string in `value`,
//     with the original filename encoded via a `;name=...` parameter. Capped
//     at 4 MB because that base64 lives inside the record (localStorage's
//     ~5 MB origin budget / cloud-mirror row size).
//   • Storage-backed (assetScope + assetOwnerId set): the file is uploaded to
//     the Supabase `plm-assets` bucket via uploadAsset (no compression,
//     original extension preserved) and `value` holds the Storage PATH. This
//     is the path for large assets like .zfab — no base64 bloat, ~50 MB cap.
//
// Either way, "Or paste a URL" stores a URL string verbatim (for assets
// hosted elsewhere). `value` is therefore one of: data-URL | storage path |
// http(s) URL | ''.
//
// Display: filename + size chip, Open/Download, Replace, Remove.

import { useRef, useState } from 'react';
import { FileText, Link as LinkIcon, X, Download, Upload, Cloud } from 'lucide-react';
import { FR } from './techPackConstants';
import { uploadAsset, deleteAsset, getAssetUrl } from '../../utils/plmAssets';

const NAME_PARAM_RE = /^data:([^;]+)(;name=([^;]+))?(;base64)?,/;
const INLINE_MAX = 4 * 1024 * 1024;
const STORAGE_MAX = 50 * 1024 * 1024;

function decodeName(value) {
  if (!value || !value.startsWith('data:')) return null;
  const m = NAME_PARAM_RE.exec(value);
  return m && m[3] ? decodeURIComponent(m[3]) : null;
}

function approxBytes(value) {
  if (!value || !value.startsWith('data:')) return null;
  const idx = value.indexOf('base64,');
  if (idx < 0) return null;
  return Math.round((value.slice(idx + 7).length * 3) / 4);
}

function extOfName(name) {
  const e = String(name || '').split('.').pop();
  return e && e !== name ? e : '';
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
  maxBytes,
  // Storage-backed mode. When both are set, uploads go to the plm-assets
  // bucket and `value` becomes the Storage path.
  assetScope,
  assetOwnerId,
  assetSlot = 'asset',
}) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);
  // Filename / size of the just-uploaded storage file, keyed to its path —
  // path values don't carry a display name across reloads, so this only
  // applies to the file uploaded in this session.
  const [meta, setMeta] = useState(null); // { path, name, size }

  const storageMode = !!(assetScope && assetOwnerId);
  const cap = maxBytes ?? (storageMode ? STORAGE_MAX : INLINE_MAX);

  const isData = typeof value === 'string' && value.startsWith('data:');
  const isHttp = typeof value === 'string' && /^https?:\/\//i.test(value);
  const isPath = !!value && typeof value === 'string' && !isData && !isHttp;
  const sessionMeta = meta && meta.path === value ? meta : null;

  const handleFile = async (file) => {
    setError(null);
    if (!file) return;
    if (file.size > cap) {
      setError(`File is ${formatBytes(file.size)} — over the ${formatBytes(cap)} limit.${storageMode ? '' : ' Paste a URL instead.'}`);
      return;
    }
    if (storageMode) {
      setBusy(true);
      try {
        const previous = value;
        const ref = await uploadAsset({
          scope: assetScope, ownerId: assetOwnerId, slot: assetSlot,
          blob: file, skipCompress: true, ext: extOfName(file.name),
        });
        setMeta({ path: ref.path, name: file.name, size: file.size });
        onChange(ref.path);
        if (previous && typeof previous === 'string' && !previous.startsWith('data:') && !/^https?:\/\//i.test(previous) && previous !== ref.path) {
          deleteAsset(previous);
        }
      } catch (err) {
        console.error('FileSlot upload:', err);
        setError(err?.message || 'Upload failed.');
      } finally {
        setBusy(false);
      }
      return;
    }
    // Inline (legacy) — base64 into the record with the filename tagged in.
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result; // data:<mime>;base64,<...>
      const m = /^data:([^;]+);base64,(.*)$/.exec(raw);
      onChange(m ? `data:${m[1]};name=${encodeURIComponent(file.name)};base64,${m[2]}` : raw);
    };
    reader.onerror = () => setError('Could not read file.');
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };
  const onPick = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; };

  const remove = () => {
    const previous = value;
    onChange('');
    setMeta(null);
    setError(null);
    if (storageMode && previous && typeof previous === 'string' && !previous.startsWith('data:') && !/^https?:\/\//i.test(previous)) {
      deleteAsset(previous);
    }
  };

  const open = async () => {
    if (!value) return;
    if (isData) {
      const a = document.createElement('a');
      a.href = value;
      a.download = decodeName(value) || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (isPath) {
      const url = await getAssetUrl(value);
      if (url) window.open(url, '_blank', 'noopener');
      else setError('Could not open file — sign in and try again.');
    } else {
      window.open(value, '_blank', 'noopener');
    }
  };

  // Empty state: dropzone + URL toggle.
  if (!value) {
    return (
      <div>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          style={{ padding: '16px 14px', border: `2px dashed ${FR.sand}`, borderRadius: 6, background: FR.salt, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <input ref={fileRef} type="file" accept={accept} onChange={onPick} style={{ display: 'none' }} />
          <Upload size={18} style={{ color: FR.sand, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: FR.slate }}>{busy ? 'Uploading…' : hint}</div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
              {accept ? `Accepts ${accept}` : 'Any file type'} · max {formatBytes(cap)}{storageMode ? ' · stored in cloud' : ''}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => setShowUrlField(s => !s)}
            style={{ background: 'none', border: 'none', color: FR.soil, fontSize: 11, padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <LinkIcon size={11} /> {showUrlField ? 'Hide URL field' : 'Or paste a URL instead'}
          </button>
        </div>
        {showUrlField && (
          <input value="" onChange={e => onChange(e.target.value)} placeholder="https://… or path/to/file" style={{ ...INPUT_STYLE, marginTop: 6 }} />
        )}
        {error && <div style={{ color: '#A32D2D', fontSize: 11, marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  // Filled — uploaded file (inline data URL or cloud storage path).
  if (isData || isPath) {
    const name = isData ? decodeName(value) : (sessionMeta?.name || `Cloud asset${extOfName(value) ? ` (.${extOfName(value)})` : ''}`);
    const size = isData ? approxBytes(value) : (sessionMeta?.size ?? null);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 6, background: '#fff' }}>
          {isPath ? <Cloud size={18} style={{ color: FR.soil, flexShrink: 0 }} /> : <FileText size={18} style={{ color: FR.soil, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: FR.slate, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name || 'Uploaded file'}
            </div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
              {size != null ? `${formatBytes(size)} · ` : ''}{isPath ? 'stored in cloud' : 'stored locally'}
            </div>
          </div>
          <button type="button" onClick={open} title="Download / open" style={{ padding: 4, background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer' }}>
            <Download size={14} />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} title="Replace" style={{ padding: '4px 8px', background: 'transparent', color: FR.stone, border: `0.5px solid ${FR.sand}`, borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>
            {busy ? '…' : 'Replace'}
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

  // Filled — pasted URL.
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 6, background: '#fff' }}>
        <LinkIcon size={16} style={{ color: FR.soil, flexShrink: 0 }} />
        <input value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 12, color: FR.slate, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: 'transparent' }} />
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
