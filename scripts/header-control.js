import { MODULE_ID } from "./constants.js";
import { canExport } from "./permissions.js";
import { exportDocument } from "./export.js";
import { openShareDialog } from "./qr-dialog.js";

/**
 * Handler for the getHeaderControlsApplicationV2 hook. Fires for every
 * ApplicationV2 render, so it stays cheap and returns early for anything
 * that is not an Actor or Item sheet.
 * @param {ApplicationV2} app
 * @param {ApplicationHeaderControlsEntry[]} controls
 */
export function onGetHeaderControls(app, controls) {
  const doc = app.document;
  if (!doc || !["Actor", "Item"].includes(doc.documentName)) return;
  if (!canExport(game.user, doc)) return;
  controls.push({
    icon: "fa-solid fa-qrcode",
    label: game.i18n.localize("JSONGRAB.ShareButton"),
    action: "jsonGrabShare",
    visible: () => canExport(game.user, doc),
    onClick: () => share(doc)
  });
}

const BUTTON_CLASS = "json-grab-button";

/**
 * Handler for the renderApplicationV2 hook. Besides the entry in the
 * header controls dropdown, inject an always visible QR icon into the
 * window header, styled like core's own header-control buttons and
 * inserted before the close button (same technique the PopOut module
 * uses). Renders can happen repeatedly on the same frame, so it guards
 * against inserting twice.
 * @param {ApplicationV2} app
 */
export function onRenderSheet(app) {
  const doc = app.document;
  if (!doc || !["Actor", "Item"].includes(doc.documentName)) return;
  if (!canExport(game.user, doc)) return;
  const header = app.element?.querySelector(".window-header");
  if (!header || header.querySelector(`.${BUTTON_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `header-control icon fa-solid fa-qrcode ${BUTTON_CLASS}`;
  const label = game.i18n.localize("JSONGRAB.ShareButton");
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => share(doc));
  const close = header.querySelector('[data-action="close"]');
  if (close) close.before(button);
  else header.appendChild(button);
}

/** Export the document and show the QR dialog. Also exposed on the module api. */
export async function share(doc) {
  try {
    const exported = await exportDocument(doc);
    console.log(`${MODULE_ID} | exported ${doc.uuid} to ${exported.url}`);
    await openShareDialog(doc, exported);
  } catch (err) {
    console.error(`${MODULE_ID} | export failed`, err);
    ui.notifications.error(game.i18n.format("JSONGRAB.ExportFailed", { error: err.message ?? err }));
  }
}
