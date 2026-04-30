// purge-plm-trash — scheduled hard-delete of PLM rows that have been in
// Trash longer than the retention window.
//
// Soft-deleted rows have deleted_at set. After RETENTION_DAYS, this
// function:
//   1. Lists every tech_pack / component_pack with deleted_at older than
//      the cutoff (across all orgs — service-role bypasses RLS).
//   2. For each row, removes its Storage objects (every entry in the
//      images JSONB that has a `path`, plus the cover_image column if
//      it points at a Storage path).
//   3. Hard-deletes the row.
//
// Returns a summary { tech_packs: { rows_purged, files_purged },
//                     component_packs: { ... } }.
//
// Schedule:
//   Run nightly via any cron (Supabase pg_cron, GitHub Actions, cron-job.org,
//   etc.) by POSTing to:
//     https://<project-ref>.supabase.co/functions/v1/purge-plm-trash
//   with header `Authorization: Bearer <SERVICE_ROLE_JWT_OR_CRON_SECRET>`
//   so a passing user can't trigger it. The client-side opportunistic
//   sweep in PackTrashView is a best-effort fallback, not the canonical
//   path.
//
// Required env (auto-provided by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Optional env:
//   PURGE_CRON_SECRET   — if set, the request must include this value as
//                          the Bearer token. Without it the function is
//                          callable by any service-role holder.
//   PURGE_RETENTION_DAYS — overrides the default 30-day retention.
//
// Deploy:
//   supabase functions deploy purge-plm-trash --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PURGE_CRON_SECRET = Deno.env.get('PURGE_CRON_SECRET') || '';
const RETENTION_DAYS = Number(Deno.env.get('PURGE_RETENTION_DAYS') || 30);
const BUCKET = 'plm-assets';

const PACK_TABLES = ['tech_packs', 'component_packs'] as const;

type Row = {
  id: string;
  organization_id: string | null;
  cover_image: string | null;
  images: unknown;
};

function extractPaths(row: Row): string[] {
  const paths = new Set<string>();
  // images JSONB array entries with a `path` field point at Storage objects.
  if (Array.isArray(row.images)) {
    for (const img of row.images) {
      if (img && typeof img === 'object' && typeof (img as { path?: unknown }).path === 'string') {
        paths.add((img as { path: string }).path);
      }
    }
  }
  // cover_image column may also hold a Storage path (vs a legacy data: URL
  // or a remote http URL — neither of which we touch).
  const cover = row.cover_image;
  if (cover && typeof cover === 'string'
      && !cover.startsWith('data:')
      && !/^https?:\/\//i.test(cover)) {
    paths.add(cover);
  }
  return Array.from(paths);
}

async function purgeTable(supabase: ReturnType<typeof createClient>, table: string, cutoffIso: string) {
  let rowsPurged = 0;
  let filesPurged = 0;
  let filesFailed = 0;

  // Pull every expired row in one go. Selecting only the columns we need
  // keeps the response small even for large catalogs.
  const { data, error } = await supabase
    .from(table)
    .select('id, organization_id, cover_image, images')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffIso);

  if (error) {
    console.error(`[${table}] select expired:`, error);
    return { rows_purged: 0, files_purged: 0, files_failed: 0, error: error.message };
  }

  for (const row of (data || []) as Row[]) {
    const paths = extractPaths(row);
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rmErr) {
        console.error(`[${table}] storage remove for ${row.id}:`, rmErr);
        filesFailed += paths.length;
        // Still attempt the row delete — orphaned Storage objects can be
        // swept by a later run; orphaned DB rows can't be recovered.
      } else {
        filesPurged += paths.length;
      }
    }
    const { error: delErr } = await supabase.from(table).delete().eq('id', row.id);
    if (delErr) {
      console.error(`[${table}] delete row ${row.id}:`, delErr);
      continue;
    }
    rowsPurged += 1;
  }

  return { rows_purged: rowsPurged, files_purged: filesPurged, files_failed: filesFailed };
}

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // If PURGE_CRON_SECRET is configured, require it. Otherwise rely on the
  // function's --no-verify-jwt flag combined with Supabase's network ACLs.
  if (PURGE_CRON_SECRET) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token !== PURGE_CRON_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Service role env not set' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const result: Record<string, unknown> = {
    cutoff: cutoffIso,
    retention_days: RETENTION_DAYS,
  };
  for (const table of PACK_TABLES) {
    result[table] = await purgeTable(supabase, table, cutoffIso);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
