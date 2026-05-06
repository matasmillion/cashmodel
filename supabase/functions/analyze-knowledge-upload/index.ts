// Knowledge upload analyzer.
//
// Takes one or more files that the user uploaded into Storage (under the
// `plm-assets` bucket, scoped to creative-knowledge), forwards them to
// Claude as image/document blocks, and asks the model to fill in the
// JSON schema for the requested knowledge `kind`.
//
// Used by the Knowledge editor's "Analyze with AI" buttons:
//   - Top-level per kind: extract everything (avatar / brand / product list / models)
//   - Per product card: extract one product's fields from photos
//
// Request body:
//   {
//     kind: 'avatar' | 'brand' | 'product' | 'models',
//     attachment_paths: string[],   // Storage paths inside plm-assets
//     scope: 'kind' | 'sku_item',   // 'sku_item' = single product card
//     existing_fields?: object,     // optional — sent so model can avoid
//                                   //  contradicting what's already filled
//   }
//
// Response:
//   { suggestions: <object matching schema> }
//
// Deploy:
//   supabase functions deploy analyze-knowledge-upload

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const BUCKET = 'plm-assets';
const MAX_TOKENS = 4096;
const MAX_FILES = 12;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per file

type SchemaConfig = {
  schema: string;
  instruction: string;
};

const SCHEMAS: Record<string, Record<string, SchemaConfig>> = {
  kind: {
    avatar: {
      schema: `{
  "personas": [
    {
      "name": "string — short label",
      "one_liner": "string",
      "demographic": "string — age/income/location/lifestyle",
      "core_desire": "string",
      "pain_points": ["string", ...],
      "scroll_stoppers": ["string", ...],
      "words_they_use": ["string", ...],
      "trust_triggers": ["string", ...]
    }
  ]
}`,
      instruction:
        'Extract customer persona information. If multiple personas are visible or described, return one entry per persona.',
    },
    brand: {
      schema: `{
  "voice_adjectives": ["string", ...],
  "we_say": ["string", ...],
  "we_never_say": ["string", ...],
  "tone_per_lane": {
    "ai": "string",
    "high_production": "string",
    "creator": "string",
    "founder": "string"
  },
  "visual_rules": ["string", ...],
  "never_in_creative": ["string", ...]
}`,
      instruction:
        'Extract brand voice adjectives, on-brand and off-brand phrases, tone-per-lane direction, and visual rules from the attached brand kit / guidelines.',
    },
    product: {
      schema: `{
  "hero_skus": [
    {
      "name": "string",
      "price_usd": "string",
      "material_story": "string",
      "construction": "string",
      "fit_philosophy": "string",
      "who_its_for": "string",
      "price_justification": "string"
    }
  ]
}`,
      instruction:
        'Extract one entry per distinct product visible in the files. Focus on material composition, construction differentiators, fit, and what justifies the price.',
    },
    models: {
      schema: `{
  "lanes": {
    "ai_model_id": "string",
    "ai_workflow": "string",
    "ai_trigger_phrases": ["string", ...],
    "high_prod_workspace": "string",
    "high_prod_preset": "string",
    "high_prod_workflow": "string",
    "creator_soul_id": "string",
    "creator_persona": "string",
    "founder_soul_id": "string",
    "founder_persona": "string"
  }
}`,
      instruction:
        'Extract AI model IDs, workflow IDs, and Soul IDs for each lane mentioned in the files.',
    },
  },
  sku_item: {
    product: {
      schema: `{
  "name": "string",
  "price_usd": "string",
  "material_story": "string",
  "construction": "string",
  "fit_philosophy": "string",
  "who_its_for": "string",
  "price_justification": "string"
}`,
      instruction:
        'You are looking at photos of ONE product from multiple angles. Extract details about THIS single product. Focus on visible material texture, construction details (seams, hardware, ribbing), fit silhouette, and what makes it special.',
    },
  },
};

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

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack overflow on large files
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
    return json({ error: 'Missing Authorization header — sign in first' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // ── 2. Parse body ───────────────────────────────────────────────────────
  let body: {
    kind?: string;
    scope?: string;
    attachment_paths?: string[];
    existing_fields?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { kind, scope = 'kind', attachment_paths, existing_fields } = body;
  if (!kind) return json({ error: 'kind is required' }, 400, origin);
  if (!Array.isArray(attachment_paths) || attachment_paths.length === 0) {
    return json({ error: 'attachment_paths must be a non-empty array' }, 400, origin);
  }
  if (attachment_paths.length > MAX_FILES) {
    return json({ error: `Too many files (max ${MAX_FILES})` }, 400, origin);
  }

  const schemaConfig = SCHEMAS[scope]?.[kind];
  if (!schemaConfig) {
    return json({ error: `Unknown scope/kind combination: ${scope}/${kind}` }, 400, origin);
  }

  // ── 3. Look up Anthropic key (RLS-scoped) ──────────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', 'anthropic')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: 'Anthropic not connected. Add your API key on the Integrations tab first.' }, 404, origin);
  }

  // ── 4. Download attachments (RLS-scoped via user JWT) ─────────────────
  const fileBlocks: Array<Record<string, unknown>> = [];
  for (const path of attachment_paths) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr || !blob) {
      return json({ error: `Could not read file ${path}: ${dlErr?.message || 'not found'}` }, 400, origin);
    }
    if (blob.size > MAX_FILE_BYTES) {
      return json({ error: `File ${path} is too large (>${MAX_FILE_BYTES / 1024 / 1024} MB)` }, 400, origin);
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    const mediaType = blob.type || 'application/octet-stream';
    const base64 = bytesToBase64(buf);

    if (mediaType.startsWith('image/')) {
      fileBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
    } else if (mediaType === 'application/pdf') {
      fileBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
    } else {
      // Treat anything else as text and inline up to 50k characters
      const text = new TextDecoder().decode(buf).slice(0, 50_000);
      fileBlocks.push({ type: 'text', text: `--- File: ${path} ---\n${text}` });
    }
  }

  // ── 5. Build prompt ─────────────────────────────────────────────────────
  const systemPrompt = `You are filling in a structured knowledge form for Foreign Resource (FR), a luxury elevated basics fashion brand.

${schemaConfig.instruction}

Return a single valid JSON object matching this schema exactly:

${schemaConfig.schema}

Rules:
- Return ONLY JSON. No markdown fences, no preamble, no trailing prose.
- If a field can't be inferred from the files, return an empty string (or empty array for list fields). Do NOT invent details.
- Use the user's actual phrasing where possible — paraphrase only when unavoidable.
- For lists, prefer 3–6 items unless the source material naturally has fewer.`;

  const userContent: Array<Record<string, unknown>> = [...fileBlocks];

  if (existing_fields && Object.keys(existing_fields).length > 0) {
    userContent.push({
      type: 'text',
      text: `The user has already filled in some fields — only override these if the files clearly contradict them:\n${JSON.stringify(existing_fields, null, 2)}`,
    });
  }

  userContent.push({
    type: 'text',
    text: `Now extract the ${kind} fields from the attached files and return JSON.`,
  });

  // ── 6. Call Anthropic ───────────────────────────────────────────────────
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
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
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

  // ── 7. Parse JSON ───────────────────────────────────────────────────────
  let suggestions: Record<string, unknown>;
  try {
    const clean = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    suggestions = JSON.parse(clean);
  } catch {
    return json({
      error: 'Claude returned non-JSON output — try again',
      raw: rawText.slice(0, 500),
    }, 500, origin);
  }

  return json({ suggestions }, 200, origin);
});
