import { useState, useEffect } from 'react';
import { ShoppingBag, BarChart3, CreditCard, Mail, Truck, CheckCircle, XCircle, Loader, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Copy } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { syncShopifyActuals, syncMetaActuals } from '../utils/liveDataSync';

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

// ─── Shopify ─────────────────────────────────────────────────────────────────
function ShopifyCard({ creds, onSave, onClear, dispatch }) {
  const [open, setOpen] = useState(!creds?.connected);
  const [domain, setDomain] = useState(creds?.domain || '');
  const [token, setToken] = useState(creds?.token || '');
  const [status, setStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [stats, setStats] = useState(creds?.stats || null);
  const [errMsg, setErrMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'ok' | 'error'
  const [syncErrMsg, setSyncErrMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function handleConnect(e) {
    e.preventDefault();
    setStatus('testing');
    setErrMsg('');
    try {
      const store = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const res = await fetch(`https://${store}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': token },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 401) throw new Error('401 Unauthorized — access token rejected. Check token + scopes.');
        if (res.status === 403) throw new Error('403 Forbidden — token missing required scopes (read_orders, read_products).');
        if (res.status === 404) throw new Error('404 Not Found — check store domain (must end in .myshopify.com).');
        throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 120)}` : ''}`);
      }
      const json = await res.json();
      const shopStats = { name: json.shop?.name, currency: json.shop?.currency, domain: json.shop?.myshopify_domain };
      setStats(shopStats);
      setStatus('ok');
      onSave({ domain: store, token, connected: true, stats: shopStats, syncedAt: null });
      setOpen(false);
    } catch (err) {
      setStatus('error');
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        setErrMsg(`CORS blocked. Add "${origin}" to the Allowed CORS origins in your Shopify custom app → see setup instructions below.`);
      } else {
        setErrMsg(err.message);
      }
    }
  }

  async function handleSync() {
    if (!creds?.connected) return;
    setSyncStatus('syncing');
    setSyncErrMsg('');
    try {
      const weeks = await syncShopifyActuals(creds);
      const currentWeek = weeks.find(w => w.isCurrent);
      if (!currentWeek) throw new Error('No current-week data returned');

      dispatch({
        type: 'UPDATE_SEED',
        payload: { revenue: currentWeek.revenue, date: currentWeek.startDate },
      });

      const syncedAt = new Date().toISOString();
      const lastSync = {
        syncedAt,
        currentWeekRevenue: currentWeek.revenue,
        currentWeekOrders: currentWeek.orders,
        weeks,
      };
      onSave({ ...creds, syncedAt, lastSync });
      setSyncStatus('ok');
    } catch (err) {
      setSyncStatus('error');
      setSyncErrMsg(err.message);
    }
  }

  function copyOrigin() {
    navigator.clipboard.writeText(origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
      onDisconnect={onClear}
    >
      {!creds?.connected && (
        <form onSubmit={handleConnect} className="space-y-3 mt-3">
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
          <div className="p-2 rounded-lg text-xs" style={{ background: FR.salt, border: `1px solid ${FR.sand}` }}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span style={{ color: FR.stone }}>Add this origin to your Shopify custom app:</span>
              <button type="button" onClick={copyOrigin}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: FR.sand, color: FR.slate, border: 'none', cursor: 'pointer' }}>
                <Copy size={10} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block font-mono text-[11px]" style={{ color: FR.slate }}>{origin}</code>
          </div>
          <details className="text-xs" style={{ color: FR.stone }}>
            <summary className="cursor-pointer select-none">Full setup instructions</summary>
            <ol className="mt-2 space-y-1 list-decimal pl-4">
              <li>Shopify Admin → Settings → Apps and sales channels → Develop apps</li>
              <li>Create an app → Configure <strong>Admin API</strong> scopes</li>
              <li>Enable: <code>read_orders</code>, <code>read_products</code>, <code>read_inventory</code>, <code>read_shopify_payments_payouts</code></li>
              <li>Under <strong>Admin API integration</strong> → <strong>Allowed CORS origins</strong>, paste: <code>{origin}</code></li>
              <li>Install app → reveal and copy the Admin API access token (starts with <code>shpat_</code>)</li>
              <li>Paste the token above and click Connect Shopify</li>
            </ol>
          </details>
          <StatusButton status={status} label="Connect Shopify" errMsg={errMsg} />
        </form>
      )}

      {creds?.connected && (
        <div className="space-y-2 mt-3">
          <div className="p-2 rounded-lg text-xs flex items-center justify-between" style={{ background: FR.salt }}>
            <span>Connected to <strong>{stats?.name || creds.domain}</strong>{stats?.currency ? ` (${stats.currency})` : ''}</span>
            {creds.syncedAt && (
              <span className="text-[10px]" style={{ color: FR.stone }}>Synced {formatSyncedAt(creds.syncedAt)}</span>
            )}
          </div>

          {creds.lastSync && (
            <div className="p-2 rounded-lg text-xs" style={{ background: 'white', border: `1px solid ${FR.sand}` }}>
              <div className="flex justify-between mb-1" style={{ color: FR.stone }}>
                <span>This week's revenue</span>
                <strong style={{ color: FR.slate }}>${creds.lastSync.currentWeekRevenue?.toFixed(2) ?? '—'}</strong>
              </div>
              <div className="flex justify-between" style={{ color: FR.stone }}>
                <span>Orders</span>
                <strong style={{ color: FR.slate }}>{creds.lastSync.currentWeekOrders ?? '—'}</strong>
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

// ─── Banking ──────────────────────────────────────────────────────────────────
function BankingCard() {
  return (
    <IntegrationCard
      name="Banking (Chase / AMEX)"
      description="Cash balance, transactions, credit card statements"
      icon={CreditCard}
      iconColor={FR.sienna}
      connected={false}
      open={false}
      onToggle={() => {}}
    >
      <p className="text-xs mt-3" style={{ color: FR.stone }}>
        Bank connections via Plaid require a server-side backend. Enter your cash balance manually in the
        Seed Data section of the Dashboard for now. Full Plaid integration will be added when a backend is set up.
      </p>
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

  function update(key, data) {
    const next = data ? { ...creds, [key]: data } : (() => { const c = { ...creds }; delete c[key]; return c; })();
    setCreds(next);
    saveCredentials(next);
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
        <BankingCard />

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
