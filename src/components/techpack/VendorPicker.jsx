// VendorPicker — async-loaded dropdown sourced from the shared vendor
// library. Used by every PLM atom builder so a fabric, treatment, or
// embellishment maps to a real entry in the vendor log instead of a
// free-text supplier name.
//
// Two surfaces:
//   • Select: loads listVendors() once on mount, displays them in a
//     native <select>. Vendor names that aren't yet in the library still
//     show because listVendors merges plmDirectory into the library set.
//   • "Manage vendors" hint: a quiet link that drops the user back to
//     the Vendors atom so they can add a new one without losing context.
//
// The current value (a vendor name) is preserved verbatim — if a row
// references a vendor that's been removed from the library the picker
// keeps showing the name with a muted "Not in library" tag rather than
// silently nulling it.

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { listVendors } from '../../utils/vendorLibrary';
import { setPLMHash } from '../../utils/plmRouting';

const INPUT_STYLE = {
  width: '100%', padding: '6px 8px', border: `1px solid ${FR.sand}`,
  borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};

export default function VendorPicker({ value, onChange, placeholder = 'Select vendor…', allowEmpty = true }) {
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listVendors().then(rows => {
      if (cancelled) return;
      setVendors(rows || []);
    }).catch(err => {
      console.error('VendorPicker:', err);
    });
    return () => { cancelled = true; };
  }, []);

  const knownNames = new Set(vendors.map(v => v.name));
  const valueMissing = value && !knownNames.has(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={INPUT_STYLE}
      >
        {allowEmpty && <option value="">{placeholder}</option>}
        {valueMissing && <option value={value}>{value} (not in library)</option>}
        {vendors.map(v => (
          <option key={v.name} value={v.name}>
            {v.name}{!v._hasRecord ? ' · referenced only' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setPLMHash({ layer: 'library', atom: 'vendors' })}
        style={{ background: 'none', border: 'none', color: FR.stone, fontSize: 10, cursor: 'pointer', padding: 0, textAlign: 'left' }}
      >
        Manage vendors →
      </button>
    </div>
  );
}
