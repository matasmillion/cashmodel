// JSDoc typedefs for the Creative Engine module.
// Enums are plain objects so they can be used in runtime checks.

/** @enum {string} */
export const LANES = {
  AI: 'ai',
  HIGH_PRODUCTION: 'high_production',
  CREATOR: 'creator',
  FOUNDER: 'founder',
};

/** @enum {string} */
export const SPRINT_STATUSES = {
  DRAFTING: 'drafting',
  BRIEF_READY: 'brief_ready',
  RENDERING: 'rendering',
  IN_QUEUE: 'in_queue',
  LIVE: 'live',
  CLOSED: 'closed',
};

/** @enum {string} */
export const RENDER_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/** @enum {string} */
export const AD_STATUSES = {
  PAUSED: 'paused',
  ACTIVE: 'active',
  KILLED: 'killed',
  SCALED: 'scaled',
};

/** @enum {string} */
export const LEARNING_OUTCOMES = {
  WINNER: 'winner',
  LOSER: 'loser',
  INCONCLUSIVE: 'inconclusive',
};

export const LANE_VALUES = Object.values(LANES);
export const SPRINT_STATUS_VALUES = Object.values(SPRINT_STATUSES);
export const RENDER_STATUS_VALUES = Object.values(RENDER_STATUSES);
export const AD_STATUS_VALUES = Object.values(AD_STATUSES);

/** Returns true if s is a valid lane value. @param {string} s */
export function isValidLane(s) {
  return LANE_VALUES.includes(s);
}

/**
 * Builds the canonical ad name for a Meta ad.
 * @param {number} sprintNumber
 * @param {string} lane
 * @param {string} slug  short kebab slug (e.g. "hoodie-scroll")
 * @param {number} version  1-indexed
 * @returns {string}  e.g. "S25_ai_hoodie-scroll_v1"
 */
export function buildAdNaming(sprintNumber, lane, slug, version) {
  return `S${sprintNumber}_${lane}_${slug}_v${version}`;
}

/**
 * @typedef {Object} Sprint
 * @property {string} id
 * @property {string} organization_id
 * @property {number} sprint_number
 * @property {string} lane
 * @property {string} status
 * @property {string} hypothesis_type
 * @property {string} constraint_text
 * @property {string|null} next_constraint_seed
 * @property {number|null} cpa_target
 * @property {number} kill_multiplier
 * @property {number} scale_threshold
 * @property {string|null} closed_at
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Brief
 * @property {string} id
 * @property {string} organization_id
 * @property {string} sprint_id
 * @property {number} version
 * @property {string} status
 * @property {string} hypothesis
 * @property {string} key_feeling
 * @property {string} hook
 * @property {string} payoff
 * @property {Array} shot_list
 * @property {string} caption
 * @property {string} prompt_blueprint
 * @property {Array} past_learnings_consulted
 * @property {string} agent_model
 * @property {string|null} generated_at
 * @property {string|null} approved_by
 * @property {string|null} approved_at
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Render
 * @property {string} id
 * @property {string} organization_id
 * @property {string} brief_id
 * @property {string} sprint_id
 * @property {number} variant_index
 * @property {string} status
 * @property {string} provider
 * @property {string|null} raw_url
 * @property {string|null} encoded_url
 * @property {boolean} encoder_passed
 * @property {string|null} provider_job_id
 * @property {number|null} duration_sec
 * @property {string|null} approved_by
 * @property {string|null} approved_at
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Ad
 * @property {string} id
 * @property {string} organization_id
 * @property {string} render_id
 * @property {string} sprint_id
 * @property {string} ad_name
 * @property {string|null} meta_campaign_id
 * @property {string|null} meta_adset_id
 * @property {string|null} meta_ad_id
 * @property {string} status
 * @property {string|null} recommendation
 * @property {number} spend_to_date
 * @property {number} impressions
 * @property {number} clicks
 * @property {number} conversions
 * @property {number|null} cpa
 * @property {string} utm_params
 * @property {string|null} idempotency_key
 * @property {string|null} published_at
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} MetricsDaily
 * @property {string} id
 * @property {string} organization_id
 * @property {string} ad_id
 * @property {string} date  ISO date string
 * @property {number} spend
 * @property {number} impressions
 * @property {number} clicks
 * @property {number} conversions
 * @property {number|null} cpa
 * @property {number|null} ctr
 * @property {string} created_at
 */

/**
 * @typedef {Object} Learning
 * @property {string} id
 * @property {string} organization_id
 * @property {string|null} sprint_id
 * @property {string} lane
 * @property {string} hypothesis_type
 * @property {string} outcome
 * @property {string} summary
 * @property {Array<string>} tags
 * @property {string|null} seeded_from
 * @property {string} created_at
 */

/**
 * @typedef {Object} Discussion
 * @property {string} id
 * @property {string} organization_id
 * @property {string|null} sprint_id
 * @property {string} synthesis_draft
 * @property {string} final_text
 * @property {boolean} finalized
 * @property {string|null} finalized_at
 * @property {string|null} next_constraint_seed
 * @property {Array} messages
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} BudgetConfig
 * @property {string} id
 * @property {string} organization_id
 * @property {number} weekly_cap
 * @property {number} alert_threshold
 * @property {boolean} writes_enabled
 * @property {number|null} cpa_target
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} CreativeLibraryItem
 * @property {string} id
 * @property {string} organization_id
 * @property {string} kind
 * @property {string} title
 * @property {string} url
 * @property {string|null} thumbnail_url
 * @property {string} notes
 * @property {Array<string>} tags
 * @property {string|null} source
 * @property {boolean} archived
 * @property {string} created_at
 * @property {string} updated_at
 */
