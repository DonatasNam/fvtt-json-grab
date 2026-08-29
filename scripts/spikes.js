import { MODULE_ID } from "./constants.js";
import {
  buildExportPayload,
  buildFileUrl,
  ensureExportDirectory,
  exportDirectory
} from "./export.js";

/**
 * Spike A: prove that an uploaded JSON file is fetchable WITHOUT a Foundry
 * session, through the same origin players use.
 *
 * Run from a GM client console:
 *   await game.modules.get("json-grab").api.spikeA()
 *
 * The in-browser check uses fetch with credentials omitted, which
 * approximates an anonymous visitor. For the real thing, also open the
 * printed URL from a phone that is NOT on your LAN.
 */
export async function spikeA() {
  const stamp = foundry.utils.randomID(12);
  const fileName = `spike-a-${stamp}.json`;
  await ensureExportDirectory();
  const file = new File([JSON.stringify({ ok: true, stamp })], fileName, { type: "application/json" });
  const FP = foundry.applications.apps.FilePicker.implementation;
  const result = await FP.upload("data", exportDirectory(), file, {}, { notify: false });
  if (!result?.path) {
    const report = { pass: false, reason: "upload rejected", result };
    console.warn(`${MODULE_ID} | spike A`, report);
    return report;
  }
  const url = buildFileUrl(result.path);
  const res = await fetch(url, { credentials: "omit", cache: "no-store" });
  const body = res.ok ? await res.json().catch(() => null) : null;
  const pass = res.ok && body?.stamp === stamp;
  const report = {
    pass,
    url,
    status: res.status,
    note: "Now also open this URL from a phone outside your LAN to confirm end to end."
  };
  console.log(`${MODULE_ID} | spike A`, report);
  return report;
}

/**
 * Spike C: verify our payload matches the native Export Data output.
 *
 * 1. Open a document sheet and use the core Export Data control, saving
 *    the native JSON file.
 * 2. Paste its text into the console:
 *    game.modules.get("json-grab").api.diffAgainstNative(doc, nativeText)
 *
 * Both diffs empty means the formats are identical.
 */
export function diffAgainstNative(doc, nativeJsonText) {
  const ours = JSON.parse(buildExportPayload(doc));
  const native = JSON.parse(nativeJsonText);
  const report = {
    inNativeNotOurs: foundry.utils.diffObject(ours, native),
    inOursNotNative: foundry.utils.diffObject(native, ours)
  };
  console.log(`${MODULE_ID} | spike C`, report);
  return report;
}
