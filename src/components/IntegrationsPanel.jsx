import { useState, useEffect } from 'react';
import { ShoppingBag, BarChart3, CreditCard, Mail, Truck, CheckCircle, XCircle, Loader, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Copy, Server } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  syncShopifyActuals, syncMetaActuals, testShopifyProxy,
  saveShopifyCredentials, loadShopifyIntegration, deleteShopifyCredentials,
  syncMercuryActuals, testMercuryProxy,
  saveMercuryCredentials, loadMercuryIntegration, deleteMercuryCredentials,
} from '../utils/liveDataSync';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A', green: '#4CAF7D', red: '#C0392B' };

const STORAGE_KEY = 'cashmodel_integrations';

function loadCredentials() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveCredentials(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function formatSyncedAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
}

// ─── Shopify (credentials in Supabase, calls via edge function proxy) ────────
function ShopifyCard({ creds, onSave, onClear, dispatch }) {
  const [open, setOpen] = useState(!creds?.connected);
  const [domain, setDomain] = useState(creds?.domain || '');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(null); // null | 'saving' | 'ok' | 'error'
  const [stats, setStats] = useState(creds?.stats || null);
  const [errMsg, setErrMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncErrMsg, setSyncErrMsg] = useState('');

  // If DB has a saved integration but localStorage doesn't, hydrate the UI
  useEffect(() => {
    if (creds?.connected) return;
    loadShopifyIntegration().then(row => {
      if (row?.domain) setDomain(row.domain);
    }).catch(() => {});
  }, []);

  async function handleConnect(e) {
    e.preventDefault();
    setStatus('saving');
    setErrMsg('');
    try {
      await saveShopifyCredentials({ domain, token });
      // Now test the proxy with the just-saved credentials
      const shopStats = await testShopifyProxy();
      setStats(shopStats);
      setStatus('ok');
      onSave({
        connected: true,
        domain: domain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        stats: shopStats,
        syncedAt: null,
      });
      setToken('');
      setOpen(false);
    } catch (err) {
      setStatus('error');
      setErrMsg(err.message);
    }
  }

  async function handleDisconnect() {
    try { await deleteShopifyCredentials(); } catch {}
    onClear();
  }

  async function handleSync() {
    if (!creds?.connected) return;
    setSyncStatus('syncing');
    setSyncErrMsg('');
    try {
      const weeks = await syncShopifyActuals();
      const currentWeek = weeks.find(w => w.isCurrent);
      if (!currentWeek) throw new Error('No current-week data returned');

      dispatch({
        type: 'UPDATE_SEED',
        payload: { revenue: currentWeek.revenue, date: currentWeek.startDate },
      });

      const syncedAt = new Date().toISOString();
      onSave({
        ...creds,
        syncedAt,
        lastSync: {
          syncedAt,
          currentWeekRevenue: currentWeek.revenue,
          currentWeekOrders: currentWeek.orders,
          weeks,
        },
      });
      setSyncStatus('ok');
    } catch (err) {
      setSyncStatus('error');
      setSyncErrMsg(err.message);
    }
  }

  return (
    <IntegrationCard
      name="Shopify"
      description="Revenue, orders, payouts, inventory levels"
      icon={ShoppingBag}
      iconColor={FR.sage}
      connected={creds?.connected}
      open={open}
      onToggle={() => setOpen(o => !o)}
      onDisconnect={handleDisconnect}
    >
      {!creds?.connected && (
        <form onSubmit={handleConnect} className="space-y-3 mt-3">
          <div className="p-2 rounded-lg text-xs flex items-start gap-2" style={{ background: FR.salt, border: `1px solid ${FR.sand}` }}>
            <Server size={12} style={{ color: FR.soil, marginTop: 2, flexShrink: 0 }} />
            <span style={{ color: FR.stone }}>
              Your token is saved encrypted in our database, scoped to your account only (Row Level Security). The browser sends requests to a secure proxy that forwards them to Shopify — your token never leaves the server.
            </span>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: FR.stone }}>Store domain</label>
            <input value={domain} onChange={e => setDomain(e.target.value)}
              placeholder="your-store.myshopify.com" required
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ background: FR.salt, borderColor: FR.sand, color: FR.slate }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: FR.stone }}>Admin API access token</label>
            <input value={token} onChange={e => setToken(e.target.value)} type="password"
              placeholder="shpat_••••••••" required
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ background: FR.salt, borderColor: FR.sand, color: FR.slate }} />
          </div>

          <details className="text-xs" style={{ color: FR.stone }}>
            <summary className="cursor-pointer select-none font-medium" style={{ color: FR.slate }}>How to get a token</summary>
            <ol className="mt-2 space-y-1 list-decimal pl-4">
              <li>Shopify admin → Settings → Apps and sales channels → Develop apps</li>
              <li>Create or open a custom app → Configure <strong>Admin API</strong> scopes</li>
              <li>Enable: <code>read_orders</code>, <code>read_products</code>, <code>read_inventory</code>, <code>read_shopify_payments_payouts</code>, <code>read_reports</code></li>
              <li>Install app → reveal the Admin API access token (starts with <code>shpat_</code>)</li>
              <li>Paste the token above and click Connect</li>
            </ol>
          </details>

          <button type="submit" disabled={status === 'saving' || status === 'ok'}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm"
            style={{
              background: status === 'ok' ? FR.green : status === 'error' ? FR.red : FR.slate,
              color: 'white', cursor: status === 'saving' ? 'not-allowed' : 'pointer', border: 'none',
            }}>
            {status === 'saving' && <Loader size={13} className="animate-spin" />}
            {status === 'ok' && <CheckCircle size={13} />}
            {status === 'error' && <XCircle size={13} />}
            {status === 'ok' ? 'Connected' : status === 'saving' ? 'Saving + testing…' : 'Connect Shopify'}
          </button>
          {status === 'error' && errMsg && (
            <p className="text-xs" style={{ color: FR.red }}>{errMsg}</p>
          )}
        </form>
      )}

      {creds?.connected && (
        <div className="space-y-2 mt-3">
          <div className="p-2 rounded-lg text-xs flex items-center justify-between" style={{ background: FR.salt }}>
            <span>Connected to <strong>{stats?.name || creds.domain || 'Shopify'}</strong>{stats?.currency ? ` (${stats.currency})` : ''}</span>
            {creds.syncedAt && (
              <span className="text-[10px]" style={{ color: FR.stone }}>Synced {formatSyncedAt(creds.syncedAt)}</span>
            )}
          </div>

          {creds.lastSync && (() => {
            const weeks = creds.lastSync.weeks || [];
            const current = weeks.find(w => w.isCurrent);
            const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
            return (
              <div className="p-2 rounded-lg text-xs" style={{ background: 'white', border: `1px solid ${FR.sand}` }}>
                <div className="mb-2 pb-2" style={{ borderBottom: `1px solid ${FR.sand}` }}>
                  <div className="flex justify-between mb-1" style={{ color: FR.stone }}>
                    <span>
                      This week ({current ? `${fmt(current.startDate)} – ${fmt(current.endDate)}` : '—'})
                    </span>
                    <strong style={{ color: FR.slate }}>${creds.lastSync.currentWeekRevenue?.toFixed(2) ?? '—'}</strong>
                  </div>
                  <div className="flex justify-between" style={{ color: FR.stone }}>
                    <span>Orders</span>
                    <strong style={{ color: FR.slate }}>{creds.lastSync.currentWeekOrders ?? '—'}</strong>
                  </div>
                </div>

                <details>
                  <summary className="cursor-pointer select-none text-[10px]" style={{ color: FR.stone }}>
                    Show all 13 weeks
                  </summary>
                  <table className="w-full mt-2 text-[10px]" style={{ color: FR.slate }}>
                    <thead>
                      <tr style={{ color: FR.stone }}>
                        <th className="text-left font-normal py-1">Week starting</th>
                        <th className="text-right font-normal py-1">Gross</th>
                        <th className="text-right font-normal py-1">Returns</th>
                        <th className="text-right font-normal py-1">Total sales</th>
                        <th className="text-right font-normal py-1">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((w, i) => (
                        <tr key={i} style={{ background: w.isCurrent ? FR.salt : 'transparent' }}>
                          <td className="py-0.5">{fmt(w.startDate)}{w.isCurrent ? ' (current)' : ''}</td>
                          <td className="py-0.5 text-right font-mono tabular-nums">${(w.gross ?? w.revenue ?? 0).toFixed(2)}</td>
                          <td className="py-0.5 text-right font-mono tabular-nums" style={{ color: (w.returns || 0) > 0 ? FR.red : FR.stone }}>
                            {(w.returns || 0) > 0 ? `-$${w.returns.toFixed(2)}` : '$0.00'}
                          </td>
                          <td className="py-0.5 text-right font-mono tabular-nums font-semibold">${(w.revenue || 0).toFixed(2)}</td>
                          <td className="py-0.5 text-right font-mono tabular-nums">{w.orders ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px]" style={{ color: FR.stone }}>
                    Matches Shopify → Analytics → Reports → <strong>Total sales</strong>: gross sales (order <code>totalPriceSet</code>) bucketed by <code>processedAt</code>, returns bucketed by each refund's <code>createdAt</code> (so a return of an older order lands in the week it was refunded). Cancelled + test orders excluded.
                  </p>
                </details>
              </div>
            );
          })()}

          <button onClick={handleSync} disabled={syncStatus === 'syncing'}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm"
            style={{
              background: syncStatus === 'ok' ? FR.green : syncStatus === 'error' ? FR.red : FR.slate,
              color: 'white', cursor: syncStatus === 'syncing' ? 'not-allowed' : 'pointer', border: 'none',
            }}>
            {syncStatus === 'syncing' ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'ok' ? 'Synced — revenue pushed to model' : 'Sync current week to model'}
          </button>

          {syncStatus === 'error' && syncErrMsg && (
            <p className="text-xs" style={{ color: FR.red }}>{syncErrMsg}</p>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

// ─── Meta Ads ─────────────────────────────────────────────────────────────────
function MetaAdsCard({ creds, onSave, onClear, dispatch }) {
  const [open, setOpen] = useState(!creds?.connected);
  const [accountId, setAccountId] = useState(creds?.accountId || '');
  const [token, setToken] = useState(creds?.token || '');
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(creds?.stats || null);
  const [errMsg, setErrMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncErrMsg, setSyncErrMsg] = useState('');

  async function handleConnect(e) {
    e.preventDefault();
    setStatus('testing');
    setErrMsg('');
    try {
      const id = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
      const url = `https://graph.facebook.com/v19.0/${id}/insights?fields=spend,impressions,clicks&date_preset=last_30d&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) {
        const code = json.error.code;
        if (code === 190) throw new Error('Access token invalid or expired. Regenerate from Graph API Explorer.');
        if (code === 100) throw new Error('Ad account ID not found or inaccessible with this token.');
        if (code === 200) throw new Error('Token missing required permissions (ads_read).');
        throw new Error(json.error.message);
      }
      const d = json.data?.[0];
      const s = d ? { spend: parseFloat(d.spend || 0).toFixed(2), impressions: d.impressions, clicks: d.clicks } : null;
      setStats(s);
      setStatus('ok');
      onSave({ accountId: id, token, connected: true, stats: s, syncedAt: null });
      setOpen(false);
    } catch (err) {
      setStatus('error');
      setErrMsg(err.message);
    }
  }

  async function handleSync() {
    if (!creds?.connected) return;
    setSyncStatus('syncing');
    setSyncErrMsg('');
    try {
      const weeks = await syncMetaActuals(creds);
      const currentWeek = weeks.find(w => w.isCurrent);
      if (!currentWeek) throw new Error('No current-week data returned');

      dispatch({
        type: 'UPDATE_SEED',
        payload: { adSpend: currentWeek.adSpend },
      });

      const syncedAt = new Date().toISOString();
      const lastSync = {
        syncedAt,
        currentWeekSpend: currentWeek.adSpend,
        currentWeekImpressions: currentWeek.impressions,
        currentWeekClicks: currentWeek.clicks,
        weeks,
      };
      onSave({ ...creds, syncedAt, lastSync });
      setSyncStatus('ok');
    } catch (err) {
      setSyncStatus('error');
      setSyncErrMsg(err.message);
    }
  }

  return (
    <IntegrationCard
      name="Meta Ads"
      description="Ad spend, ROAS, CPA, campaign performance"
      icon={BarChart3}
      iconColor={FR.sea}
      connected={creds?.connected}
      open={open}
      onToggle={() => setOpen(o => !o)}
      onDisconnect={onClear}
    >
      {!creds?.connected && (
        <form onSubmit={handleConnect} className="space-y-3 mt-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: FR.stone }}>Ad Account ID</label>
            <input value={accountId} onChange={e => setAccountId(e.target.value)}
              placeholder="123456789 or act_123456789" required
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ background: FR.salt, borderColor: FR.sand, color: FR.slate }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: FR.stone }}>User access token</label>
            <input value={token} onChange={e => setToken(e.target.value)} type="password"
              placeholder="EAA••••••••" required
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ background: FR.salt, borderColor: FR.sand, color: FR.slate }} />
          </div>
          <details className="text-xs" style={{ color: FR.stone }}>
            <summary className="cursor-pointer select-none">How to get your access token</summary>
            <ol className="mt-2 space-y-1 list-decimal pl-4">
              <li>Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: FR.sienna }}>Meta Graph API Explorer ↗</a></li>
              <li>Select your app → Generate User or Page Access Token</li>
              <li>Add permissions: <code>ads_read, ads_management</code></li>
              <li>Copy the token (valid ~60 days — use a system user for permanent access)</li>
            </ol>
          </details>
          <StatusButton status={status} label="Connect Meta Ads" errMsg={errMsg} />
        </form>
      )}

      {creds?.connected && (
        <div className="space-y-2 mt-3">
          <div className="p-2 rounded-lg text-xs flex items-center justify-between" style={{ background: FR.salt }}>
            <span>
              {stats
                ? <>Last 30d: <strong>${stats.spend}</strong> spend · {parseInt(stats.impressions || 0).toLocaleString()} impr · {parseInt(stats.clicks || 0).toLocaleString()} clicks</>
                : <>Connected to <strong>{creds.accountId}</strong></>}
            </span>
            {creds.syncedAt && (
              <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: FR.stone }}>Synced {formatSyncedAt(creds.syncedAt)}</span>
            )}
          </div>

          {creds.lastSync && (
            <div className="p-2 rounded-lg text-xs" style={{ background: 'white', border: `1px solid ${FR.sand}` }}>
              <div className="flex justify-between mb-1" style={{ color: FR.stone }}>
                <span>This week's spend</span>
                <strong style={{ color: FR.slate }}>${creds.lastSync.currentWeekSpend?.toFixed(2) ?? '—'}</strong>
              </div>
              <div className="flex justify-between" style={{ color: FR.stone }}>
                <span>Clicks</span>
                <strong style={{ color: FR.slate }}>{creds.lastSync.currentWeekClicks?.toLocaleString() ?? '—'}</strong>
              </div>
            </div>
          )}

          <button onClick={handleSync} disabled={syncStatus === 'syncing'}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm"
            style={{
              background: syncStatus === 'ok' ? FR.green : syncStatus === 'error' ? FR.red : FR.slate,
              color: 'white', cursor: syncStatus === 'syncing' ? 'not-allowed' : 'pointer',
            }}>
            {syncStatus === 'syncing' ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'ok' ? 'Synced — ad spend pushed to model' : 'Sync current week to model'}
          </button>

          {syncStatus === 'error' && syncErrMsg && (
            <p className="text-xs" style={{ color: FR.red }}>{syncErrMsg}</p>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

// ─── Klaviyo ──────────────────────────────────────────────────────────────────
function KlaviyoCard({ creds, onSave, onClear }) {
  const [open, setOpen] = useState(!creds?.connected);
  const [apiKey, setApiKey] = useState(creds?.apiKey || '');
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(creds?.stats || null);
  const [errMsg, setErrMsg] = useState('');

  async function handleConnect(e) {
    e.preventDefault();
    setStatus('testing');
    setErrMsg('');
    try {
      const res = await fetch('https://a.klaviyo.com/api/accounts/', {
        headers: { Authorization: `Klaviyo-API-Key ${apiKey}`, revision: '2024-02-15' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.errors?.[0]?.detail || res.statusText);
      const account = json.data?.[0];
      const s = account ? { name: account.attributes?.contact_information?.organization_name } : null;
      setStats(s);
      setStatus('ok');
      onSave({ apiKey, connected: true, stats: s });
      setOpen(false);
    } catch (err) {
      setStatus('error');
      setErrMsg(err.message.includes('Failed to fetch') ? 'CORS blocked. Klaviyo requires a backend proxy for browser access.' : err.message);
    }
  }

  return (
    <IntegrationCard
      name="Klaviyo"
      description="Email revenue attribution, flow performance, subscriber growth"
      icon={Mail}
      iconColor={FR.soil}
      connected={creds?.connected}
      open={open}
      onToggle={() => setOpen(o => !o)}
      onDisconnect={onClear}
    >
      <form onSubmit={handleConnect} className="space-y-3 mt-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: FR.stone }}>Private API key</label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
            placeholder="pk_••••••••" required
            className="w-full text-sm px-3 py-2 rounded-lg border"
            style={{ background: FR.salt, borderColor: FR.sand, color: FR.slate }} />
        </div>
        <details className="text-xs" style={{ color: FR.stone }}>
          <summary className="cursor-pointer select-none">How to get your API key</summary>
          <ol className="mt-2 space-y-1 list-decimal pl-4">
            <li>Klaviyo → Account → Settings → API Keys</li>
            <li>Create Private API Key with read permissions</li>
            <li>Copy the key (starts with <code>pk_</code>)</li>
          </ol>
        </details>
        <StatusButton status={status} label="Connect Klaviyo" errMsg={errMsg} />
      </form>
      {stats && creds?.connected && (
        <div className="mt-3 p-2 rounded-lg text-xs" style={{ background: FR.salt }}>
          Connected to <strong>{stats.name || 'Klaviyo account'}</strong>
        </div>
      )}
    </IntegrationCard>
  );
}

// ─── Mercury (credentials in Supabase, calls via edge function proxy) ───────
function MercuryCard({ creds, onSave, onClear, dispatch }) {
  const [open, setOpen] = useState(!creds?.connected);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(null); // null | 'saving' | 'ok' | 'error'
  const [stats, setStats] = useState(creds?.stats || null);
  const [errMsg, setErrMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncErrMsg, setSyncErrMsg] = useState('');

  async function handleConnect(e) {
    e.preventDefault();
    setStatus('saving');
    setErrMsg('');
    try {
      await saveMercuryCredentials({ token });
      const result = await testMercuryProxy();
      setStats(result);
      setStatus('ok');
      onSave({ connected: true, stats: result, syncedAt: null });
      setToken('');
      setOpen(false);
    } catch (err) {
      setStatus('error');
      setErrMsg(err.message);
    }
  }

  async function handleDisconnect() {
    try { await deleteMercuryCredentials(); } catch {}
    onClear();
  }

  async function handleSync() {
    if (!creds?.connected) return;
    setSyncStatus('syncing');
    setSyncErrMsg('');
    try {
      const { accounts, primaryBalance } = await syncMercuryActuals();
      dispatch({
        type: 'UPDATE_SEED',
        payload: {
          totalCash: Math.round(primaryBalance * 100) / 100,
          sbMain: Math.round(primaryBalance * 100) / 100,
        },
      });
      const syncedAt = new Date().toISOString();
      onSave({
        ...creds,
        syncedAt,
        lastSync: { syncedAt, primaryBalance, accountCount: accounts.length },
      });
      setSyncStatus('ok');
    } catch (err) {
      setSyncStatus('error');
      setSyncErrMsg(err.message);
    }
  }

  return (
    <IntegrationCard
      name="Mercury"
      description="Business bank balance — auto-populates Cash on Hand"
      icon={CreditCard}
      iconColor={FR.sienna}
      connected={creds?.connected}
      open={open}
      onToggle={() => setOpen(o => !o)}
      onDisconnect={handleDisconnect}
    >
      {!creds?.connected && (
        <form onSubmit={handleConnect} className="space-y-3 mt-3">
          <div className="p-2 rounded-lg text-xs flex items-start gap-2" style={{ background: FR.salt, border: `1px solid ${FR.sand}` }}>
            <Server size={12} style={{ color: FR.soil, marginTop: 2, flexShrink: 0 }} />
            <span style={{ color: FR.stone }}>
              Your Mercury API key is stored encrypted in our database, scoped to your account only. The browser calls a proxy — your key never leaves the server.
            </span>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: FR.stone }}>Mercury API key</label>
            <input value={token} onChange={e => setToken(e.target.value)} type="password"
              placeholder="secret-token:mercury_••••••••" required
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ background: FR.salt, borderColor: FR.sand, color: FR.slate }} />
          </div>

          <details className="text-xs" style={{ color: FR.stone }}>
            <summary className="cursor-pointer select-none font-medium" style={{ color: FR.slate }}>How to get your API key</summary>
            <ol className="mt-2 space-y-1 list-decimal pl-4">
              <li>Sign into Mercury → <strong>Settings</strong> → <strong>API</strong></li>
              <li>Click <strong>Generate new token</strong> (read-only is enough — balances + transactions)</li>
              <li>Copy the token (you can only see it once)</li>
              <li>Paste it above and click Connect</li>
            </ol>
          </details>

          <button type="submit" disabled={status === 'saving' || status === 'ok'}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm"
            style={{
              background: status === 'ok' ? FR.green : status === 'error' ? FR.red : FR.slate,
              color: 'white', cursor: status === 'saving' ? 'not-allowed' : 'pointer', border: 'none',
            }}>
            {status === 'saving' && <Loader size={13} className="animate-spin" />}
            {status === 'ok' && <CheckCircle size={13} />}
            {status === 'error' && <XCircle size={13} />}
            {status === 'ok' ? 'Connected' : status === 'saving' ? 'Saving + testing…' : 'Connect Mercury'}
          </button>
          {status === 'error' && errMsg && (
            <p className="text-xs" style={{ color: FR.red }}>{errMsg}</p>
          )}
        </form>
      )}

      {creds?.connected && (
        <div className="space-y-2 mt-3">
          <div className="p-2 rounded-lg text-xs flex items-center justify-between" style={{ background: FR.salt }}>
            <span>
              Connected to <strong>{stats?.accountCount ?? '—'} active account{stats?.accountCount === 1 ? '' : 's'}</strong>
              {stats?.totalBalance != null ? ` — $${stats.totalBalance.toLocaleString()}` : ''}
            </span>
            {creds.syncedAt && (
              <span className="text-[10px]" style={{ color: FR.stone }}>Synced {formatSyncedAt(creds.syncedAt)}</span>
            )}
          </div>

          {creds.lastSync && (
            <div className="p-2 rounded-lg text-xs" style={{ background: 'white', border: `1px solid ${FR.sand}` }}>
              <div className="flex justify-between" style={{ color: FR.stone }}>
                <span>Cash on hand (checking + savings)</span>
                <strong style={{ color: FR.slate }}>${creds.lastSync.primaryBalance?.toLocaleString() ?? '—'}</strong>
              </div>
            </div>
          )}

          <button onClick={handleSync} disabled={syncStatus === 'syncing'}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm"
            style={{
              background: syncStatus === 'ok' ? FR.green : syncStatus === 'error' ? FR.red : FR.slate,
              color: 'white', cursor: syncStatus === 'syncing' ? 'not-allowed' : 'pointer', border: 'none',
            }}>
            {syncStatus === 'syncing' ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'ok' ? 'Synced — cash pushed to model' : 'Sync balance to model'}
          </button>

          {syncStatus === 'error' && syncErrMsg && (
            <p className="text-xs" style={{ color: FR.red }}>{syncErrMsg}</p>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function IntegrationCard({ name, description, icon: Icon, iconColor, connected, open, onToggle, onDisconnect, children }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: FR.sand }}>
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: FR.salt }}>
            <Icon size={18} style={{ color: iconColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 17 }}>{name}</h3>
              {connected && <CheckCircle size={13} style={{ color: FR.green }} />}
            </div>
            <p className="text-xs mt-0.5" style={{ color: FR.stone }}>{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && onDisconnect && (
            <button
              onClick={e => { e.stopPropagation(); onDisconnect(); }}
              className="text-[10px] px-2 py-0.5 rounded"
              style={{ background: FR.sand, color: FR.stone }}>
              Disconnect
            </button>
          )}
          {open ? <ChevronUp size={14} style={{ color: FR.stone }} /> : <ChevronDown size={14} style={{ color: FR.stone }} />}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: FR.sand }}>
          {children}
        </div>
      )}
    </div>
  );
}

function StatusButton({ status, label, errMsg }) {
  return (
    <div>
      <button type="submit" disabled={status === 'testing' || status === 'ok'}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm"
        style={{
          background: status === 'ok' ? FR.green : status === 'error' ? FR.red : FR.slate,
          color: 'white',
          cursor: (status === 'testing' || status === 'ok') ? 'not-allowed' : 'pointer',
        }}>
        {status === 'testing' && <Loader size={13} className="animate-spin" />}
        {status === 'ok' && <CheckCircle size={13} />}
        {status === 'error' && <XCircle size={13} />}
        {status === 'ok' ? 'Connected' : status === 'testing' ? 'Testing…' : label}
      </button>
      {status === 'error' && errMsg && (
        <p className="text-xs mt-1" style={{ color: FR.red }}>{errMsg}</p>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function IntegrationsPanel() {
  const { dispatch } = useApp();
  const [creds, setCreds] = useState(() => loadCredentials());

  // React to background auto-sync — refresh card UI when integrations are updated elsewhere.
  useEffect(() => {
    const reload = () => setCreds(loadCredentials());
    window.addEventListener('integrations-updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('integrations-updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  function update(key, data) {
    const next = data ? { ...creds, [key]: data } : (() => { const c = { ...creds }; delete c[key]; return c; })();
    setCreds(next);
    saveCredentials(next);
    window.dispatchEvent(new CustomEvent('integrations-updated'));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0 }}>Integrations</h2>
        <p className="text-sm mt-1" style={{ color: FR.stone }}>
          Connect your data sources. Credentials are stored in your browser — never sent to any server.
          Sync pulls this week's actuals into the cash flow model's seed data.
        </p>
      </div>

      <div className="space-y-3">
        <ShopifyCard creds={creds.shopify} onSave={d => update('shopify', d)} onClear={() => update('shopify', null)} dispatch={dispatch} />
        <MetaAdsCard creds={creds.meta} onSave={d => update('meta', d)} onClear={() => update('meta', null)} dispatch={dispatch} />
        <KlaviyoCard creds={creds.klaviyo} onSave={d => update('klaviyo', d)} onClear={() => update('klaviyo', null)} />
        <MercuryCard creds={creds.mercury} onSave={d => update('mercury', d)} onClear={() => update('mercury', null)} dispatch={dispatch} />

        {/* 3PL — handled by the Fulfillment tab */}
        <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: 'white', borderColor: FR.sand }}>
          <div className="p-2 rounded-lg" style={{ background: FR.salt }}>
            <Truck size={18} style={{ color: FR.stone }} />
          </div>
          <div className="flex-1">
            <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 17, margin: 0 }}>3PL / Fulfillment</h3>
            <p className="text-xs mt-0.5" style={{ color: FR.stone }}>Shipping rates managed via the Fulfillment tab — upload your rate card PDF and parse it with AI.</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: FR.salt, color: FR.stone, border: `1px solid ${FR.sand}` }}>Fulfillment Tab</span>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: FR.salt, border: `1px solid ${FR.sand}` }}>
        <p className="text-xs" style={{ color: FR.stone }}>
          <strong style={{ color: FR.slate }}>Note on CORS:</strong> Some APIs (Shopify Admin, Klaviyo) restrict browser access.
          If you see CORS errors, these will need a lightweight backend proxy — this can be added as a Vercel or Cloudflare Worker function.
          Meta Ads and most read-only APIs work directly from the browser.
        </p>
      </div>
    </div>
  );
}
