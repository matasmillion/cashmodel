// TopBar — luxury ERP navigation chrome.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ {Org}                                Cash  Marketing▾ …  ⚙  │
//   │ Enterprise Resource Planning                                 │
//   └──────────────────────────────────────────────────────────────┘
//
// Marketing / Product / Operations open hover menus. Settings is the
// gear on the far right. The single-tab "Cash" routes to the dashboard
// view. Active state highlights the parent menu when any child route
// is the current view.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ChevronDown, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCurrentOrg, useSignOut, useCurrentUser } from '../lib/auth';
import SyncIndicator from './SyncIndicator';

const FR = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
};

const PRIMARY_NAV = [
  { id: 'cash', label: 'Cash', tabId: 'dashboard' },
  {
    id: 'marketing',
    label: 'Marketing',
    children: [
      { tabId: 'ad-units', label: 'Creative' },
      { tabId: 'revenue', label: 'Revenue' },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    children: [
      { tabId: 'unit-economics', label: 'Unit Economics' },
      { tabId: 'product', label: 'PLM' },
      { tabId: 'sell-through', label: 'Sell-Through' },
      { tabId: 'po-schedule', label: 'PO Schedule' },
      { tabId: 'pos', label: 'New PO' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    children: [
      { tabId: 'fulfillment', label: 'Fulfillment' },
      { tabId: 'opex', label: 'OPEX' },
      { tabId: 'cashflow', label: 'P&L + Cash' },
    ],
  },
];

const SETTINGS_MENU = [
  { kind: 'link', to: '/account/security', label: 'Account' },
  { kind: 'tab', tabId: 'org-settings', label: 'Org Settings' },
  { kind: 'tab', tabId: 'integrations', label: 'Integrations' },
  { kind: 'tab', tabId: 'scenarios', label: 'Scenarios' },
  { kind: 'signout', label: 'Sign Out' },
];

// Hover menu — opens on mouseenter, closes on mouseleave with a small
// grace period so a diagonal cursor path between trigger and menu
// doesn't snap it shut. Click on the trigger toggles for keyboard /
// touch users; outside-click closes.
function HoverMenu({ trigger, children, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          [align]: 0,
          minWidth: 180,
          background: '#FFFFFF',
          border: `0.5px solid rgba(58,58,58,0.12)`,
          borderRadius: 8,
          padding: 6,
          boxShadow: '0 8px 24px rgba(58,58,58,0.08), 0 2px 6px rgba(58,58,58,0.04)',
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 160ms ease, transform 160ms ease',
          zIndex: 60,
        }}
      >
        {children({ close: () => setOpen(false) })}
      </div>
    </div>
  );
}

function MenuItem({ children, active, onClick, to }) {
  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '8px 12px',
    background: active ? FR.sand : 'transparent',
    color: FR.slate,
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 400,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    textAlign: 'left',
    textDecoration: 'none',
    letterSpacing: '0.01em',
    transition: 'background 120ms ease',
  };
  const hoverIn = (e) => { if (!active) e.currentTarget.style.background = 'rgba(235,229,213,0.55)'; };
  const hoverOut = (e) => { if (!active) e.currentTarget.style.background = 'transparent'; };
  if (to) {
    return (
      <Link to={to} onClick={onClick} onMouseEnter={hoverIn} onMouseLeave={hoverOut} style={baseStyle}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} onMouseEnter={hoverIn} onMouseLeave={hoverOut} style={baseStyle}>
      {children}
    </button>
  );
}

function PrimaryTrigger({ label, active, hasChildren, open }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 400,
        letterSpacing: '0.02em',
        fontFamily: "'Inter', sans-serif",
        color: active ? FR.slate : FR.stone,
        background: active ? FR.sand : 'transparent',
        cursor: 'pointer',
        transition: 'color 160ms ease, background 160ms ease',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = FR.slate; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = FR.stone; } }}
    >
      {label}
      {hasChildren && (
        <ChevronDown
          size={11}
          style={{
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      )}
    </span>
  );
}

export default function TopBar() {
  const { state, dispatch } = useApp();
  const org = useCurrentOrg();
  const user = useCurrentUser();
  const signOut = useSignOut();

  const setTab = (tabId) => dispatch({ type: 'SET_TAB', payload: tabId });

  const isItemActive = (item) => {
    if (item.tabId) return state.activeTab === item.tabId;
    return item.children?.some(c => c.tabId === state.activeTab);
  };

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-sm border-b"
      style={{ background: 'rgba(245,240,232,0.92)', borderColor: 'rgba(58,58,58,0.08)' }}
    >
      <div className="px-8 py-5">
        <div className="flex items-center justify-between gap-8">
          {/* Top-left: Org name + ERP subtitle, in Cormorant. */}
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 400,
                fontSize: 22,
                color: FR.slate,
                letterSpacing: '0.06em',
                lineHeight: 1.1,
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              Enterprise Resource Planning
            </h1>
            <p
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 400,
                fontSize: 12,
                fontStyle: 'italic',
                color: FR.stone,
                letterSpacing: '0.14em',
                marginTop: 2,
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              {org?.name || ' '}
            </p>
          </div>

          {/* Right: primary nav + settings gear. */}
          <nav className="flex items-center gap-1">
            {PRIMARY_NAV.map((item, idx) => {
              const active = isItemActive(item);
              if (!item.children) {
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx === 0 && <SyncIndicator />}
                    <button
                      onClick={() => setTab(item.tabId)}
                      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <PrimaryTrigger label={item.label} active={active} hasChildren={false} open={false} />
                    </button>
                  </div>
                );
              }
              return (
                <HoverMenu
                  key={item.id}
                  trigger={({ open }) => (
                    <PrimaryTrigger label={item.label} active={active} hasChildren open={open} />
                  )}
                >
                  {({ close }) => item.children.map(child => (
                    <MenuItem
                      key={child.tabId}
                      active={state.activeTab === child.tabId}
                      onClick={() => { setTab(child.tabId); close(); }}
                    >
                      {child.label}
                    </MenuItem>
                  ))}
                </HoverMenu>
              );
            })}

            {/* Divider + settings gear */}
            <div style={{ width: 1, height: 18, background: 'rgba(58,58,58,0.12)', margin: '0 8px' }} />
            <HoverMenu
              align="right"
              trigger={({ open }) => (
                <span
                  title={user?.email || 'Settings'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    color: open ? FR.slate : FR.stone,
                    background: open ? FR.sand : 'transparent',
                    cursor: 'pointer',
                    transition: 'color 160ms ease, background 160ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = FR.slate; }}
                  onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = FR.stone; }}
                >
                  <Settings size={15} strokeWidth={1.5} />
                </span>
              )}
            >
              {({ close }) => (
                <>
                  {SETTINGS_MENU.map((item, idx) => {
                    if (item.kind === 'link') {
                      return (
                        <MenuItem key={idx} to={item.to} onClick={close}>
                          {item.label}
                        </MenuItem>
                      );
                    }
                    if (item.kind === 'tab') {
                      return (
                        <MenuItem
                          key={idx}
                          active={state.activeTab === item.tabId}
                          onClick={() => { setTab(item.tabId); close(); }}
                        >
                          {item.label}
                        </MenuItem>
                      );
                    }
                    return (
                      <div key={idx}>
                        <div style={{ height: 1, background: 'rgba(58,58,58,0.08)', margin: '4px 6px' }} />
                        <MenuItem onClick={() => { close(); signOut(); }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <LogOut size={12} strokeWidth={1.5} /> {item.label}
                          </span>
                        </MenuItem>
                      </div>
                    );
                  })}
                </>
              )}
            </HoverMenu>
          </nav>
        </div>
      </div>
    </header>
  );
}
