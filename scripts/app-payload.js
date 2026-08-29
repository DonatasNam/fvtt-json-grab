import { getBaseUrl } from "./settings.js";

/**
 * The companion app payload: a small, stable, versioned snapshot built from
 * the PREPARED document (derived values included), so the app never needs to
 * reimplement system rules. dnd5e gets a rich mapping; every other system
 * falls back to a generic payload. Bump SCHEMA_VERSION on breaking changes
 * and document them in docs/app-schema.md.
 */
export const SCHEMA_VERSION = 1;

/**
 * Absolute URL for a document image so the app can cache it at scan time.
 * Foundry usually stores paths already percent-encoded; encode only paths
 * that show no escape sequences, or spaces would double-encode to %2520.
 */
function absoluteImg(img) {
  if (!img) return null;
  if (/^(https?:)?\/\//i.test(img) || img.startsWith("data:")) return img;
  const encoded = /%[0-9a-f]{2}/i.test(img) ? img : encodeURI(img);
  return getBaseUrl() + foundry.utils.getRoute(encoded);
}

function base(doc) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: doc.documentName.toLowerCase(),
    uuid: doc.uuid,
    systemId: game.system.id,
    updatedAt: Date.now(),
    name: doc.name ?? null,
    img: absoluteImg(doc.img)
  };
}

/**
 * Compact list entry for an owned item. Non-spell items stay lean (no
 * images, no descriptions). Spells carry full casting details, because an
 * offline sheet must let players read what they are casting: display
 * strings come from dnd5e's prepared item.labels, so numbers like
 * "1d4 + 5 Hit Points" arrive final, with no rules math left for the app.
 */
function dnd5eItemSummary(item) {
  const s = item.system ?? {};
  const labels = item.labels ?? {};
  const entry = { name: item.name, type: item.type };
  if (s.quantity !== undefined && s.quantity !== 1) entry.quantity = s.quantity;
  if (s.uses?.max) entry.uses = { value: s.uses.value ?? 0, max: s.uses.max };
  if (s.equipped !== undefined) entry.equipped = s.equipped;
  // Damage, attack and save labels exist on any item type that deals or
  // heals (weapons, consumables, feats, spells), with modifiers final.
  const damage = (labels.damages ?? []).map(d => ({
    formula: d.formula ?? null,
    type: d.damageType ?? null,
    label: d.label ?? null
  }));
  if (damage.length) entry.damage = damage;
  if (labels.toHit) entry.attack = labels.toHit;
  if (labels.save) entry.save = labels.save;
  if (item.type === "spell") {
    entry.level = s.level ?? null;
    entry.prepared = s.preparation?.prepared ?? null;
    entry.mode = s.preparation?.mode ?? null;
    entry.school = labels.school ?? s.school ?? null;
    entry.castTime = labels.activation ?? null;
    entry.range = labels.range ?? null;
    entry.duration = labels.duration ?? null;
    entry.components = labels.components?.vsm ?? null;
    entry.target = labels.target ?? null;
    entry.concentration = s.properties?.has?.("concentration") ?? false;
    entry.ritual = s.properties?.has?.("ritual") ?? false;
    entry.description = s.description?.value ?? null;
  }
  return entry;
}

/** Shapes verified against live dnd5e 5.3.3 prepared data (see PLAN.md M5). */
function mapDnd5eActor(actor) {
  const s = actor.system ?? {};
  const hp = s.attributes?.hp ?? {};

  const abilities = {};
  for (const [key, a] of Object.entries(s.abilities ?? {})) {
    abilities[key] = {
      score: a.value ?? null,
      mod: a.mod ?? null,
      save: a.save?.value ?? (typeof a.save === "number" ? a.save : null)
    };
  }

  const skills = {};
  for (const [key, sk] of Object.entries(s.skills ?? {})) {
    skills[key] = {
      total: sk.total ?? null,
      passive: sk.passive ?? null,
      ability: sk.ability ?? null,
      proficient: sk.proficient ?? 0
    };
  }

  // Only levels the actor actually has slots for; "pact" keeps its name.
  const slots = {};
  for (const [key, slot] of Object.entries(s.spells ?? {})) {
    const max = slot?.max ?? 0;
    if (max > 0) {
      const slotKey = key === "pact" ? "pact" : String(slot.level ?? key.replace("spell", ""));
      slots[slotKey] = { value: slot.value ?? 0, max };
    }
  }

  const resources = [];
  for (const r of Object.values(s.resources ?? {})) {
    if (r?.label || r?.max) resources.push({ label: r.label ?? "", value: r.value ?? 0, max: r.max ?? 0 });
  }

  const castingAbility = s.attributes?.spellcasting || null;
  const castingStats = castingAbility ? s.abilities?.[castingAbility] : null;

  return {
    type: actor.type,
    level: s.details?.level ?? null,
    cr: s.details?.cr ?? null,
    classes: Object.values(actor.classes ?? {}).map(c => ({ name: c.name, levels: c.system?.levels ?? null })),
    spellcasting: castingStats
      ? { ability: castingAbility, dc: castingStats.dc ?? null, attack: castingStats.attack ?? null }
      : null,
    hp: {
      value: hp.value ?? 0,
      max: hp.effectiveMax ?? hp.max ?? 0,
      temp: hp.temp ?? 0
    },
    ac: s.attributes?.ac?.value ?? null,
    proficiency: s.attributes?.prof ?? null,
    speed: s.attributes?.movement?.walk ?? null,
    abilities,
    skills,
    slots,
    resources,
    currency: s.currency ?? null,
    items: actor.items.map(dnd5eItemSummary)
  };
}

/** Full payload for sharing a single Item sheet. */
function mapDnd5eItem(item) {
  const summary = dnd5eItemSummary(item);
  return {
    ...summary,
    description: item.system?.description?.value ?? null
  };
}

/** Non-dnd5e systems: prepared system data as-is, for the app to interpret. */
function mapGeneric(doc) {
  const system = doc.system?.toObject ? doc.system.toObject() : (doc.system ?? null);
  return { type: doc.type ?? null, system };
}

/**
 * Build the app payload JSON string for any shared document.
 * @param {ClientDocument} doc
 * @returns {string} pretty-printed JSON matching docs/app-schema.md
 */
export function buildAppPayload(doc) {
  const payload = base(doc);
  if (game.system.id === "dnd5e" && doc.documentName === "Actor") {
    Object.assign(payload, mapDnd5eActor(doc));
  } else if (game.system.id === "dnd5e" && doc.documentName === "Item") {
    Object.assign(payload, mapDnd5eItem(doc));
  } else {
    Object.assign(payload, mapGeneric(doc));
  }
  return JSON.stringify(payload, null, 2);
}
