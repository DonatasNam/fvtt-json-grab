import { MODULE_ID } from "./constants.js";
import { SETTINGS } from "./settings.js";

/**
 * Single gate deciding who may share a document. Milestone 3 extends the
 * exportPermission setting with "owner" and "observer" modes and adds a
 * GM socket relay for players who lack Foundry's file upload permission.
 * Everything else in the module calls this and never checks roles itself.
 * @param {User} user
 * @param {ClientDocument} doc
 * @returns {boolean}
 */
export function canExport(user, doc) {
  if (!doc || doc.pack) return false; // world documents only, matching core Export Data
  const mode = game.settings.get(MODULE_ID, SETTINGS.EXPORT_PERMISSION);
  switch (mode) {
    case "gm":
    default:
      return user.isGM;
  }
}
