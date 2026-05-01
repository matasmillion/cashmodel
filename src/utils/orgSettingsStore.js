import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const DEFAULTS = {
  anthropic_api_key: '',
  rate_card_instructions: '',
  vendor_default_locale: 'en',
  vendor_portal_base_url: '',
};

const LS_FIELDS = ['anthropic_api_key', 'rate_card_instructions', 'vendor_default_locale', 'vendor_portal_base_url'];

export async function getOrgSettings() {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data } = await db
      .from('org_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();
    if (data) return { ...DEFAULTS, ...data };
  }
  const fromLs = {};
  for (const k of LS_FIELDS) {
    const v = localStorage.getItem(k);
    if (v != null) fromLs[k] = v;
  }
  return { ...DEFAULTS, ...fromLs };
}

export async function saveOrgSettings(patch) {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('org_settings').upsert(
      { org_id: orgId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' }
    );
    if (error) console.error('saveOrgSettings:', error);
  }
  for (const k of LS_FIELDS) {
    if (patch[k] !== undefined) localStorage.setItem(k, patch[k]);
  }
}
