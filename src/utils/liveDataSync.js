// Live data sync utilities — Shopify, Meta Ads, Mercury

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** Returns array of 13 week objects, oldest first (week -12 through week 0 = current). */
export function getPast13Weeks() {
  const today = new Date();
  const day = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  currentMonday.setHours(0, 0, 0, 0);

  const weeks = [];
  for (let i = 12; i >= 0; i--) {
    const start = new Date(currentMonday);
    start.setDate(currentMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    weeks.push({
      index: 12 - i,
      weekOffset: -i,
      isCurrent: i === 0,
      startDate: toISO(start),
      endDate: toISO(end),
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return weeks;
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Shopify ──────────────────────────────────────────────────────────────────
/**
 * Fetches order totals for each of the past 13 weeks from the Shopify Admin API.
 * Requires a custom app with this origin added as an allowed CORS origin.
 * Returns an array of { startDate, endDate, label, revenue, orders } objects.
 */
export async function syncShopifyActuals(creds) {
  if (!creds?.connected || !creds.domain || !creds.token) {
    throw new Error('Shopify not connected');
  }

  const weeks = getPast13Weeks();
  const store = creds.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = creds.token;

  // Pull all paid/partially-paid orders created in the 13-week window in one call
  const since = weeks[0].startISO;
  const url = `https://${store}/admin/api/2024-01/orders.json?created_at_min=${since}&status=any&financial_status=paid,partially_paid&fields=total_price,created_at&limit=250`;

  let orders = [];
  try {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    orders = json.orders || [];
  } catch (err) {
    const msg = err.message.includes('Failed to fetch')
      ? 'CORS blocked — enable this origin in your Shopify custom app settings'
      : err.message;
    throw new Error(msg);
  }

  return weeks.map(week => {
    const weekOrders = orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= new Date(week.startISO) && d <= new Date(week.endISO);
    });
    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      revenue: Math.round(weekOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0) * 100) / 100,
      orders: weekOrders.length,
    };
  });
}

// ─── Meta Ads ─────────────────────────────────────────────────────────────────
/**
 * Fetches weekly ad spend from the Meta Graph API for the past 13 weeks.
 * Returns an array of { startDate, endDate, label, adSpend, impressions, clicks }.
 */
export async function syncMetaActuals(creds) {
  if (!creds?.connected || !creds.accountId || !creds.token) {
    throw new Error('Meta Ads not connected');
  }

  const weeks = getPast13Weeks();
  const accountId = creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`;
  const token = creds.token;

  const since = weeks[0].startDate;
  const until = weeks[12].endDate;

  const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=spend,impressions,clicks&time_increment=7&time_range[since]=${since}&time_range[until]=${until}&access_token=${token}`;

  let data = [];
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    data = json.data || [];
  } catch (err) {
    throw new Error(err.message);
  }

  return weeks.map(week => {
    const match = data.find(d => d.date_start >= week.startDate && d.date_start <= week.endDate);
    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      adSpend: match ? Math.round(parseFloat(match.spend || 0) * 100) / 100 : 0,
      impressions: match ? parseInt(match.impressions || 0) : 0,
      clicks: match ? parseInt(match.clicks || 0) : 0,
    };
  });
}

// ─── Mercury ──────────────────────────────────────────────────────────────────
/**
 * Fetches account balances and recent transactions from the Mercury API.
 * Returns { accounts, transactions, primaryBalance }.
 */
export async function syncMercuryActuals(creds) {
  if (!creds?.connected || !creds.apiKey) {
    throw new Error('Mercury not connected');
  }

  const headers = {
    Authorization: `Bearer ${creds.apiKey}`,
    'Content-Type': 'application/json',
  };

  let accounts = [];
  try {
    const res = await fetch('https://app.mercury.com/api/treasury/v1/accounts', { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mercury ${res.status}: ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    accounts = json.accounts || [];
  } catch (err) {
    const msg = err.message.includes('Failed to fetch')
      ? 'CORS blocked — Mercury API requires server-side access. Enter balance manually.'
      : err.message;
    throw new Error(msg);
  }

  // Sum all checking/savings balances
  const primaryBalance = accounts
    .filter(a => a.status === 'active' && ['checking', 'savings'].includes(a.kind))
    .reduce((sum, a) => sum + (a.currentBalance || 0), 0);

  // Try to get transactions for the primary account (last 90 days)
  let transactions = [];
  if (accounts.length > 0) {
    const primaryId = accounts[0].id;
    const since = getPast13Weeks()[0].startDate;
    try {
      const res = await fetch(
        `https://app.mercury.com/api/treasury/v1/account/${primaryId}/transactions?limit=500&start=${since}`,
        { headers },
      );
      if (res.ok) {
        const json = await res.json();
        transactions = json.transactions || [];
      }
    } catch {
      // Transactions optional — balance is the important part
    }
  }

  return { accounts, transactions, primaryBalance };
}

// ─── Merge into seed update ───────────────────────────────────────────────────
/**
 * Builds a seed data update object from synced API data.
 * Pass null for any source that wasn't synced.
 */
export function buildSeedUpdate(shopifyWeeks, metaWeeks, mercuryData) {
  const update = {};

  // Mercury → current cash
  if (mercuryData?.primaryBalance != null) {
    update.totalCash = Math.round(mercuryData.primaryBalance * 100) / 100;
    update.sbMain = Math.round(mercuryData.primaryBalance * 100) / 100;
  }

  // Shopify current week → revenue + orders
  if (shopifyWeeks) {
    const currentWeek = shopifyWeeks.find(w => w.isCurrent);
    if (currentWeek) {
      update.revenue = currentWeek.revenue;
    }
  }

  // Meta current week → ad spend
  if (metaWeeks) {
    const currentWeek = metaWeeks.find(w => w.isCurrent);
    if (currentWeek) {
      update.adSpend = currentWeek.adSpend;
    }
  }

  return update;
}

// ─── Merge historical actuals ─────────────────────────────────────────────────
/**
 * Merges Shopify + Meta weekly arrays into a unified actualWeeks array.
 * Each entry: { startDate, endDate, label, isCurrent, revenue, adSpend, orders }
 */
export function mergeActualWeeks(shopifyWeeks, metaWeeks) {
  const weeks = getPast13Weeks();

  return weeks.map(week => {
    const sh = shopifyWeeks?.find(w => w.startDate === week.startDate);
    const me = metaWeeks?.find(w => w.startDate === week.startDate);

    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      revenue: sh?.revenue ?? null,
      orders: sh?.orders ?? null,
      adSpend: me?.adSpend ?? null,
      impressions: me?.impressions ?? null,
      clicks: me?.clicks ?? null,
    };
  });
}
