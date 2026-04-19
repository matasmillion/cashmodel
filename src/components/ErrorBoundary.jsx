// Last-resort error boundary. Any runtime error thrown during render
// unmounts React silently and leaves a blank page; this catches the
// error so we can surface something actionable instead.

import { Component } from 'react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B' };

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  resetLocalState = () => {
    try {
      // Preserve auth session, clear app state + PLM caches so a bad
      // migration-era record can't keep crashing on reload.
      Object.keys(localStorage).forEach(k => {
        if (k === 'cashmodel_state' || k === 'cashmodel_techpacks' || k === 'cashmodel_component_packs') {
          localStorage.removeItem(k);
        }
      });
      window.location.hash = '';
      window.location.reload();
    } catch (e) { console.error(e); }
  };

  goHome = () => {
    window.location.hash = '#dashboard';
    this.setState({ error: null, info: null });
    setTimeout(() => window.location.reload(), 50);
  };

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error?.message || String(this.state.error);
    const stack = this.state.error?.stack || '';
    return (
      <div style={{ minHeight: '100vh', background: FR.salt, padding: 40, fontFamily: "'Helvetica Neue', sans-serif", color: FR.slate }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: FR.stone, fontWeight: 600 }}>FOREIGN RESOURCE CO.</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 32, margin: '12px 0 8px', fontWeight: 400 }}>
            Something broke.
          </h1>
          <p style={{ color: FR.stone, fontSize: 13, marginBottom: 20 }}>
            The app crashed while rendering. The details below will help pinpoint the cause. This usually happens when a stored record is missing a newer field, or when a very large image is loaded into the preview.
          </p>

          <div style={{ background: 'white', border: `1px solid ${FR.sand}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Error</div>
            <div style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12, color: '#C0392B', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
            {stack && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11, color: FR.stone, cursor: 'pointer' }}>Stack trace</summary>
                <pre style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 10, color: FR.stone, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '8px 0 0' }}>{stack}</pre>
              </details>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={this.goHome}
              style={{ padding: '9px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Back to dashboard
            </button>
            <button onClick={this.resetLocalState}
              style={{ padding: '9px 18px', background: 'white', color: FR.slate, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Clear local data &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
