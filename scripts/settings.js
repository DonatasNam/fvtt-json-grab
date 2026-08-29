import { MODULE_ID } from "./constants.js";

export const SETTINGS = {
  BASE_URL: "baseUrl",
  LINK_LIFETIME: "linkLifetimeMinutes",
  EXPORT_PERMISSION: "exportPermission"
};

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.BASE_URL, {
    name: "JSONGRAB.Settings.BaseUrl.Name",
    hint: "JSONGRAB.Settings.BaseUrl.Hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.LINK_LIFETIME, {
    name: "JSONGRAB.Settings.LinkLifetime.Name",
    hint: "JSONGRAB.Settings.LinkLifetime.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 5
  });

  // Registered from day one so stored values survive the milestone 3 upgrade
  // that adds owner and observer choices plus the GM socket relay.
  // Hidden from the settings UI until then.
  game.settings.register(MODULE_ID, SETTINGS.EXPORT_PERMISSION, {
    name: "JSONGRAB.Settings.ExportPermission.Name",
    hint: "JSONGRAB.Settings.ExportPermission.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: { gm: "JSONGRAB.Settings.ExportPermission.GM" },
    default: "gm"
  });
}

/**
 * Origin used to build shareable links. The override setting wins;
 * otherwise the address this browser is connected with. A route prefix,
 * when the server uses one, is appended later by foundry.utils.getRoute.
 * @returns {string} origin without a trailing slash
 */
export function getBaseUrl() {
  const override = game.settings.get(MODULE_ID, SETTINGS.BASE_URL)?.trim();
  const base = override || window.location.origin;
  return base.replace(/\/+$/, "");
}

/** Share link lifetime in milliseconds, clamped to at least one minute. */
export function getLinkLifetimeMs() {
  const minutes = Number(game.settings.get(MODULE_ID, SETTINGS.LINK_LIFETIME)) || 5;
  return Math.max(1, minutes) * 60000;
}
