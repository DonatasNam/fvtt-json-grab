import { MODULE_ID } from "./constants.js";
import { SETTINGS } from "./settings.js";

/**
 * Single gate deciding who may share a document, driven by the world
 * setting: "gm" (default), "owner", or "observer". Non-GM users also need
 * Foundry's FILES_UPLOAD permission, because the share writes a file with
 * the sharing user's own rights (no GM relay involved).
 * @param {User} user
 * @param {ClientDocument} doc
 * @returns {boolean}
 */
export function canExport(user, doc) {
  if (!doc || doc.pack) return false; // world documents only, matching core Export Data
  if (user.isGM) return true;
  if (!user.can("FILES_UPLOAD")) return false;
  const mode = game.settings.get(MODULE_ID, SETTINGS.EXPORT_PERMISSION);
  switch (mode) {
    case "observer":
      return doc.testUserPermission(user, "OBSERVER");
    case "owner":
      return doc.testUserPermission(user, "OWNER");
    case "gm":
    default:
      return false;
  }
}
