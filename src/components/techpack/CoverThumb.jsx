// Renders a `cover_image` column value that may be either a legacy base64
// data URL or a Supabase Storage path. Storage paths fetch a signed URL on
// mount; legacy values render directly. Used by every PLM list/detail
// view that shows a thumbnail from a single text column.
//
// On render failure (expired URL, revoked signature) it invalidates the
// cached URL and re-resolves once. After a second failure it returns
// null so the parent's fallback (icon / placeholder) shows up instead
// of a broken-image glyph.

import { useEffect, useState } from 'react';
import { resolveCoverImage, invalidateAssetUrl } from '../../utils/plmAssets';

export default function CoverThumb({ src: coverValue, alt = '', style }) {
  const inlineSrc = (typeof coverValue === 'string'
    && (coverValue.startsWith('data:') || /^https?:\/\//i.test(coverValue)))
    ? coverValue
    : '';
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);
  // Reset retry/error state when the input cover changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setRenderFailed(false);
    setRetryToken(0);
  }, [coverValue]);
  useEffect(() => {
    if (!coverValue || inlineSrc) return undefined;
    let cancelled = false;
    resolveCoverImage(coverValue).then(url => { if (!cancelled && url) setResolvedSrc(url); });
    return () => { cancelled = true; };
  }, [coverValue, inlineSrc, retryToken]);

  const src = inlineSrc || resolvedSrc;
  if (!src || renderFailed) return null;

  return (
    <img
      src={src}
      alt={alt}
      style={style || { width: '100%', height: '100%', objectFit: 'cover' }}
      onError={() => {
        if (!inlineSrc && retryToken === 0) {
          invalidateAssetUrl(coverValue);
          setResolvedSrc('');
          setRetryToken(t => t + 1);
        } else {
          setRenderFailed(true);
        }
      }}
    />
  );
}
