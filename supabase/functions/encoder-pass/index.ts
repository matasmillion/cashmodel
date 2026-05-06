// Render encoder pass — Transloadit integration.
//
// Takes an approved render's raw_url, ships it to Transloadit for
// re-encoding to Meta's 9:16 vertical spec (1080x1920 H.264 + AAC,
// faststart for stream-as-it-loads), polls the assembly until it's
// done, and writes the resulting encoded URL onto the render row.
//
// Auth keys come from user_integrations:
//   provider = 'transloadit'
//   token    = AUTH_SECRET
//   metadata = { auth_key: AUTH_KEY }
//
// Request body:
//   { render_id: string }
//
// Deploy:
//   supabase functions deploy encoder-pass

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const TRANSLOADIT_API = 'https://api2.transloadit.com';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 50; // ~2.5 min cap

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

async function hmacSha1Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildAssemblyParams(authKey: string, rawUrl: string): Record<string, unknown> {
  // Expires 1 hour from now in Transloadit's expected format
  const exp = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19) + '+00:00';
  return {
    auth: { key: authKey, expires: exp },
    steps: {
      ':original': { robot: '/http/import', url: rawUrl },
      encoded: {
        use: ':original',
        robot: '/video/encode',
        ffmpeg_stack: 'v6.0.0',
        ffmpeg: {
          vcodec: 'libx264',
          acodec: 'aac',
          'b:v': '6000k',
          'b:a': '128k',
          vf: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
          movflags: '+faststart',
        },
        result: true,
      },
    },
  };
}

async function getCredential(
  supabase: SupabaseClient,
  provider: string,
): Promise<{ token: string; metadata: Record<string, unknown> } | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('token, metadata')
    .eq('provider', provider)
    .maybeSingle();
  if (!data?.token) return null;
  return {
    token: data.token as string,
    metadata: (data.metadata as Record<string, unknown>) || {},
  };
}

async function submitAssembly(
  authKey: string,
  authSecret: string,
  rawUrl: string,
): Promise<{ assembly_id: string; status_endpoint: string }> {
  const params = buildAssemblyParams(authKey, rawUrl);
  const paramsJson = JSON.stringify(params);
  const signature = await hmacSha1Hex(authSecret, paramsJson);

  const form = new FormData();
  form.append('params', paramsJson);
  form.append('signature', signature);

  const res = await fetch(`${TRANSLOADIT_API}/assemblies`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Transloadit submit ${res.status}: ${text.slice(0, 300)}`);
  let data: { assembly_id?: string; assembly_ssl_url?: string; assembly_url?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Transloadit returned non-JSON: ${text.slice(0, 300)}`);
  }
  if (!data.assembly_id) throw new Error('Transloadit response missing assembly_id');
  return {
    assembly_id: data.assembly_id,
    status_endpoint: data.assembly_ssl_url || data.assembly_url
      || `${TRANSLOADIT_API}/assemblies/${data.assembly_id}`,
  };
}

type AssemblyStatus = {
  ok: 'ASSEMBLY_COMPLETED' | 'ASSEMBLY_EXECUTING' | string;
  results?: { encoded?: Array<{ ssl_url?: string; url?: string }> };
  error?: string;
  message?: string;
};

async function pollAssembly(statusUrl: string): Promise<AssemblyStatus> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const res = await fetch(statusUrl);
    const text = await res.text();
    let data: AssemblyStatus;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Status returned non-JSON: ${text.slice(0, 300)}`);
    }
    if (data.ok === 'ASSEMBLY_COMPLETED') return data;
    if (data.error) throw new Error(`Transloadit error: ${data.error} ${data.message || ''}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Encoder pass timed out');
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header — sign in first' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let body: { render_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }
  const { render_id } = body;
  if (!render_id) return json({ error: 'render_id is required' }, 400, origin);

  const { data: render, error: rErr } = await supabase
    .from('renders')
    .select('*')
    .eq('id', render_id)
    .maybeSingle();
  if (rErr) return json({ error: `Render lookup failed: ${rErr.message}` }, 500, origin);
  if (!render) return json({ error: 'Render not found' }, 404, origin);
  if (!render.raw_url) return json({ error: 'Render has no raw_url to encode' }, 400, origin);
  if (render.encoder_passed) {
    return json({ render }, 200, origin); // already done — idempotent
  }

  const cred = await getCredential(supabase, 'transloadit');
  if (!cred) {
    return json({ error: 'Transloadit not connected. Add your auth key + secret on the Integrations tab first.' }, 404, origin);
  }
  const authKey = (cred.metadata.auth_key as string) || '';
  if (!authKey) {
    return json({ error: 'Stored Transloadit credentials are missing auth_key in metadata' }, 400, origin);
  }

  let assembly: { assembly_id: string; status_endpoint: string };
  try {
    assembly = await submitAssembly(authKey, cred.token, render.raw_url);
  } catch (err) {
    return json({ error: (err as Error).message }, 502, origin);
  }

  let status: AssemblyStatus;
  try {
    status = await pollAssembly(assembly.status_endpoint);
  } catch (err) {
    return json({ error: (err as Error).message }, 502, origin);
  }

  const encodedUrl = status.results?.encoded?.[0]?.ssl_url
    || status.results?.encoded?.[0]?.url
    || null;
  if (!encodedUrl) {
    return json({ error: 'Encoder finished but no encoded URL in result' }, 502, origin);
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from('renders')
    .update({
      encoded_url: encodedUrl,
      encoder_passed: true,
      updated_at: now,
    })
    .eq('id', render_id)
    .select()
    .maybeSingle();

  if (upErr) return json({ error: `Render update failed: ${upErr.message}` }, 500, origin);

  return json({ render: updated, assembly_id: assembly.assembly_id }, 200, origin);
});
