// Renders a `cover_image` column value that may be either a legacy base64
// data URL or a Supabase Storage path. Storage paths fetch a signed URL on
// mount; legacy values render directly. Used by every PLM list/detail
// view that shows a thumbnail from a single text column.

import { useEffect, useState } from 'react';
import { resolveCoverImage } from '../../utils/plmAssets';

export default function CoverThumb({ src: coverValue, alt = '', style }) {
  const inlineSrc = (typeof coverValue === 'string'
    && (coverValue.startsWith('data:') || /^https?:\/\//i.test(coverValue)))
    ? coverValue
    : '';
  const [resolvedSrc, setResolvedSrc] = useState('');
  useEffect(() => {
    if (!coverValue || inlineSrc) return undefined;
    let cancelled = false;
    resolveCoverImage(coverValue).then(url => { if (!cancelled && url) setResolvedSrc(url); });
    return () => { cancelled = true; };
  }, [coverValue, inlineSrc]);
  const src = inlineSrc || resolvedSrc;
  if (!src) return null;
  return <img src={src} alt={alt} style={style || { width: '100%', height: '100%', objectFit: 'cover' }} />;
}
