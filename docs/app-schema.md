# JSON Grab App Schema

The contract between this module (payload generator) and the offline companion app.
The app must depend on THIS document only, never on Foundry or dnd5e internals.

## URL contract

A shared QR encodes the landing page URL:

```
https://<host>/modules/json-grab/download.html?f=<urlencoded absolute path>
```

The app extracts the `f` query parameter and fetches `https://<host><f>` to get the
payload. Without the reverse proxy rule (see README), the QR encodes the payload URL
directly instead; the app should handle both by checking for the `f` parameter.

Links are ephemeral: they expire a few minutes after sharing (GM-configurable). A
revoked or expired link serves `{"revoked": true}`; treat that as "ask the GM to share
again", never as an error worth deleting local data over.

## Sync semantics

- Key local storage by `uuid`. A re-scan of the same document updates the existing
  entry, never duplicates it.
- `updatedAt` (ms since epoch, stamped at share time) tells you whether the scanned
  payload is newer than the stored one.
- `img` is an absolute URL. Fetch and cache it at scan time (connectivity exists in
  that moment); show a placeholder offline.

## Payload: common envelope (all kinds, all systems)

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | Currently `1`. Breaking changes bump it; additive changes do not |
| `kind` | string | `"actor"` or `"item"` |
| `uuid` | string | Foundry document uuid, the storage key |
| `systemId` | string | e.g. `"dnd5e"`. Payloads from other systems carry `type` + raw prepared `system` instead of the rich fields below |
| `updatedAt` | number | Share timestamp in ms |
| `name` | string | |
| `img` | string or null | Absolute URL |

## dnd5e actor payload (`kind: "actor"`, `systemId: "dnd5e"`)

All values come from Foundry's PREPARED data: they are the final numbers a sheet
shows, including derived AC, proficiency, skill totals, and spell slot maximums.

| Field | Shape | Notes |
|---|---|---|
| `type` | string | `"character"`, `"npc"`, ... |
| `level` | number or null | Character level (null for NPCs) |
| `cr` | number or null | Challenge rating (NPCs) |
| `classes` | `[{name, levels}]` | |
| `hp` | `{value, max, temp}` | `max` already includes temp max adjustments |
| `ac` | number | |
| `proficiency` | number | |
| `speed` | number or null | Walking speed |
| `abilities` | `{str: {score, mod, save}, ...}` | `save` is the total save bonus |
| `skills` | `{prc: {total, passive, ability, proficient}, ...}` | dnd5e three-letter skill keys |
| `spellcasting` | `{ability, dc, attack}` or null | Sheet-level spell save DC and spell attack bonus, final values |
| `slots` | `{"1": {value, max}, ..., "pact": {value, max}}` | Only levels with `max > 0` are present |
| `resources` | `[{label, value, max}]` | Only configured resources |
| `currency` | `{pp, gp, ep, sp, cp}` | |
| `items` | `[{name, type, quantity?, uses?, equipped?, damage?, attack?, save?, ...spell fields}]` | Lean summaries; `uses` = `{value, max}` |

Any item that deals or heals (weapons, consumables, feats, spells) carries, with all
modifiers already applied:
- `damage`: `[{formula, type, label}]`, e.g. `{formula: "1d6 + 2", type: "piercing", label: "1d6 + 2 Piercing"}`
  (healing uses `type: "healing"`)
- `attack`: to-hit display string like `"+6"` (present when the item makes attack rolls)
- `save`: save DC display string (present when the item forces a save)

Spell entries (`type: "spell"`) additionally carry full casting details, all as final
display strings from dnd5e's prepared labels:
`level`, `prepared`, `mode` (prepared/atwill/innate/pact), `school`, `castTime`,
`range`, `duration`, `components` (e.g. `"V, S, M"`), `target`,
`concentration` (bool), `ritual` (bool), and `description`
(HTML string; may contain Foundry content links to strip or ignore).

## dnd5e item payload (`kind: "item"`)

Item summary fields (as in the actor's `items` list) plus `description`
(HTML string or null).

## Versioning rules

- The module may ADD fields within a schema version; the app must ignore unknown fields.
- Removing or renaming a field, or changing a type, bumps `schemaVersion`, and this
  document records the migration note.
