import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { detectLandingSupport, revokeExport, sweepExpiredShares } from "./export.js";
import { onGetHeaderControls, onRenderSheet, share } from "./header-control.js";
import { spikeA, diffAgainstNative } from "./spikes.js";

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | initialized`);
});

Hooks.on("getHeaderControlsApplicationV2", onGetHeaderControls);
Hooks.on("renderApplicationV2", onRenderSheet);

Hooks.once("ready", () => {
  // Public api: share(doc) for macros and other modules, plus the
  // milestone 0 spike helpers (see scripts/spikes.js and PLAN.md).
  game.modules.get(MODULE_ID).api = { share, revoke: revokeExport, spikeA, diffAgainstNative };
  detectLandingSupport();
  // Janitor for shares whose expiry timer died with a closed GM session.
  if (game.user === game.users.activeGM) {
    sweepExpiredShares().catch(err => console.error(`${MODULE_ID} | share sweep failed`, err));
  }
  console.log(`${MODULE_ID} | ready`);
});
