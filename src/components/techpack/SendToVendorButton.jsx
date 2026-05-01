// SendToVendorButton — single component, two layouts.
//
//   variant="header" — two text buttons side-by-side (used in the
//                      Tech Pack builder header where there's room).
//   variant="card"   — one icon button that opens a small popover
//                      with the two choices (used on Trim cards).
//
// Both branches render the same SendSampleModal / SendPOModal.
// Mount this component anywhere; it owns its own modal + toast state.
//
// Disabled state: if vendorName is empty, the button shows but is
// disabled with a tooltip ("Set a vendor on this pack first") so the
// admin doesn't get a confusing error after clicking.

import { useEffect, useRef, useState } from 'react';
import { Send, Package, FileBox } from 'lucide-react';
import { FR } from './techPackConstants';
import SendSampleModal from './SendSampleModal';
import SendPOModal from './SendPOModal';

function Toast({ children, kind = 'ok' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1400,
      padding: '10px 16px', borderRadius: 6,
      background: kind === 'ok' ? '#3B6D11' : '#A32D2D',
      color: '#FFF', fontSize: 12, letterSpacing: '0.04em',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    }}>
      {children}
    </div>
  );
}

export default function SendToVendorButton({ vendorName, styleId, variant = 'header' }) {
  const [openModal, setOpenModal] = useState(null); // 'sample' | 'po' | null
  const [toast, setToast] = useState(null);
  const disabled = !vendorName;

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSentSample = () => {
    setOpenModal(null);
    setToast({ kind: 'ok', text: `Sample request sent to ${vendorName}` });
  };
  const handleSentPO = ({ po_code }) => {
    setOpenModal(null);
    setToast({ kind: 'ok', text: `${po_code || 'PO'} placed and sent to ${vendorName}` });
  };

  const tip = disabled ? 'Set a vendor on this pack first' : `Send to ${vendorName}`;

  return (
    <>
      {variant === 'header' ? (
        <HeaderVariant onSample={() => setOpenModal('sample')} onPO={() => setOpenModal('po')} disabled={disabled} tip={tip} />
      ) : (
        <CardVariant onSample={() => setOpenModal('sample')} onPO={() => setOpenModal('po')} disabled={disabled} tip={tip} />
      )}

      {openModal === 'sample' && (
        <SendSampleModal vendorName={vendorName} styleId={styleId}
          onCancel={() => setOpenModal(null)} onSent={handleSentSample} />
      )}
      {openModal === 'po' && (
        <SendPOModal vendorName={vendorName} styleId={styleId}
          onCancel={() => setOpenModal(null)} onSent={handleSentPO} />
      )}

      {toast && <Toast kind={toast.kind}>{toast.text}</Toast>}
    </>
  );
}

function HeaderVariant({ onSample, onPO, disabled, tip }) {
  const baseStyle = (filled) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 3,
    fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
    border: filled ? 'none' : `1px solid ${FR.sand}`,
    background: filled ? FR.salt : 'transparent',
    color: filled ? FR.slate : FR.salt,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontFamily: 'inherit',
  });
  return (
    <div style={{ display: 'flex', gap: 6 }} title={tip}>
      <button type="button" onClick={onSample} disabled={disabled} style={baseStyle(false)}>
        <Send size={10} /> Send sample
      </button>
      <button type="button" onClick={onPO} disabled={disabled} style={baseStyle(true)}>
        <Package size={10} /> Send PO
      </button>
    </div>
  );
}

function CardVariant({ onSample, onPO, disabled, tip }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} title={tip}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(o => !o); }}
        disabled={disabled}
        style={{
          padding: 4, border: 'none', background: 'transparent',
          color: disabled ? FR.sand : FR.stone,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
        }}
      >
        <Send size={11} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            minWidth: 150, background: '#FFF',
            border: `1px solid ${FR.sand}`, borderRadius: 6,
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
            zIndex: 30, padding: 4,
          }}
        >
          <MenuItem icon={<FileBox size={11} />} onClick={() => { setOpen(false); onSample(); }}>Send sample</MenuItem>
          <MenuItem icon={<Package size={11} />} onClick={() => { setOpen(false); onPO(); }}>Send PO</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px', borderRadius: 4,
        fontSize: 11, color: FR.slate,
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = FR.salt; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}{children}
    </button>
  );
}
