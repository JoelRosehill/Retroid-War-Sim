/**
 * Single lookup for all 60 entity definitions, plus the derived indices the
 * AI and production systems need. Built once at module load and frozen.
 */
import { INFANTRY } from './infantry';
import { VEHICLES } from './vehicles';
import { AIRCRAFT } from './aircraft';
import { BUILDINGS } from './buildings';
import { DEFENSES } from './defenses';
import { EntityKind, type EntityDef, type BuildingDef } from './types';

export const ALL_DEFS: readonly EntityDef[] = [
  ...INFANTRY,
  ...VEHICLES,
  ...AIRCRAFT,
  ...BUILDINGS,
  ...DEFENSES,
];

const BY_ID = new Map<string, EntityDef>();
for (const def of ALL_DEFS) {
  if (BY_ID.has(def.id)) throw new Error(`Duplicate entity id: ${def.id}`);
  BY_ID.set(def.id, def);
}

export function defOf(id: string): EntityDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown entity id: ${id}`);
  return def;
}

export function tryDefOf(id: string): EntityDef | undefined {
  return BY_ID.get(id);
}

export const DEF_IDS: readonly string[] = ALL_DEFS.map((d) => d.id);

/** Which building can produce a given unit. Populated from `produces`. */
const PRODUCER_OF = new Map<string, string>();
for (const def of BUILDINGS) {
  for (const unitId of def.produces ?? []) {
    if (!PRODUCER_OF.has(unitId)) PRODUCER_OF.set(unitId, def.id);
  }
}

export function producerOf(unitId: string): string | undefined {
  return PRODUCER_OF.get(unitId);
}

export const DEFS_BY_KIND: Readonly<Record<EntityKind, readonly EntityDef[]>> = {
  [EntityKind.Infantry]: INFANTRY,
  [EntityKind.Vehicle]: VEHICLES,
  [EntityKind.Aircraft]: AIRCRAFT,
  [EntityKind.Building]: BUILDINGS,
  [EntityKind.Defense]: DEFENSES,
};

export const HEADQUARTERS_ID = 'commandCenter';

/** Buildings that raise the tech tier once constructed. */
export const TIER_UNLOCKS: readonly BuildingDef[] = BUILDINGS.filter(
  (b): b is BuildingDef => b.unlocksTier !== undefined && b.unlocksTier > 0,
);

export { INFANTRY, VEHICLES, AIRCRAFT, BUILDINGS, DEFENSES };
