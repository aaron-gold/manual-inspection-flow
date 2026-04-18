import uniquePartsAndDamages from '@/data/uniquePartsAndDamages.json';

export type CatalogEntry = {
  category: string;
  kind: 'Part' | 'Damage';
  name: string;
};

/** Inspector-facing order (matches common walk-around flow). */
export const CATALOG_AREA_ORDER = ['Exterior', 'Interior', 'Mechanical', 'Frame'] as const;

export type CatalogArea = (typeof CATALOG_AREA_ORDER)[number];

export const UNIQUE_PARTS_AND_DAMAGES = uniquePartsAndDamages as CatalogEntry[];

function sortedUniqueNames(map: Map<string, Set<string>>, category: string): string[] {
  const set = map.get(category);
  if (!set || set.size === 0) return [];
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** One pass over the flat catalog: parts and damages grouped by category. */
export function indexCatalogByCategory(entries: readonly CatalogEntry[]): {
  partsByCategory: Map<string, string[]>;
  damagesByCategory: Map<string, string[]>;
} {
  const partSets = new Map<string, Set<string>>();
  const damageSets = new Map<string, Set<string>>();
  for (const row of entries) {
    const c = row.category?.trim();
    const n = row.name?.trim();
    if (!c || !n) continue;
    if (row.kind === 'Part') {
      if (!partSets.has(c)) partSets.set(c, new Set());
      partSets.get(c).add(n);
    } else if (row.kind === 'Damage') {
      if (!damageSets.has(c)) damageSets.set(c, new Set());
      damageSets.get(c).add(n);
    }
  }
  const categories = new Set([...partSets.keys(), ...damageSets.keys()]);
  const partsByCategory = new Map<string, string[]>();
  const damagesByCategory = new Map<string, string[]>();
  for (const c of categories) {
    partsByCategory.set(c, sortedUniqueNames(partSets, c));
    damagesByCategory.set(c, sortedUniqueNames(damageSets, c));
  }
  return { partsByCategory, damagesByCategory };
}
