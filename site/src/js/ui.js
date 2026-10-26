// Shared interface pieces: the popover (glossary tips and compare details), the compare
// store and tray, compare marks, the world map, and small motion helpers.

import { D, countryName } from "./data.js";
import { gloss } from "./labels.js";
import { $, $$, esc, fmt, reducedMotion } from "./util.js";

// ---------- Popover ----------
// Anything with data-gloss="<glossary id>" or data-pop="<registry key>" opens it on hover,
// focus, or tap. Clicking pins it open until a click elsewhere or Escape.
const pop = () => $("#pop");
const registry = new Map();
let anchor = null, pinned = false, showT, hideT;

export const registerPop = (key, fn) => registry.set(key, fn);
export const clearPops = () => registry.clear();

function contentFor(el) {
  if (el.dataset.gloss) {
    const g = gloss(el.dataset.gloss);
    return g ? `<b>${esc(g.term)}</b><div>${esc(g.short)}</div><a class="pop-more" href="#/glossary/${g.id}">More in the glossary</a>` : "";
  }
  const fn = registry.get(el.dataset.pop);
  return fn ? fn() : "";
}

function place(rect) {
  const p = pop();
  const w = p.offsetWidth, h = p.offsetHeight;
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = rect.bottom + 8;
  if (top + h > innerHeight - 8 && rect.top - h - 8 > 0) top = rect.top - h - 8;
  p.style.left = `${left + scrollX}px`;
  p.style.top = `${top + scrollY}px`;
}

function show(el) {
  const html = contentFor(el);
  if (!html) return;
  if (anchor && anchor !== el) anchor.removeAttribute("aria-expanded");
  anchor = el;
  const p = pop();
  p.innerHTML = html;
  p.classList.toggle("wide", el.dataset.popWide != null);
  p.classList.add("show");
  el.setAttribute("aria-expanded", "true");
  place(el.getBoundingClientRect());
}

export function hidePop() {
  clearTimeout(showT);
  pop().classList.remove("show");
  if (anchor) anchor.removeAttribute("aria-expanded");
  anchor = null;
  pinned = false;
}

// For the map: show arbitrary text next to the pointer.
export function showPopAt(x, y, html) {
  const p = pop();
  p.innerHTML = html;
  p.classList.remove("wide");
  p.classList.add("show");
  place({ left: x - 1, right: x + 1, top: y - 10, bottom: y + 10, width: 2, height: 20 });
}

export function initPop() {
  const trigger = (t) => t && t.closest && t.closest("[data-gloss],[data-pop]");
  document.addEventListener("mouseover", (ev) => {
    if (matchMedia("(hover: none)").matches || pinned) return;
    const t = trigger(ev.target);
    if (t) {
      clearTimeout(hideT);
      if (t !== anchor) { clearTimeout(showT); showT = setTimeout(() => show(t), 140); }
    } else if (!ev.target.closest("#pop") && anchor) {
      clearTimeout(showT);
      hideT = setTimeout(hidePop, 160);
    } else if (!anchor) clearTimeout(showT);
  });
  document.addEventListener("click", (ev) => {
    const t = trigger(ev.target);
    if (t && t.tagName !== "A") {
      ev.preventDefault();
      if (anchor === t && pinned) return hidePop();
      show(t);
      pinned = true;
      return;
    }
    if (pinned && !ev.target.closest("#pop")) hidePop();
  });
  document.addEventListener("focusin", (ev) => {
    const t = trigger(ev.target);
    if (t && !pinned) show(t);
    else if (!t && !ev.target.closest("#pop") && anchor && !pinned) hidePop();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && anchor) { const a = anchor; hidePop(); a.focus && a.focus(); }
  });
  addEventListener("hashchange", hidePop);
}

// ---------- Compare store and tray ----------
// Three fixed slots. A slot keeps its color and shape when another slot is emptied, so an
// entry's mark never changes under the reader. Saved in this browser only.
const KEY = "compare.slots";
export const MAX_COMPARE = 3;
export const DEFAULT_COMPARE = ["healthbench", "afrimed-qa", "rwanda-chw-vignettes"];

export const normalizeSlots = (ids) => Array.from({ length: MAX_COMPARE }, (_, i) => (ids[i] && D.byId.has(ids[i]) ? ids[i] : ""));
export function getSlots() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
    return normalizeSlots(Array.isArray(ids) ? ids : []);
  } catch (e) { return normalizeSlots([]); }
}
export const getCompare = () => getSlots().filter(Boolean);
export function hasSavedCompare() {
  try { return localStorage.getItem(KEY) !== null; } catch (e) { return false; }
}
export function setSlots(slots) {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeSlots(slots))); } catch (e) { /* private mode: keep going without saving */ }
  document.dispatchEvent(new CustomEvent("compare-change"));
}
export const slotsParam = (slots) => normalizeSlots(slots).join(",").replace(/,+$/, "");

export function compareBtn(id) {
  const on = getCompare().includes(id);
  return `<button type="button" class="cmp-toggle" data-compare="${id}" aria-pressed="${on}"><i class="ph ph-${on ? "check" : "plus"}"></i><span>${on ? "In compare" : "Compare"}</span></button>`;
}

// Each compare slot has its own color and shape, so marks never rely on color alone.
export function mark(i, size = 14) {
  const fill = `var(--s${i + 1})`;
  const shape = [
    `<circle cx="7" cy="7" r="6" fill="${fill}"/>`,
    `<rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="${fill}"/>`,
    `<path d="M7 1 13.4 12.6H.6z" fill="${fill}" stroke="${fill}" stroke-linejoin="round" stroke-width="1"/>`,
  ][i];
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true">${shape}</svg>`;
}
export const SLOT_NAMES = ["circle", "square", "triangle"];

let trayMsg = "";
export function renderTray() {
  const tray = $("#tray");
  const slots = getSlots();
  const n = slots.filter(Boolean).length;
  const onCompare = location.hash.startsWith("#/compare");
  if ((!n && !trayMsg) || onCompare) { tray.innerHTML = ""; return; }
  tray.innerHTML = `<div class="tray" role="status">
    ${trayMsg ? `<span>${esc(trayMsg)}</span>` : ""}
    ${n ? `<span class="marks">${slots.map((id, i) => (id ? mark(i) : "")).join("")}</span>
      <a href="#/compare?ids=${slotsParam(slots)}">Compare ${n}<i class="ph ph-arrow-right"></i></a>
      <button type="button" data-tray-clear aria-label="Clear the compare list"><i class="ph ph-x"></i></button>` : ""}</div>`;
}

export function initCompare() {
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-compare]");
    if (b) {
      ev.preventDefault();
      const id = b.dataset.compare;
      const slots = getSlots();
      const at = slots.indexOf(id);
      if (at >= 0) slots[at] = "";
      else if (slots.indexOf("") < 0) {
        trayMsg = "Compare holds three entries. Remove one first.";
        renderTray();
        setTimeout(() => { trayMsg = ""; renderTray(); }, 3200);
        return;
      } else slots[slots.indexOf("")] = id;
      setSlots(slots);
      return;
    }
    if (ev.target.closest("[data-tray-clear]")) setSlots([]);
  });
  document.addEventListener("compare-change", () => {
    const ids = getCompare();
    $$("[data-compare]").forEach((b) => {
      const on = ids.includes(b.dataset.compare);
      b.setAttribute("aria-pressed", on);
      b.innerHTML = `<i class="ph ph-${on ? "check" : "plus"}"></i><span>${on ? "In compare" : "Compare"}</span>`;
    });
    renderTray();
  });
  addEventListener("hashchange", renderTray);
}

// ---------- Map ----------
export const BINS = [["1", 1], ["2 to 5", 5], ["6 to 15", 15], ["16 to 50", 50], ["51 or more", Infinity]];
export const bin = (n) => (!n ? 0 : BINS.findIndex(([, max]) => n <= max) + 1);
export const heat = (n) => `var(--heat-${bin(n)})`;
export const heatInk = (n) => (bin(n) >= 3 ? "var(--on-heat-high)" : "var(--on-heat-low)");

export function legendHtml(title = "Entries per country") {
  return `<div class="legend" aria-hidden="true">${esc(title)} <i style="background:var(--heat-0)"></i>0
    ${BINS.map(([label], i) => `<i style="background:var(--heat-${i + 1})"></i>${label}`).join(" ")}</div>`;
}

let geo;
function loadGeo() {
  geo ||= Promise.all([
    import("https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm"),
    import("https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm"),
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then((r) => r.json()),
  ]).then(([d3, topojson, world]) => ({
    d3, features: topojson.feature(world, world.objects.countries).features.filter((f) => f.id !== "010"),
  }));
  return geo;
}

// Draws a choropleth of `counts` (ISO3 -> entries) into `box`. Clicking a country with entries
// goes to href(iso3).
export async function drawMap(box, { counts, href, label = "World map of where entries' questions come from" }) {
  try {
    const { d3, features } = await loadGeo();
    const byNumeric = {};
    Object.entries(D.countries).forEach(([iso3, c]) => { if (c.numeric) byNumeric[String(Number(c.numeric))] = iso3; });
    const w = 760, h = 370;
    const proj = d3.geoEqualEarth().fitSize([w, h], { type: "FeatureCollection", features });
    const path = d3.geoPath(proj);
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${features.map((f) => {
      const iso = byNumeric[String(Number(f.id))];
      const n = (iso && counts.get(iso)) || 0;
      return `<path class="country${n ? " has" : ""}" d="${path(f)}" fill="${heat(n)}" data-iso="${iso || ""}" data-n="${n}" data-name="${esc(iso ? countryName(iso) : f.properties.name)}"></path>`;
    }).join("")}</svg>${legendHtml()}`;
    const svg = box.querySelector("svg");
    svg.addEventListener("mousemove", (ev) => {
      const p = ev.target.closest("path.country");
      if (!p) return hidePop();
      const iso = p.dataset.iso, n = Number(p.dataset.n);
      const inc = iso && D.countries[iso] ? D.countries[iso].income : "";
      showPopAt(ev.clientX, ev.clientY, `<b>${p.dataset.name}</b><div>${n ? `${fmt(n)} ${n === 1 ? "entry" : "entries"}` : "No entries"}${inc ? `, ${inc.replace("-", " ")} income` : ""}</div>${n ? "<div>Click to see them</div>" : ""}`);
    });
    svg.addEventListener("mouseleave", hidePop);
    svg.addEventListener("click", (ev) => {
      const p = ev.target.closest("path.country.has");
      if (p && p.dataset.iso) location.hash = href(p.dataset.iso);
    });
  } catch (err) {
    const list = [...counts.entries()].filter(([c]) => c.length === 3 && c !== "UNKNOWN").sort((a, b) => b[1] - a[1]);
    box.innerHTML = `<p class="muted">The map couldn't load. Here are the countries instead:</p>
      <p>${list.map(([c, n]) => `<a href="${href(c)}">${esc(countryName(c))}</a> <span class="num">${n}</span>`).join(", ")}</p>`;
  }
}

// ---------- Motion ----------
// Numbers count up once when they scroll into view. Under reduced motion they just show.
export function countUp(root) {
  if (reducedMotion() || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((items) => items.forEach((it) => {
    if (!it.isIntersecting) return;
    io.unobserve(it.target);
    const el = it.target, to = Number(el.dataset.count), t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { threshold: 0.4 });
  $$("[data-count]", root).forEach((el) => { el.textContent = "0"; io.observe(el); });
}

export function reveal(root) {
  if (reducedMotion() || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((items) => items.forEach((it) => {
    if (it.isIntersecting) { it.target.classList.add("in"); io.unobserve(it.target); }
  }), { threshold: 0.12 });
  $$(".reveal", root).forEach((el) => io.observe(el));
}

export function initCopy() {
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-copy]");
    if (!b) return;
    const text = $(b.dataset.copy).textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      b.innerHTML = `<i class="ph ph-check"></i><span class="sr-only">Copied</span>`;
      setTimeout(() => (b.innerHTML = `<i class="ph ph-copy"></i><span class="sr-only">Copy</span>`), 1600);
    } catch (e) { /* clipboard blocked: the text is still selectable */ }
  });
}
