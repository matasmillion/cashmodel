// Knowledge file loader for the brief generation system.
// Returns the subset of knowledge files relevant to a given lane.
// Files are imported as raw strings at build time via Vite's ?raw loader.

import avatarRaw from './avatar.md?raw';
import brandRaw from './brand.md?raw';
import productRaw from './product.md?raw';
import modelsRaw from './models.md?raw';

// Creator and Founder lanes use real talent, not AI model configs.
const LANES_NEEDING_MODELS = new Set(['ai', 'high_production']);

/**
 * Returns the knowledge file contents relevant to the given lane.
 * @param {string} lane  one of: ai | high_production | creator | founder
 * @returns {{ avatar: string, brand: string, product: string, models: string|null }}
 */
export function getKnowledgeForLane(lane) {
  return {
    avatar: avatarRaw,
    brand: brandRaw,
    product: productRaw,
    models: LANES_NEEDING_MODELS.has(lane) ? modelsRaw : null,
  };
}
