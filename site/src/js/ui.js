// Shared interface pieces: page heads and document layout, the popover (label help, glossary
// terms, compare details), the compare store and tray, compare marks, and the world map.

import { D, countryName } from "./data.js";
import { gloss, term } from "./labels.js";
import { $, $$, esc, fmt } from "./util.js";

// ---------- Page pieces ----------
// crumbs: [{href, text}] or strings; the last one is the current page.
export function crumbs(items) {
  if (!items || !items.length) return "";
  return `<ol class="crumbs" aria-label="Breadcrumb">${items.map((c, i) => (typeof c === "string" || i === items.length - 1
    ? `<li aria-current="page">${esc(c.text || c)}</li>`
    : `<li><a href="${esc(c.href)}">${esc(c.text)}</a></li>`)).join("")}</ol>`;
}

export function pageHead({ title, lede = "", actions = "", crumbs: cr = null, extra = "" }) {
  return `${cr ? crumbs(cr) : ""}<div class="page-head"><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}${actions ? `<div class="actions">${actions}</div>` : ""}${extra}</div>`;
}

export function chart({ title, sub = "", body, legend = "", note = "" }) {
  return `<figure class="chart">${title ? `<figcaption class="chart-title">${title}${sub ? `<small>${sub}</small>` : ""}</figcaption>` : ""}${body}${legend}${note ? `<p class="chart-note">${note}</p>` : ""}</figure>`;
}

// rows: [label, valueHtml, subHtml?]; empty values are left out.
export function facts(rows, cls = "facts") {
  const kept = rows.filter((r) => r && r[1]);
  if (!kept.length) return "";
  return `<dl class="${cls}">${kept.map(([k, v, sub]) => `<div><dt>${k}</dt><dd>${v}${sub ? `<span class="sub">${sub}</span>` : ""}</dd></div>`).join("")}</dl>`;
}

// A document page: title block, sticky rail (details panel plus table of contents), sections.
export function docPage({ crumbs: cr, titleBlock, details = "", sections }) {
  const secs = sections.filter((s) => s && s.body);
  return `${crumbs(cr)}<div class="doc"><header class="title-block">${titleBlock}</header>
    <div class="doc-grid">
      <aside class="rail" aria-label="Details and contents"><div class="rail-inner">${details}
        <nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">On this page</h2><ol>${secs.map((s) => `<li><a href="#${s.id}" data-sec="${s.id}">${esc(s.title)}</a></li>`).join("")}</ol></nav></div></aside>
      <article class="sections">${secs.map((s) => `<section id="${s.id}" aria-labelledby="${s.id}-h"><h2 id="${s.id}-h">${esc(s.title)}</h2>${s.body}</section>`).join("")}</article>
    </div></div>`;
}

// In-page anchors inside the hash router: scroll instead of navigating. Highlights the current one.
export function bindToc(root) {
  const links = $$(".toc a[data-sec], .dom-nav a[data-sec]", root);
  links.forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const el = $(`#${CSS.escape(a.dataset.sec)}`, root);
    if (el) { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
  }));
  if (!("IntersectionObserver" in window) || !links.length) return;
  const io = new IntersectionObserver((items) => items.forEach((it) => {
    if (it.isIntersecting) links.forEach((l) => l.classList.toggle("on", l.dataset.sec === it.target.id));
  }), { rootMargin: "-10% 0px -70% 0px" });
  links.forEach((a) => { const el = $(`#${CSS.escape(a.dataset.sec)}`, root); if (el) io.observe(el); });
}

export const tag = (text, cls = "") => `<span class="tag${cls ? ` ${cls}` : ""}">${esc(text)}</span>`;

// ---------- Popover ----------
// Anything with data-help="<label id>" (site label help), data-term="<glossary id>" (a domain
// term), or data-pop="<registry key>" opens it on hover, focus, or tap. Clicking pins it open
// until a click elsewhere or Escape.
const pop = () => $("#pop");
const registry = new Map();
let anchor = null, pinned = false, showT, hideT;

export const registerPop = (key, fn) => registry.set(key, fn);
export const clearPops = () => registry.clear();

function contentFor(el) {
  if (el.dataset.help) {
    const g = gloss(el.dataset.help);
    if (!g) return "";
    const more = g.term && term(g.term) ? `<a class="pop-more" href="#/glossary/${g.term}">${esc(term(g.term).term)} in the glossary</a>` : "";
    return `<b>${esc(g.name)}</b><div>${esc(g.short)}</div>${g.long ? `<div class="pop-long">${esc(g.long)}</div>` : ""}${more}`;
  }
  if (el.dataset.term) {
    const t = term(el.dataset.term);
    return t ? `<b>${esc(t.term)}</b><div>${esc(t.short)}</div><a class="pop-more" href="#/glossary/${t.id}">More in the glossary</a>` : "";
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
  const trigger = (t) => t && t.closest && t.closest("[data-help],[data-term],[data-pop]");
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
// Three fixed slots. A slot keeps its colour and shape when another slot is emptied, so an
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

export function compareBtn(id, cls = "btn small quiet") {
  const on = getCompare().includes(id);
  return `<button type="button" class="${cls} cmp-toggle" data-compare="${id}" aria-pressed="${on}"><i class="ph ph-${on ? "check" : "plus"}" aria-hidden="true"></i><span>${on ? "In compare" : "Compare"}</span></button>`;
}

// Each compare slot has its own colour and shape, so marks never rely on colour alone.
export function mark(i, size = 14) {
  const fill = `var(--s${i + 1})`;
  const shape = [
    `<circle cx="7" cy="7" r="6" fill="${fill}"/>`,
    `<rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="${fill}"/>`,
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
      <a href="#/compare?ids=${slotsParam(slots)}">Compare ${n}<i class="ph ph-arrow-right" aria-hidden="true"></i></a>
      <button type="button" data-tray-clear aria-label="Clear the compare list"><i class="ph ph-x" aria-hidden="true"></i></button>` : ""}</div>`;
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
      b.innerHTML = `<i class="ph ph-${on ? "check" : "plus"}" aria-hidden="true"></i><span>${on ? "In compare" : "Compare"}</span>`;
    });
    renderTray();
  });
  addEventListener("hashchange", renderTray);
}

// ---------- Map ----------
export const BINS = [["1", 1], ["2 to 5", 5], ["6 to 15", 15], ["16 to 50", 50], ["51 or more", Infinity]];
export const bin = (n) => (!n ? 0 : BINS.findIndex(([, max]) => n <= max) + 1);

export function legendHtml() {
  return `<ul class="legend" aria-label="Entries per country"><li style="--sw:var(--m0)">None</li>${BINS.map(([label], i) => `<li style="--sw:var(--m${i + 1})">${label}</li>`).join("")}</ul>`;
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
// goes to href(iso3). Returns {highlight(iso3)} for the map page's search.
export async function drawMap(box, { counts, href, label = "World map shaded by the number of catalog entries whose questions come from each country" }) {
  try {
    const { d3, features } = await loadGeo();
    const byNumeric = {};
    Object.entries(D.countries).forEach(([iso3, c]) => { if (c.numeric) byNumeric[String(Number(c.numeric))] = iso3; });
    const w = 960, h = 460;
    const proj = d3.geoEqualEarth().fitSize([w, h], { type: "FeatureCollection", features });
    const path = d3.geoPath(proj);
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${features.map((f) => {
      const iso = byNumeric[String(Number(f.id))];
      const n = (iso && counts.get(iso)) || 0;
      return `<path class="country b${bin(n)}${n ? " has" : ""}" d="${path(f)}" data-iso="${iso || ""}" data-n="${n}" data-name="${esc(iso ? countryName(iso) : f.properties.name)}"></path>`;
    }).join("")}</svg>`;
    const svg = box.querySelector("svg");
    svg.addEventListener("mousemove", (ev) => {
      const p = ev.target.closest("path.country");
      if (!p) return hidePop();
      const iso = p.dataset.iso, n = Number(p.dataset.n);
      const inc = iso && D.countries[iso] ? D.countries[iso].income : "";
      showPopAt(ev.clientX, ev.clientY, `<b>${p.dataset.name}</b><div>${n ? `${fmt(n)} ${n === 1 ? "entry" : "entries"}` : "No entries"}${inc ? `, ${inc.replace("-", " ")} income` : ""}</div>${n ? "<div class=\"muted\">Click to see them</div>" : ""}`);
    });
    svg.addEventListener("mouseleave", hidePop);
    svg.addEventListener("click", (ev) => {
      const p = ev.target.closest("path.country.has");
      if (p && p.dataset.iso) location.hash = href(p.dataset.iso);
    });
    return {
      highlight(iso) {
        $$("path.country.hl", svg).forEach((p) => p.classList.remove("hl"));
        const p = iso && svg.querySelector(`path.country[data-iso="${CSS.escape(iso)}"]`);
        if (p) { p.classList.add("hl"); p.parentNode.appendChild(p); }
      },
    };
  } catch (err) {
    const list = [...counts.entries()].filter(([c]) => c.length === 3 && c !== "UNKNOWN").sort((a, b) => b[1] - a[1]);
    box.innerHTML = `<p class="muted">The map couldn't load. Here are the countries instead:</p>
      <p>${list.map(([c, n]) => `<a href="${href(c)}">${esc(countryName(c))}</a> <span class="num">${n}</span>`).join(", ")}</p>`;
    return { highlight() {} };
  }
}

// ---------- Copy buttons ----------
export function initCopy() {
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-copy]");
    if (!b) return;
    const text = $(b.dataset.copy).textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      b.innerHTML = `<i class="ph ph-check" aria-hidden="true"></i><span class="vh">Copied</span>`;
      setTimeout(() => (b.innerHTML = `<i class="ph ph-copy" aria-hidden="true"></i><span class="vh">Copy</span>`), 1600);
    } catch (e) { /* clipboard blocked: the text is still selectable */ }
  });
}
