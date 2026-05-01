// vendor-notify — Supabase Edge Function (Deno).
//
// Receives notification events from the internal app
// (vendorNotificationStore.notifyNewPO / notifyNewSample) and:
//   1. Resolves the vendor's active vendor_users rows.
//   2. Renders a localized email per recipient (en + zh-CN).
//   3. Hands the rendered email to the configured provider (Resend by
//      default; the provider call is the only step that's allowed to
//      fail — RLS-side audit row gets stamped with delivery_status.
//
// Required secrets:
//   SUPABASE_URL                — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY   — auto-provided; bypasses RLS so we
//                                 can stamp delivery_status on the
//                                 audit row.
//   RESEND_API_KEY              — Resend (https://resend.com)
//   VENDOR_PORTAL_FROM          — e.g. "Foreign Resource <portal@…>"
//   VENDOR_PORTAL_BASE_URL      — e.g. https://app.foreign-resource.com
//
// Deploy:
//   supabase functions deploy vendor-notify
//   supabase secrets set RESEND_API_KEY=… VENDOR_PORTAL_FROM=… VENDOR_PORTAL_BASE_URL=…

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

type EventType = 'po.placed' | 'sample.requested';

interface InvokeBody {
  event_type: EventType;
  vendor_id: string;
  subject_id: string;
  payload?: Record<string, unknown>;
}

interface VendorRecipient {
  email: string;
  preferred_locale: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS = Deno.env.get('VENDOR_PORTAL_FROM') ?? 'Foreign Resource <portal@example.com>';
const PORTAL_BASE_URL = Deno.env.get('VENDOR_PORTAL_BASE_URL') ?? 'https://example.com';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Intentionally inlined translations — keeping this function dependency-
// free is worth the tiny duplication with src/i18n. If a third surface
// needs the same strings, factor a shared JSON file.
const COPY: Record<string, Record<EventType, { subject: string; body: string; cta: string }>> = {
  'en': {
    'po.placed': {
      subject: 'New purchase order from Foreign Resource',
      body: 'A new purchase order is waiting for you in the Vendor Portal.',
      cta: 'Open the Vendor Portal',
    },
    'sample.requested': {
      subject: 'New sample request from Foreign Resource',
      body: 'A new sample request is waiting for you in the Vendor Portal.',
      cta: 'Open the Vendor Portal',
    },
  },
  'zh-CN': {
    'po.placed': {
      subject: '来自 Foreign Resource 的新采购订单',
      body: '供应商门户中有一份新的采购订单等待您处理。',
      cta: '打开供应商门户',
    },
    'sample.requested': {
      subject: '来自 Foreign Resource 的新样品需求',
      body: '供应商门户中有一份新的样品需求等待您处理。',
      cta: '打开供应商门户',
    },
  },
};

function pickLocale(loc: string | undefined): 'en' | 'zh-CN' {
  if (loc && loc.startsWith('zh')) return 'zh-CN';
  return 'en';
}

function renderHtml(locale: 'en' | 'zh-CN', subject: string, body: string, ctaLabel: string, ctaHref: string) {
  const fontStack = locale === 'zh-CN'
    ? `'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif`
    : `'Inter', system-ui, sans-serif`;
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:32px;background:#F5F0E8;color:#3A3A3A;font-family:${fontStack};line-height:${locale === 'zh-CN' ? '1.6' : '1.5'};">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:0.5px solid rgba(58,58,58,0.15);border-radius:8px;padding:28px;">
      <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#716F70;margin-bottom:8px;">Foreign Resource</div>
      <h1 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:24px;">${subject}</h1>
      <p style="margin:0 0 24px;">${body}</p>
      <a href="${ctaHref}" style="display:inline-block;padding:10px 18px;background:#3A3A3A;color:#F5F0E8;border-radius:6px;text-decoration:none;font-size:13px;">${ctaLabel}</a>
    </div>
  </body>
</html>`;
}

async function sendOneEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `resend ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body: InvokeBody;
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (!body.event_type || !body.vendor_id || !body.subject_id) {
    return new Response('missing fields', { status: 400 });
  }

  // Resolve organization_id from the matching audit row inserted by
  // the client (vendorNotificationStore appended it before invoking us).
  // The audit row is the source of truth for which org owns the event;
  // never trust an unverified org_id from the request body.
  const { data: auditRows, error: auditErr } = await admin
    .from('vendor_notifications')
    .select('id, organization_id, vendor_id, event_type, subject_id')
    .eq('vendor_id', body.vendor_id)
    .eq('event_type', body.event_type)
    .eq('subject_id', body.subject_id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (auditErr || !auditRows || auditRows.length === 0) {
    return new Response('audit row not found', { status: 404 });
  }
  const audit = auditRows[0];

  const { data: recipients, error: recipErr } = await admin
    .from('vendor_users')
    .select('email, preferred_locale')
    .eq('organization_id', audit.organization_id)
    .eq('vendor_id', audit.vendor_id)
    .eq('status', 'active');

  if (recipErr) {
    await admin.from('vendor_notifications')
      .update({ delivery_status: 'failed', delivery_error: recipErr.message })
      .eq('id', audit.id);
    return new Response('recipient lookup failed', { status: 500 });
  }

  const list = (recipients ?? []) as VendorRecipient[];
  if (list.length === 0) {
    await admin.from('vendor_notifications')
      .update({ delivery_status: 'failed', delivery_error: 'no active vendor_users' })
      .eq('id', audit.id);
    return new Response('no recipients', { status: 200 });
  }

  // Per-org override of the portal origin, falling back to the
  // VENDOR_PORTAL_BASE_URL secret. Cheaper to fetch once per dispatch
  // than per recipient.
  let portalBase = PORTAL_BASE_URL;
  const { data: settings } = await admin
    .from('org_settings')
    .select('vendor_portal_base_url')
    .eq('org_id', audit.organization_id)
    .maybeSingle();
  if (settings?.vendor_portal_base_url) portalBase = settings.vendor_portal_base_url;
  const ctaHref = `${portalBase.replace(/\/$/, '')}/vendor`;

  const errors: string[] = [];
  for (const r of list) {
    const locale = pickLocale(r.preferred_locale);
    const copy = COPY[locale][body.event_type];
    const html = renderHtml(locale, copy.subject, copy.body, copy.cta, ctaHref);
    const result = await sendOneEmail({ to: r.email, subject: copy.subject, html });
    if (!result.ok) errors.push(`${r.email}: ${result.error}`);
  }

  const update: Record<string, unknown> = errors.length > 0
    ? { delivery_status: 'failed', delivery_error: errors.join('; ') }
    : { delivery_status: 'sent', delivered_at: new Date().toISOString() };

  await admin.from('vendor_notifications').update(update).eq('id', audit.id);

  return new Response(JSON.stringify({ ok: errors.length === 0, errors }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
