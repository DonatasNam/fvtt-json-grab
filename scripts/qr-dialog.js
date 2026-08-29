import { buildExportPayload } from "./export.js";

/**
 * Render the URL as an SVG QR code using the vendored qrcode-generator lib.
 * Deliberately NOT scalable: explicit width/height attributes keep the code
 * visible regardless of what any stylesheet does. Returns null when the
 * library is unavailable so the dialog can degrade gracefully.
 */
function qrSvg(url) {
  if (typeof globalThis.qrcode !== "function") {
    console.error("json-grab | qrcode library not found on globalThis");
    return null;
  }
  const qr = globalThis.qrcode(0, "M"); // type 0 picks the smallest size that fits
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4 });
}

/** Heuristic warning when the link cannot work for devices outside the network. */
function looksLocal(url) {
  try {
    const host = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return false;
  }
}

function localSaveName(doc) {
  const slug = (doc.name ?? "document").slugify?.({ strict: true }) || doc.id;
  return `fvtt-${doc.documentName}-${slug}.json`;
}

/**
 * Show the share dialog: QR code with the copyable link underneath, plus
 * Copy, Open, Download and Revoke actions.
 * @param {ClientDocument} doc
 * @param {{url: string}} exported result of exportDocument
 */
export async function openShareDialog(doc, exported) {
  const { escapeHTML } = foundry.utils;
  // The share URL (QR, link field, Copy) is the auto-download landing page
  // when available, the raw JSON URL otherwise. The landing page itself
  // links to the raw JSON for tooling.
  const url = exported.pageUrl ?? exported.url;
  const warning = looksLocal(url)
    ? `<p class="jg-warning">${game.i18n.localize("JSONGRAB.LocalUrlWarning")}</p>`
    : "";
  // The QR box starts empty on purpose: DialogV2 sanitizes the content
  // string and strips svg elements from it (verified on v14.367). The SVG
  // is inserted in the render callback below instead, which survives.
  const content = `
    <div class="json-grab-share">
      <div class="jg-qr" style="display:flex;justify-content:center;padding:4px 0;">
        <div class="jg-qr-box" style="background:#fff;padding:8px;border-radius:4px;line-height:0;"></div>
      </div>
      <input type="text" class="jg-url" value="${escapeHTML(url)}" readonly>
      <p class="jg-expiry"></p>
      <div class="jg-actions">
        <button type="button" class="jg-copy"><i class="fa-solid fa-copy"></i> ${game.i18n.localize("JSONGRAB.Copy")}</button>
        <button type="button" class="jg-download"><i class="fa-solid fa-download"></i> ${game.i18n.localize("JSONGRAB.Download")}</button>
      </div>
      ${warning}
    </div>`;

  await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("JSONGRAB.DialogTitle", { name: doc.name ?? doc.documentName }),
      icon: "fa-solid fa-qrcode"
    },
    classes: ["json-grab-dialog"],
    position: { width: 420 },
    content,
    buttons: [{ action: "close", label: "JSONGRAB.Close", icon: "fa-solid fa-xmark", default: true }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element ?? dialog;
      const qrBox = root.querySelector(".jg-qr-box");
      if (qrBox) {
        const svg = qrSvg(url);
        if (svg) qrBox.innerHTML = svg;
        else {
          const warning = document.createElement("p");
          warning.className = "jg-warning";
          warning.textContent = game.i18n.localize("JSONGRAB.QrUnavailable");
          qrBox.parentElement.replaceWith(warning);
        }
      }
      root.querySelector("input.jg-url")?.addEventListener("focus", ev => ev.currentTarget.select());
      root.querySelector(".jg-copy")?.addEventListener("click", () => {
        game.clipboard.copyPlainText(url);
        ui.notifications.info("JSONGRAB.Copied", { localize: true });
      });
      root.querySelector(".jg-download")?.addEventListener("click", () => {
        const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
        save(buildExportPayload(doc), "application/json", localSaveName(doc));
      });
      const expiryEl = root.querySelector(".jg-expiry");
      if (expiryEl && exported.expiresAt) {
        const tick = () => {
          if (!expiryEl.isConnected) return clearInterval(intervalId);
          const left = exported.expiresAt - Date.now();
          if (left <= 0) {
            expiryEl.textContent = game.i18n.localize("JSONGRAB.Expired");
            root.querySelector(".jg-copy")?.setAttribute("disabled", "");
            return clearInterval(intervalId);
          }
          const m = Math.floor(left / 60000);
          const s = Math.floor((left % 60000) / 1000);
          expiryEl.textContent = game.i18n.format("JSONGRAB.ExpiresIn", {
            time: `${m}:${String(s).padStart(2, "0")}`
          });
        };
        const intervalId = setInterval(tick, 1000);
        tick();
      }
    }
  });
}
