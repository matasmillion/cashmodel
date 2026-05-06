// Brief generation orchestrator.
//
// Flow:
//   1. Verify caller JWT (just shape — RLS enforces auth on every query)
//   2. Read sprint row (RLS-scoped — no manual org filter needed)
//   3. Query past learnings: recent winners for lane (≤8) + recent losers
//      for hypothesis_type (≤4)
//   4. Read all 4 creative_knowledge rows for the org
//   5. Build system + user prompt; call Anthropic API using stored token
//   6. Parse JSON response into brief fields
//   7. Insert brief row into `briefs` table
//   8. Return the created brief
//
// Request body:
//   { sprint_id: string }
//
// Knowledge is read from the DB now (creative_knowledge table), not
// from request body. The editor in KnowledgeFiles.jsx is the source
// of truth.
//
// Deploy:
//   supabase functions deploy generate-brief

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function newId() {
  return crypto.randomUUID();
}

// Format a knowledge row's structured `fields` jsonb into readable prose
// for the system prompt. Empty rows render as "Not yet filled in" so the
// model knows to fall back to general FR principles for that section.
function renderKnowledgeBlock(kind: string, fields: Record<string, unknown> | null): string {
  if (!fields || Object.keys(fields).length === 0) {
    return '_Not yet filled in. Use general FR principles (luxury elevated basics, considered voice, no shouty claims)._';
  }
  const lines: string[] = [];

  function renderValue(label: string, value: unknown, depth = 0) {
    const indent = '  '.repeat(depth);
    if (value == null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      // List of strings
      if (value.every(v => typeof v === 'string')) {
        lines.push(`${indent}**${label}:**`);
        value.forEach(v => lines.push(`${indent}  - ${v}`));
        return;
      }
      // List of objects (repeating group, e.g. personas, hero_skus)
      lines.push(`${indent}**${label}:**`);
      value.forEach((entry, i) => {
        if (typeof entry === 'object' && entry !== null) {
          const name = (entry as Record<string, unknown>).name || `#${i + 1}`;
          lines.push(`${indent}  ${name}:`);
          for (const [k, v] of Object.entries(entry)) {
            if (k === 'name') continue;
            renderValue(k.replace(/_/g, ' '), v, depth + 2);
          }
        }
      });
      return;
    }
    if (typeof value === 'object') {
      lines.push(`${indent}**${label}:**`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        renderValue(k.replace(/_/g, ' '), v, depth + 1);
      }
      return;
    }
    // Scalar
    lines.push(`${indent}**${label}:** ${value}`);
  }

  for (const [key, value] of Object.entries(fields)) {
    renderValue(key.replace(/_/g, ' '), value);
  }

  return lines.length ? lines.join('\n') : '_(empty)_';
}

function buildSystemPrompt(knowledge: Record<string, Record<string, unknown> | null>) {
  return `You are a creative strategist for Foreign Resource (FR), a luxury elevated basics brand.

Your job is to write a structured video ad brief for a 4-week creative testing sprint.

## Brand Context

### Customer Avatar
${renderKnowledgeBlock('avatar', knowledge.avatar)}

### Brand Guidelines
${renderKnowledgeBlock('brand', knowledge.brand)}

### Product Knowledge
${renderKnowledgeBlock('product', knowledge.product)}

### AI Model / Production Notes
${renderKnowledgeBlock('models', knowledge.models)}

## Output Format

You MUST respond with a single valid JSON object and nothing else — no markdown fences, no preamble, no trailing text. The JSON must match this schema exactly:

{
  "hypothesis": "one-sentence hypothesis being tested in this sprint",
  "key_feeling": "the emotional state the viewer should be in after watching",
  "hook": "the first 3 seconds — what stops the scroll (be specific, visual)",
  "payoff": "what the viewer feels or understands by the end",
  "shot_list": [
    "shot 1 description",
    "shot 2 description",
    "shot 3 description"
  ],
  "caption": "the ad caption (with line breaks as \\n, under 150 chars)",
  "prompt_blueprint": "the generative AI or director prompt to produce this video"
}

Rules:
- Every field is required
- shot_list must have 3–6 items
- Write for the lane specified — the tone, pacing, and talent direction differ by lane
- The brief must be immediately actionable — a director or AI model should be able to execute it
- No emojis, no brackets, no placeholders in the output`;
}

function buildUserMessage(
  sprint: Record<string, unknown>,
  learnings: { winners: Record<string, unknown>[]; losers: Record<string, unknown>[] },
) {
  const laneLabel: Record<string, string> = {
    ai: 'AI (fal NB2 — photorealistic, product-forward, ASMR-adjacent)',
    high_production: 'High Production (Higgsfield Marketing Studio — editorial stillness, luxury hospitality)',
    creator: 'Creator (Higgsfield Soul Character — authentic, educational, POV walkthrough)',
    founder: 'Founder (Higgsfield Soul / direct-to-camera — conviction-driven, no polished lighting)',
  };

  const winnersBlock = learnings.winners.length > 0
    ? learnings.winners.map((l, i) => `  ${i + 1}. [${l.hypothesis_type}] ${l.summary}`).join('\n')
    : '  None yet.';

  const losersBlock = learnings.losers.length > 0
    ? learnings.losers.map((l, i) => `  ${i + 1}. [${l.hypothesis_type}] ${l.summary}`).join('\n')
    : '  None yet.';

  return `Generate a brief for this sprint:

Lane: ${laneLabel[sprint.lane as string] || sprint.lane}
Sprint number: S${sprint.sprint_number}
Hypothesis type: ${sprint.hypothesis_type || 'open'}
Constraint / starting point: ${sprint.constraint_text || 'none specified'}

## Past Learnings Consulted

Winners for this lane (do more of this):
${winnersBlock}

Losers for this hypothesis type (avoid these patterns):
${losersBlock}

Now write the brief JSON:`;
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  // ── 1. Verify caller session ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // No supabase.auth.getUser() call — Clerk JWTs aren't recognised by
  // that endpoint. RLS via jwt_org_id() handles auth on every query.

  // ── 2. Parse request body ───────────────────────────────────────────────
  let body: { sprint_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { sprint_id } = body;
  if (!sprint_id) return json({ error: 'sprint_id is required' }, 400, origin);

  // ── 3. Fetch sprint (RLS-scoped) ────────────────────────────────────────
  const { data: sprint, error: sprintErr } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprint_id)
    .maybeSingle();

  if (sprintErr) return json({ error: `Sprint lookup failed: ${sprintErr.message}` }, 500, origin);
  if (!sprint) return json({ error: 'Sprint not found or access denied' }, 404, origin);

  // ── 3a. Fetch knowledge from DB (RLS-scoped) ───────────────────────────
  const { data: knowledgeRows, error: kErr } = await supabase
    .from('creative_knowledge')
    .select('kind, fields');
  if (kErr) return json({ error: `Knowledge lookup failed: ${kErr.message}` }, 500, origin);

  const knowledge: Record<string, Record<string, unknown> | null> = {
    avatar: null, brand: null, product: null, models: null,
  };
  for (const row of (knowledgeRows || [])) {
    knowledge[row.kind as string] = (row.fields as Record<string, unknown>) || null;
  }

  // ── 4. Fetch past learnings (RLS-scoped) ───────────────────────────────
  const [winnersRes, losersRes] = await Promise.all([
    supabase
      .from('learnings')
      .select('hypothesis_type, summary, lane')
      .eq('outcome', 'winner')
      .eq('lane', sprint.lane)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('learnings')
      .select('hypothesis_type, summary, lane')
      .eq('outcome', 'loser')
      .eq('hypothesis_type', sprint.hypothesis_type || '')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const pastLearnings = {
    winners: winnersRes.data || [],
    losers: losersRes.data || [],
  };

  // ── 5. Look up Anthropic API key ────────────────────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', 'anthropic')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: 'Anthropic not connected. Add your API key on the Integrations tab first.' }, 404, origin);
  }

  // ── 6. Call Anthropic ───────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(knowledge);
  const userMessage = buildUserMessage(sprint, pastLearnings);

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': integration.token as string,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch (err) {
    return json({ error: `Anthropic call failed: ${(err as Error).message}` }, 502, origin);
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return json({ error: `Anthropic error ${anthropicRes.status}: ${errText}` }, 502, origin);
  }

  const anthropicData = await anthropicRes.json();
  const rawText = anthropicData?.content?.[0]?.text || '';

  // ── 7. Parse JSON response ──────────────────────────────────────────────
  let briefFields: {
    hypothesis: string;
    key_feeling: string;
    hook: string;
    payoff: string;
    shot_list: string[];
    caption: string;
    prompt_blueprint: string;
  };

  try {
    // Strip any accidental markdown fences Claude might have added
    const clean = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    briefFields = JSON.parse(clean);
  } catch (parseErr) {
    return json({
      error: 'Claude returned non-JSON output — try again',
      raw: rawText.slice(0, 500),
    }, 500, origin);
  }

  // ── 8. Compute next version number ─────────────────────────────────────
  const { data: existingBriefs } = await supabase
    .from('briefs')
    .select('version')
    .eq('sprint_id', sprint_id)
    .order('version', { ascending: false })
    .limit(1);

  const version = existingBriefs?.[0]?.version ? existingBriefs[0].version + 1 : 1;

  // ── 9. Insert brief ─────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const newBrief = {
    id: newId(),
    organization_id: sprint.organization_id,
    sprint_id,
    version,
    status: 'draft',
    hypothesis: briefFields.hypothesis || '',
    key_feeling: briefFields.key_feeling || '',
    hook: briefFields.hook || '',
    payoff: briefFields.payoff || '',
    shot_list: Array.isArray(briefFields.shot_list) ? briefFields.shot_list : [],
    caption: briefFields.caption || '',
    prompt_blueprint: briefFields.prompt_blueprint || '',
    past_learnings_consulted: [
      ...pastLearnings.winners.map(l => ({ ...l, consulted_as: 'winner' })),
      ...pastLearnings.losers.map(l => ({ ...l, consulted_as: 'loser' })),
    ],
    agent_model: MODEL,
    generated_at: now,
    approved_by: null,
    approved_at: null,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('briefs')
    .insert(newBrief)
    .select()
    .single();

  if (insertErr) return json({ error: `Brief insert failed: ${insertErr.message}` }, 500, origin);

  // Also update sprint status to brief_ready
  await supabase
    .from('sprints')
    .update({ status: 'brief_ready', updated_at: now })
    .eq('id', sprint_id);

  return json({ brief: inserted }, 200, origin);
});
