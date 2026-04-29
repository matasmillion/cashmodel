import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

export async function getOrgSettings() {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data } = await db
      .from('org_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();
    if (data) return data;
  }
  return {
    anthropic_api_key: localStorage.getItem('anthropic_api_key') || '',
    rate_card_instructions: localStorage.getItem('rate_card_instructions') || '',
  };
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
  if (patch.anthropic_api_key !== undefined)
    localStorage.setItem('anthropic_api_key', patch.anthropic_api_key);
  if (patch.rate_card_instructions !== undefined)
    localStorage.setItem('rate_card_instructions', patch.rate_card_instructions);
}
