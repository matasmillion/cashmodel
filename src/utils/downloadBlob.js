// iOS Safari ignores the <a download> attribute and opens text-ish blob
// types (like image/svg+xml) inline instead of saving. Route through the
// Web Share API when available so the user gets the native share sheet
// (Save to Files, AirDrop, Mail, etc.). Fall back to the classic <a
// download> pattern everywhere else.
export async function downloadBlob(blob, filename) {
  try {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
  } catch { /* File constructor unsupported — fall through */ }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
