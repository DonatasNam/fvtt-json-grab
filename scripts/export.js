import { EXPORT_DIR_NAME, FLAG_SALT, FLAG_SHARED_AT, MODULE_ID } from "./constants.js";
import { getBaseUrl, getLinkLifetimeMs } from "./settings.js";
import { buildAppPayload } from "./app-payload.js";

function filePicker() {
  return foundry.applications.apps.FilePicker.implementation;
}

/** Storage directory for this world's exports, relative to the Data root. */
export function exportDirectory() {
  return `worlds/${game.world.id}/${EXPORT_DIR_NAME}`;
}

/**
 * Only GMs may create directories (the server rejects everyone else BEFORE
 * checking whether the directory exists), so treat creation as best effort:
 * true when the directory exists or was created.
 */
export async function ensureExportDirectory() {
  try {
    await filePicker().createDirectory("data", exportDirectory());
    return true;
  } catch (err) {
    const message = String(err?.message ?? err).toLowerCase();
    return message.includes("eexist") || message.includes("already exists");
  }
}

/** Deterministic per document + salt. Uses the uuid so embedded items cannot collide. */
export function exportFileName(doc, salt) {
  return `${doc.uuid.replaceAll(".", "_")}-${salt}.json`;
}

/**
 * Mirrors the v14 ClientDocument#exportToJSON implementation verbatim:
 * toCompendium with clearSource kept, plus the _stats.exportSource stamp,
 * so the file is byte-identical to native Export Data and round-trips
 * through Import Data. Spike C verified via api.diffAgainstNative.
 * @param {ClientDocument} doc
 * @returns {string} pretty-printed JSON
 */
export function buildExportPayload(doc) {
  const data = doc.toCompendium(null, { clearSource: false });
  data._stats ??= {};
  data._stats.exportSource = {
    worldId: game.world.id,
    uuid: doc.uuid,
    coreVersion: game.version,
    systemId: game.system.id,
    systemVersion: game.system.version
  };
  return JSON.stringify(data, null, 2);
}

let landingSupported = false;

/**
 * The landing page only works when served as text/html, and Foundry serves
 * Data folder .html files as text/plain by design (anti XSS). A one-line
 * reverse proxy override fixes that (see README). Probe once per session;
 * without the override the module quietly falls back to raw JSON links.
 */
export async function detectLandingSupport() {
  try {
    const res = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/download.html`), {
      method: "HEAD",
      cache: "no-store"
    });
    landingSupported = res.ok && (res.headers.get("Content-Type") ?? "").includes("text/html");
  } catch (err) {
    landingSupported = false;
  }
  console.log(`${MODULE_ID} | download landing page ${landingSupported
    ? "enabled" : "not served as text/html, using raw JSON links (see README)"}`);
  return landingSupported;
}

/**
 * Absolute URL for a storage path returned by FilePicker.upload.
 * S3 and Forge style backends return absolute URLs already; the local
 * data backend returns a path relative to the Data root.
 */
export function buildFileUrl(storagePath) {
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  const route = foundry.utils.getRoute(storagePath.split("/").map(encodeURIComponent).join("/"));
  return getBaseUrl() + route;
}

/**
 * URL of the download landing page for a stored export. The page (shipped
 * with the module as download.html) fetches the JSON, names the file after
 * the document, and starts the download immediately. Falls back to the raw
 * URL for absolute storage paths (S3, Forge) where the same-origin page
 * could not fetch the file.
 */
export function buildLandingUrl(storagePath) {
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  const filePath = foundry.utils.getRoute(storagePath.split("/").map(encodeURIComponent).join("/"));
  const page = foundry.utils.getRoute(`modules/${MODULE_ID}/download.html`);
  return `${getBaseUrl()}${page}?f=${encodeURIComponent(filePath)}`;
}

let directoryChecked = false;

/**
 * Upload first: players may not create directories even when they already
 * exist, so a pre-upload createDirectory would always fail for them. When
 * the upload itself fails (usually a missing folder on a fresh world), try
 * to create the directory once (GMs can) and retry.
 */
async function uploadContent(fileName, content) {
  const file = new File([content], fileName, { type: "application/json" });
  const doUpload = async () => {
    const result = await filePicker().upload("data", exportDirectory(), file, {}, { notify: false });
    if (!result?.path) throw new Error(`upload to ${exportDirectory()} was rejected`);
    return result.path;
  };
  try {
    return await doUpload();
  } catch (err) {
    if (directoryChecked) throw err;
    directoryChecked = true;
    const available = await ensureExportDirectory();
    if (!available && !game.user.isGM) {
      throw new Error(`${game.i18n.localize("JSONGRAB.FolderMissing")} (${err.message ?? err})`);
    }
    return doUpload();
  }
}

/* -------------------------------------------- */
/*  Ephemeral share lifecycle                    */
/* -------------------------------------------- */

/**
 * Share links are ephemeral: each share arms a revoke timer for the
 * configured lifetime (default five minutes). Re-sharing inside the window
 * reuses the same URL and resets the clock; after expiry the salt rotates
 * so the next share gets a fresh URL. The timer lives in this GM client;
 * shares that outlive the session are cleaned up by sweepExpiredShares on
 * the next world load, since modules have no server-side code.
 */
const expiryTimers = new Map();

export function cancelExpiry(doc) {
  const id = expiryTimers.get(doc.uuid);
  if (id !== undefined) {
    clearTimeout(id);
    expiryTimers.delete(doc.uuid);
  }
}

export function scheduleExpiry(doc, delayMs) {
  cancelExpiry(doc);
  const id = setTimeout(() => {
    expiryTimers.delete(doc.uuid);
    revokeExport(doc).then(revoked => {
      if (revoked) console.log(`${MODULE_ID} | share expired for ${doc.uuid}`);
    }).catch(err => console.error(`${MODULE_ID} | failed to expire share for ${doc.uuid}`, err));
  }, delayMs);
  expiryTimers.set(doc.uuid, id);
}

/**
 * Write the document's export file, arm the expiry timer, and return the
 * shareable URLs plus the expiry timestamp.
 * @param {ClientDocument} doc
 * @returns {Promise<{url: string, pageUrl: string|null, path: string, fileName: string, expiresAt: number}>}
 */
export async function exportDocument(doc) {
  let salt = doc.getFlag(MODULE_ID, FLAG_SALT);
  const flags = { [FLAG_SHARED_AT]: Date.now() };
  if (!salt) {
    salt = foundry.utils.randomID(16);
    flags[FLAG_SALT] = salt;
  }
  await doc.update({ [`flags.${MODULE_ID}`]: flags });
  const fileName = exportFileName(doc, salt);
  // The shared file IS the app payload (decision 15). The native Foundry
  // export stays available through the dialog's Download button.
  const path = await uploadContent(fileName, buildAppPayload(doc));
  const lifetime = getLinkLifetimeMs();
  scheduleExpiry(doc, lifetime);
  return {
    url: buildFileUrl(path),
    pageUrl: landingSupported ? buildLandingUrl(path) : null,
    path,
    fileName,
    expiresAt: Date.now() + lifetime
  };
}

/**
 * Invalidate the current link: overwrite the file with a tombstone and
 * drop the flags so the next share produces a brand new URL. Foundry has
 * no client-side delete API, which is why the tombstone pattern is used.
 * @returns {Promise<boolean>} whether there was a link to revoke
 */
export async function revokeExport(doc) {
  cancelExpiry(doc);
  const salt = doc.getFlag(MODULE_ID, FLAG_SALT);
  if (!salt) return false;
  await uploadContent(exportFileName(doc, salt), JSON.stringify({ revoked: true }, null, 2));
  await doc.update({
    [`flags.${MODULE_ID}.-=${FLAG_SALT}`]: null,
    [`flags.${MODULE_ID}.-=${FLAG_SHARED_AT}`]: null
  });
  return true;
}

/**
 * Janitor pass for shares that outlived their GM session: revoke anything
 * already expired and re-arm timers for shares still inside their window.
 * Runs once on ready, on the active GM client only.
 */
export async function sweepExpiredShares() {
  const docs = [...game.items];
  for (const actor of game.actors) {
    docs.push(actor, ...actor.items);
  }
  const lifetime = getLinkLifetimeMs();
  const now = Date.now();
  for (const doc of docs) {
    if (!doc.getFlag(MODULE_ID, FLAG_SALT)) continue;
    const sharedAt = doc.getFlag(MODULE_ID, FLAG_SHARED_AT) ?? 0;
    const remaining = sharedAt + lifetime - now;
    if (remaining <= 0) {
      try {
        await revokeExport(doc);
        console.log(`${MODULE_ID} | swept expired share for ${doc.uuid}`);
      } catch (err) {
        console.error(`${MODULE_ID} | failed to sweep share for ${doc.uuid}`, err);
      }
    } else {
      scheduleExpiry(doc, remaining);
    }
  }
}
