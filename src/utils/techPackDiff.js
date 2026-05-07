// Computes a human-readable list of changed fields between two tech-pack
// data snapshots. Only tracks fields that are meaningful to production — not
// every key in DEFAULT_DATA. Returns an array of display labels.

const TRACKED = [
  ['styleNumber',        'Style Number'],
  ['status',             'Status'],
  ['productCategory',    'Product Category'],
  ['collection',         'Collection'],
  ['productType',        'Product Type'],
  ['season',             'Season'],
  ['targetRetail',       'Target Retail'],
  ['weightKg',           'Weight (kg)'],
  ['vendor',             'Vendor'],
  ['vendorContact',      'Vendor Contact'],
  ['fabricType',         'Fabric Type'],
  ['sizeRange',          'Size Range'],
  ['colorways',          'Colorways'],
  ['bom',                'Bill of Materials'],
  ['fabrics',            'Fabrics'],
  ['poms',               'Points of Measure'],
  ['seams',              'Seams'],
  ['patternPieces',      'Pattern Pieces'],
  ['treatments',         'Treatments'],
  ['constructionNotes',  'Construction Notes'],
  ['careInstructions',   'Care Instructions'],
  ['designNotes',        'Design Notes'],
  ['artworkPlacements',  'Artwork Placements'],
  ['finalApproval',      'Final Approval'],
  ['costTiers',          'Quote Tiers'],
  ['leadTimeDays',       'Lead Time'],
  ['sampleLeadTimeDays', 'Sample Lead Time'],
  ['sampleCost',         'Sample Cost'],
  ['testingStandards',   'Testing Standards'],
  ['quantities',         'Order Quantities'],
  ['shipMethod',         'Ship Method'],
  ['targetShipDate',     'Target Ship Date'],
];

export function computePackDiff(prevData, nextData) {
  const changed = [];
  for (const [key, label] of TRACKED) {
    if (JSON.stringify(prevData[key] ?? null) !== JSON.stringify(nextData[key] ?? null)) {
      changed.push(label);
    }
  }
  return changed;
}
