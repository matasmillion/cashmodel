// Knowledge questionnaire schemas.
//
// Each `kind` (avatar | brand | product | models) defines a list of
// fields the editor renders. The store saves the raw answers as a
// jsonb blob; the brief-generation prompt assembles them into prose.
//
// Field shapes:
//   { key, label, type, hint?, placeholder?, required?, multiple? }
// type:
//   'text'        single-line input
//   'textarea'    multi-line input
//   'list'        list of strings (one bullet per line)
//   'group'       { repeating: true, fields: [...] }  — used for the
//                 avatar's multi-persona schema and model lanes
//   'photos'      list of asset refs (Storage paths). Renders as a
//                 thumbnail grid with upload + remove. Inside a
//                 repeating-group item this also unlocks the
//                 per-item "Analyze with AI" button.

/** @type {Record<string, { label: string, description: string, fields: any[] }>} */
export const KNOWLEDGE_SCHEMAS = {
  avatar: {
    label: 'Customer Avatar',
    description: 'Who buys FR. Drives every brief\'s tone, hook angle, and language choice.',
    fields: [
      {
        key: 'personas',
        label: 'Personas',
        type: 'group',
        repeating: true,
        addLabel: 'Add another persona',
        fields: [
          { key: 'name', label: 'Persona name', type: 'text', placeholder: 'e.g. The Founder Aesthetic Buyer', required: true },
          { key: 'one_liner', label: 'One-liner', type: 'text', placeholder: 'A sentence that captures who they are' },
          { key: 'demographic', label: 'Demographic', type: 'textarea', placeholder: 'Age, income, location, lifestyle context' },
          { key: 'core_desire', label: 'Core desire', type: 'textarea', hint: 'What does the garment do for their identity?' },
          { key: 'pain_points', label: 'Pain points', type: 'list', hint: 'What\'s broken about how they currently buy clothes?' },
          { key: 'scroll_stoppers', label: 'Scroll-stopping hooks', type: 'list', hint: 'Specific visual or verbal triggers that convert them' },
          { key: 'words_they_use', label: 'Words/phrases they use', type: 'list', hint: 'Their actual vocabulary about clothes' },
          { key: 'trust_triggers', label: 'What earns their trust', type: 'list' },
        ],
      },
    ],
  },

  brand: {
    label: 'Brand Guidelines',
    description: 'Voice, tone, and the rules that make every ad feel like FR.',
    fields: [
      { key: 'voice_adjectives', label: 'Voice adjectives', type: 'list', hint: '3–6 words that describe how FR sounds (e.g. considered, quiet confidence, earned luxury)' },
      { key: 'we_say', label: 'Phrases we use', type: 'list', hint: 'Specific words/phrases that are on-brand' },
      { key: 'we_never_say', label: 'Phrases we never use', type: 'list', hint: 'Words or claim styles that are off-brand' },
      { key: 'tone_per_lane', label: 'Tone per lane', type: 'group', repeating: false, fields: [
        { key: 'ai', label: 'AI lane tone', type: 'textarea', placeholder: 'e.g. product-forward, tactile detail, ASMR-adjacent' },
        { key: 'high_production', label: 'High Production lane tone', type: 'textarea', placeholder: 'e.g. editorial stillness, luxury hospitality' },
        { key: 'creator', label: 'Creator lane tone', type: 'textarea', placeholder: 'e.g. authentic, educational, POV walkthrough' },
        { key: 'founder', label: 'Founder lane tone', type: 'textarea', placeholder: 'e.g. direct-to-camera, conviction-driven, no polished lighting' },
      ]},
      { key: 'visual_rules', label: 'Visual rules', type: 'list', hint: 'Things that always (or never) appear visually — palette, framing, logo treatment' },
      { key: 'never_in_creative', label: 'What FR never does in creative', type: 'list' },
    ],
  },

  product: {
    label: 'Product Knowledge',
    description: 'Hero SKU specs and what we can say (and never say) about them.',
    fields: [
      {
        key: 'hero_skus',
        label: 'Hero SKUs',
        type: 'group',
        repeating: true,
        addLabel: 'Add another SKU',
        analyzeScope: 'sku_item',
        fields: [
          { key: 'photos', label: 'Product photos', type: 'photos', hint: 'Upload from multiple angles. Click "Analyze with AI" to auto-fill the rest of this card.' },
          { key: 'name', label: 'SKU name', type: 'text', placeholder: 'e.g. Snowflake Staple Hoodie', required: true },
          { key: 'price_usd', label: 'Retail price (USD)', type: 'text', placeholder: 'e.g. 117' },
          { key: 'material_story', label: 'Material story', type: 'textarea', hint: 'Composition, GSM, hand feel, wash treatment' },
          { key: 'construction', label: 'Construction differentiators', type: 'textarea', hint: 'Seam placement, ribbing gauge, hardware, what\'s special about how it\'s made' },
          { key: 'fit_philosophy', label: 'Fit philosophy', type: 'text', placeholder: 'e.g. relaxed, made-for-movement, boxy' },
          { key: 'who_its_for', label: 'Who it\'s for', type: 'textarea', hint: 'Which avatar persona — and the situation they wear it in' },
          { key: 'price_justification', label: 'What justifies the price', type: 'textarea' },
        ],
      },
      { key: 'claims_we_make', label: 'Claims we can make in creative', type: 'list', hint: 'Specific factual claims with proof (e.g. "580 GSM" — what it means)' },
      { key: 'claims_we_avoid', label: 'Claims we never make', type: 'list', hint: 'e.g. "luxury" without visual proof, vague origin claims' },
    ],
  },

  models: {
    label: 'AI Model Credentials',
    description: 'Which model/talent runs which lane. Only AI and High Production lanes consult this.',
    fields: [
      {
        key: 'lanes',
        label: 'Lanes',
        type: 'group',
        repeating: false,
        fields: [
          { key: 'ai_model_id', label: 'fal.ai model ID (AI lane)', type: 'text', placeholder: 'e.g. fal-ai/flux/dev' },
          { key: 'ai_workflow', label: 'AI lane workflow notes', type: 'textarea', placeholder: 'e.g. 4 variants per brief, 1080x1920, 4s video' },
          { key: 'ai_trigger_phrases', label: 'AI lane brand LoRA trigger phrases', type: 'list' },
          { key: 'high_prod_workspace', label: 'Higgsfield workspace ID (High Production)', type: 'text' },
          { key: 'high_prod_preset', label: 'Higgsfield preset key', type: 'text', placeholder: 'e.g. product-hero-v3' },
          { key: 'high_prod_workflow', label: 'High Production workflow notes', type: 'textarea' },
          { key: 'creator_soul_id', label: 'Higgsfield Soul ID (Creator)', type: 'text' },
          { key: 'creator_persona', label: 'Creator persona reference', type: 'textarea' },
          { key: 'founder_soul_id', label: 'Higgsfield Soul ID (Founder)', type: 'text' },
          { key: 'founder_persona', label: 'Founder persona reference', type: 'textarea' },
        ],
      },
    ],
  },
};

export const KNOWLEDGE_KINDS = Object.keys(KNOWLEDGE_SCHEMAS);

// Lanes that need the models knowledge file. Creator and Founder lanes
// use real talent + Soul IDs but the rendering side reads those out
// of the same models knowledge row anyway, so we keep all four.
export const LANES_NEEDING_MODELS = new Set(['ai', 'high_production', 'creator', 'founder']);

/**
 * Returns the empty starter shape for a given knowledge kind.
 * Used when the user hits the editor for the first time.
 */
export function emptyKnowledge(kind) {
  return { kind, fields: {} };
}
