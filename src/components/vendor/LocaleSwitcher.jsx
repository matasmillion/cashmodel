// @ts-check
// Compact EN / 中文 toggle. Used in the vendor portal header and the
// vendor account preferences screen. Writes-through to the vendor's
// `preferred_locale` so notification emails track the same choice.

import { useLocale, SUPPORTED_LOCALES } from '../../i18n';
import { setVendorPreferredLocale } from '../../utils/vendorPortalStore';

const LABELS = {
  'en': 'EN',
  'zh-CN': '中文',
};

export default function LocaleSwitcher({ persist = true }) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex',
        gap: 0,
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {SUPPORTED_LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => {
              setLocale(l);
              if (persist) setVendorPreferredLocale(l).catch(() => {/* tolerated */});
            }}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              letterSpacing: '0.06em',
              background: active ? '#3A3A3A' : 'transparent',
              color: active ? '#F5F0E8' : '#3A3A3A',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {LABELS[l] || l}
          </button>
        );
      })}
    </div>
  );
}
