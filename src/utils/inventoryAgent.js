// Inventory agent — read-only Claude API client for the inventory module.
//
// The agent answers operator questions by calling well-defined tools that
// read from the inventory stores. It NEVER mutates state. It follows the
// brand operating principles in CLAUDE.md (never discount; tracked vs
// untracked semantics).
//
// Routes through the same `anthropic-proxy` Supabase edge function the
// other AI utilities use — no per-feature API key prompt.
//
// Prompt caching: the system prompt + tool definitions are marked
// cache_control ephemeral so repeat queries within a 5-minute window pay
// the cached-input rate.

import { getClerkToken } from '../lib/auth';
import { list as listInventory, get as getInventorySku, listTrackingAudit } from './inventoryStore';
import { listPOs }               from './productionStore';
import { listMappings }          from './variantMappingStore';
import { listPlan }              from './otbStore';
import { readForecastAssumptions } from './forecastAssumptionsStore';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MODEL        = 'claude-opus-4-7';
const MAX_TURNS    = 6; // safety cap on tool-use loop

// ── System prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the inventory agent for Foreign Resource — a streetwear brand with apparel and accessories. The operator asks you focused questions about inventory, sales velocity, purchase orders, variant mappings, and Open-to-Buy plans. You answer using the tools provided.

BRAND OPERATING PRINCIPLES (absolute):
- **Never discount.** Foreign Resource never marks down, never runs sales, never offers promotional codes that reduce price. Do not propose markdown actions, sale-price changes, or discount codes. The only overstock levers are: pause reorder, hold for review, archive / repurpose at full price, creator seeding, or sample sale at cost.
- **Tracked vs untracked SKUs.** Every SKU has a tracked flag. Untracked SKUs are excluded from chase suggestions, urgent-reorder lists, and stockout alerts — they're drop products that should sell out without restock. When the operator asks about urgency, exclude untracked unless they explicitly ask about them.

DATA AVAILABLE THROUGH TOOLS:
- inventoryStore — SKU master ledger: on_hand, on_order, sold_4w, sold_12w, salesByDay (last 90d), cost, retail, color, size, tier (Staple|Drop), tracked flag
- productionStore — purchase orders: code, status, vendor_id, style_id, units, unit_cost_usd, expected_landing, payment_schedule
- variantMappingStore — Shopify variant ↔ PLM style mappings
- otbStore — quarterly per-class planned receipts $
- forecastAssumptionsStore — operator's planned daily ad spend + MER, derived lift multiplier
- listTrackingAudit — append-only history of star toggles

ANSWERING STYLE:
- Concise. Operators are scanning quickly between trades.
- Lead with the answer. Show the math only if it sharpens the answer.
- Use mono-formatted SKU codes and dates (YYYY-MM-DD).
- When you don't have enough data, say so plainly. Don't speculate.
- If the question implies an action (e.g. "should I reorder X?"), recommend a course but call out the constraints — never propose a discount.`;

// ── Tool definitions ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'query_skus',
    description: 'List SKUs from inventoryStore with optional filters. Returns lightweight per-SKU records (no salesByDay) sorted by 90d revenue desc.',
    input_schema: {
      type: 'object',
      properties: {
        tracked_only: { type: 'boolean', description: 'When true, only tracked SKUs.' },
        sku_substring: { type: 'string', description: 'Case-insensitive substring match on sku/style_name/color/size.' },
        tier: { type: 'string', enum: ['Staple', 'Drop'], description: 'Filter by tier.' },
        limit: { type: 'integer', description: 'Max rows. Default 25, hard cap 100.' },
      },
    },
  },
  {
    name: 'get_sku',
    description: 'Get the full record for one SKU including salesByDay, allocated, on_order, on_hand_by_location, oversold count.',
    input_schema: {
      type: 'object',
      properties: { sku: { type: 'string', description: 'The SKU code, e.g. "AP-PA-ECARGO-10-W34-1".' } },
      required: ['sku'],
    },
  },
  {
    name: 'query_pos',
    description: 'List purchase orders with optional filters.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'placed', 'in_production', 'received', 'closed', 'cancelled'] },
        style_id: { type: 'string' },
        vendor_id: { type: 'string' },
        limit: { type: 'integer', description: 'Max rows. Default 25.' },
      },
    },
  },
  {
    name: 'get_mappings',
    description: 'List variant ↔ style mappings. Filter by style_id to see all variants of one style.',
    input_schema: {
      type: 'object',
      properties: { style_id: { type: 'string' } },
    },
  },
  {
    name: 'get_otb_plan',
    description: 'Read the OTB plan as a flat object keyed by "QUARTER::CLASS" → planned $.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_forecast_assumptions',
    description: 'Read the operator\'s current planned daily ad spend, planned MER, and the derived lift multiplier.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_tracking_audit',
    description: 'Read the append-only tracked-toggle history. Filter by sku and/or since (ISO date).',
    input_schema: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        since: { type: 'string', description: 'ISO date string.' },
      },
    },
  },
];

// ── Tool dispatch ───────────────────────────────────────────────────────

async function dispatchTool(name, input) {
  switch (name) {
    case 'query_skus': {
      const all = await listInventory();
      const q   = (input?.sku_substring || '').toLowerCase();
      let rows = all;
      if (input?.tracked_only) rows = rows.filter(s => s.tracked);
      if (input?.tier)         rows = rows.filter(s => s.tier === input.tier);
      if (q) rows = rows.filter(s =>
        [s.sku, s.style_name, s.color, s.size].filter(Boolean).join(' ').toLowerCase().includes(q));
      // Slim shape — drop salesByDay so the tool result fits.
      const slim = rows.map(s => ({
        sku: s.sku,
        style_name: s.style_name,
        color: s.color,
        size: s.size,
        tier: s.tier,
        tracked: s.tracked,
        on_hand: s.on_hand,
        on_order: s.on_order,
        sold_4w: s.sold_4w,
        sold_12w: s.sold_12w,
        cost: s.cost,
        retail: s.retail,
        oversold: s.oversold,
      }));
      slim.sort((a, b) => (b.sold_12w * (b.retail || 0)) - (a.sold_12w * (a.retail || 0)));
      const limit = Math.min(Number(input?.limit) || 25, 100);
      return { count: slim.length, rows: slim.slice(0, limit) };
    }

    case 'get_sku': {
      const row = await getInventorySku(input?.sku);
      if (!row) return { found: false, sku: input?.sku };
      return { found: true, ...row };
    }

    case 'query_pos': {
      const rows = await listPOs({
        status:    input?.status    || null,
        style_id:  input?.style_id  || null,
        vendor_id: input?.vendor_id || null,
      });
      const limit = Math.min(Number(input?.limit) || 25, 100);
      return { count: rows.length, rows: rows.slice(0, limit) };
    }

    case 'get_mappings': {
      const rows = await listMappings({ style_id: input?.style_id || null });
      return { count: rows.length, rows };
    }

    case 'get_otb_plan': {
      return { plan: listPlan() };
    }

    case 'get_forecast_assumptions': {
      return readForecastAssumptions();
    }

    case 'get_tracking_audit': {
      const rows = await listTrackingAudit({
        sku:   input?.sku   || null,
        since: input?.since || null,
      });
      return { count: rows.length, rows };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Anthropic proxy ─────────────────────────────────────────────────────

async function callClaude(body) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase is not configured for this build.');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use the inventory agent.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/anthropic-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `anthropic-proxy returned ${res.status}`;
    if (/credential|api[_ ]?key|integration|provider/i.test(String(msg))) {
      throw new Error('No Anthropic credential found for this org. Add one in Settings → Integrations.');
    }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

// ── Public API: runAgentTurn ────────────────────────────────────────────

/**
 * Run one user-turn through the agent. Handles the tool-use loop until
 * Claude returns a text-only response or we hit MAX_TURNS.
 *
 * @param {Array<{role: 'user'|'assistant', content: any}>} history
 *        Conversation so far. Caller appends the new user message before
 *        calling this.
 * @returns {Promise<{ text: string, toolCalls: Array<{name, input, result}>, history: Array }>}
 */
export async function runAgentTurn(history) {
  const messages = [...history];
  const toolCalls = [];

  // System prompt + tool definitions cached together so multi-turn
  // sessions reuse the prefix.
  const system = [{
    type: 'text',
    text: SYSTEM_PROMPT,
    cache_control: { type: 'ephemeral' },
  }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callClaude({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const blocks = Array.isArray(response?.content) ? response.content : [];
    messages.push({ role: 'assistant', content: blocks });

    const toolUses = blocks.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { text, toolCalls, history: messages };
    }

    // Execute every tool call, then send back tool_result blocks.
    const toolResults = [];
    for (const t of toolUses) {
      let result;
      try {
        result = await dispatchTool(t.name, t.input || {});
      } catch (err) {
        result = { error: err.message || String(err) };
      }
      toolCalls.push({ name: t.name, input: t.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: t.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    text: 'Agent hit the tool-use loop cap. Try a more specific question.',
    toolCalls,
    history: messages,
  };
}
