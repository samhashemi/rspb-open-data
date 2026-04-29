// Felt JS SDK integration: embeds the map and wires the top search bar to
// search layers, isolate the chosen one, and fit the viewport to its extent.
import { Felt } from "https://esm.sh/@feltmaps/js-sdk";

// The SDK accepts either the slugged URL form or the bare alphanumeric id.
const MAP_ID_FULL = "Untitled-Map-7zqZhIfyRZCV27rMShPpsD";
const MAP_ID_BARE = "7zqZhIfyRZCV27rMShPpsD";
const INITIAL_VIEWPORT = {
  center: { latitude: 56.106, longitude: -2.74 },
  zoom: 5.77,
};

const container   = document.getElementById("map-container");
const placeholder = document.getElementById("map-placeholder");
const searchEl    = document.getElementById("q");
const resultsEl   = document.getElementById("search-results");

let felt = null;
let layers = []; // [{ id, name, lower }]

(async function init() {
  // Try the full slug first, fall back to the bare id.
  let lastErr = null;
  for (const id of [MAP_ID_FULL, MAP_ID_BARE]) {
    try {
      felt = await Felt.embed(container, id, { initialViewport: INITIAL_VIEWPORT });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`Felt.embed("${id}") failed:`, err);
      // Clear anything the SDK left behind before retrying.
      container.innerHTML = "";
    }
  }

  if (!felt) {
    showSdkUnavailable(lastErr);
    return;
  }
  if (placeholder) placeholder.remove();

  await loadLayers();
  searchEl.addEventListener("input", onSearchInput);
  searchEl.addEventListener("focus", renderResults);
  searchEl.addEventListener("keydown", onSearchKey);
  // The native X clear button on <input type="search"> fires `search`.
  searchEl.addEventListener("search", onSearchInput);
  document.addEventListener("click", onDocClick, true);
})();

// SDK couldn't connect — fall back to a plain iframe so the map at least
// renders, and tell the user *why* search is disabled.
function showSdkUnavailable(err) {
  const msg = (err && err.message) || String(err || "unknown error");
  console.error("Felt SDK unavailable:", err);

  if (placeholder) placeholder.remove();
  container.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src =
    `https://felt.com/embed/map/${MAP_ID_FULL}?loc=56.106,-2.74,5.77z`;
  iframe.title = "RSPB datasets — Felt map";
  iframe.allow = "fullscreen; clipboard-read; clipboard-write; geolocation";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  container.appendChild(iframe);

  // Disable the search input and surface a hint inside the results panel.
  searchEl.disabled = true;
  searchEl.placeholder = "Map layer search unavailable — SDK couldn't connect";
  searchEl.title =
    "The SDK handshake failed: " + msg +
    "\n\nMost common cause: SDK access isn't enabled on this map. " +
    "Open the map in Felt → Map Settings → Developers → enable SDK.";
}

async function loadLayers() {
  const all = (await felt.getLayers()) || [];
  layers = all
    .filter(Boolean)
    .map((l) => ({
      id: l.id,
      name: l.name || "(untitled layer)",
      lower: (l.name || "").toLowerCase(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderResults() {
  const term = (searchEl.value || "").trim().toLowerCase();
  const matches = term
    ? layers.filter((l) => l.lower.includes(term))
    : layers.slice();

  resultsEl.innerHTML = "";

  // Reset row — always present, makes "show everything again" obvious.
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "sr-item sr-reset";
  reset.textContent = "↺  Show all layers";
  reset.addEventListener("click", showAll);
  resultsEl.appendChild(reset);

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "sr-empty";
    empty.textContent = layers.length
      ? `No layers match “${term}”.`
      : "This map has no layers yet — upload some in Felt.";
    resultsEl.appendChild(empty);
  } else {
    matches.slice(0, 40).forEach((l) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sr-item";
      b.setAttribute("role", "option");
      b.textContent = l.name;
      b.addEventListener("click", () => isolate(l));
      resultsEl.appendChild(b);
    });
    if (matches.length > 40) {
      const more = document.createElement("div");
      more.className = "sr-empty";
      more.textContent = `…and ${matches.length - 40} more — keep typing to narrow.`;
      resultsEl.appendChild(more);
    }
  }
  resultsEl.hidden = false;
}

function hideResults() {
  resultsEl.hidden = true;
}

function onDocClick(e) {
  if (resultsEl.hidden) return;
  if (resultsEl.contains(e.target)) return;
  if (e.target === searchEl) return;
  hideResults();
}

function onSearchKey(e) {
  if (e.key === "Escape") {
    hideResults();
    searchEl.blur();
  } else if (e.key === "Enter") {
    const first = resultsEl.querySelector(".sr-item:not(.sr-reset)");
    if (first) first.click();
    e.preventDefault();
  }
}

function onSearchInput() {
  // Empty input = no constraint, so put every layer back on.
  if (searchEl.value === "") restoreLayerVisibility();
  renderResults();
}

async function restoreLayerVisibility() {
  if (!layers.length) return;
  await felt.setLayerVisibility({ show: layers.map((l) => l.id) });
}

async function showAll() {
  await restoreLayerVisibility();
  searchEl.value = "";
  hideResults();
}

async function isolate(layer) {
  hideResults();
  searchEl.value = layer.name;

  const others = layers.map((l) => l.id).filter((id) => id !== layer.id);
  try {
    await felt.setLayerVisibility({ show: [layer.id], hide: others });
  } catch (e) {
    console.warn("setLayerVisibility failed", e);
  }

  const bounds = await fetchBounds(layer.id);
  if (bounds) {
    try {
      await felt.fitViewportToBounds({ bounds });
    } catch (e) {
      console.warn("fitViewportToBounds failed", e);
    }
  }
}

// `getLayerBoundaries` returns boundaries from multiple sources; we want the
// one that reflects the layer's actual extent. Shape isn't tightly typed in
// the brief reference, so unwrap defensively.
async function fetchBounds(layerId) {
  let raw;
  try {
    raw = await felt.getLayerBoundaries(layerId);
  } catch (e) {
    console.warn("getLayerBoundaries failed", e);
    return null;
  }
  return unwrapBounds(raw);
}

function unwrapBounds(b) {
  if (!b) return null;
  if (isBbox(b)) return b;
  // Common keys to try, in priority order.
  const keys = ["combined", "filter", "source", "bounds", "extent", "envelope"];
  for (const k of keys) {
    const v = b[k];
    if (isBbox(v)) return v;
    if (v && typeof v === "object") {
      const nested = unwrapBounds(v);
      if (nested) return nested;
    }
  }
  // Fallback: any 4-number array on the object.
  if (typeof b === "object") {
    for (const v of Object.values(b)) if (isBbox(v)) return v;
  }
  return null;
}

function isBbox(v) {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}
