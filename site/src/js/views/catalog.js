// Catalog: a calm filter rail on the left, search and results on the right. Filters live in
// the URL. The page is drawn once; filter changes update the rail, chips and results in place
// so focus and scroll stay where they are.

import { card, listHead, listRow } from "../cards.js";
import { D, domainOf, tally } from "../data.js";
import { FACETS, FACET_KEYS, MORE, PRIMARY, help, valueName } from "../labels.js";
import { pageHead } from "../ui.js";
import { $, $$, debounce, esc, fmt, setTitle } from "../util.js";

const PAGE = 60;
const SHOW = 6;
const SORTS = [["featured", "Featured first"], ["citations", "Most cited"], ["year", "Newest"], ["name", "A to Z"]];
const FROM = {
  map: ["ph-map-trifold", "These filters came from the map.", "#/", "Back to the map"],
  matrix: ["ph-table", "These filters came from the constructs matrix.", "#/constructs?view=matrix", "Back to the matrix"],
  construct: ["ph-tree-structure", "These filters came from a construct page.", "#/constructs", "Back to the construct"],
  home: ["ph-house", "These filters came from the home page.", "#/", "Back home"],
  entry: ["ph-file-text", "These filters came from an entry page.", "#/catalog", "Back to the entry"],
};

let S; // state while mounted
const hayCache = new Map();
const hay = (e) => {
  if (!hayCache.has(e.id)) hayCache.set(e.id, `${e.name} ${e.summary} ${e.id} ${e.languages.join(" ")} ${e.country_names.join(" ")}`.toLowerCase());
  return hayCache.get(e.id);
};

function read(query) {
  const sel = {};
  FACET_KEYS.forEach((k) => { const v = query.getAll(k); if (v.length) sel[k] = v; });
  const back = query.get("back");
  return {
    query, sel, q: query.get("q") || "", sort: query.get("sort") || "featured", flat: query.get("flat") === "1",
    view: query.get("view") === "list" ? "list" : "cards",
    from: FROM[query.get("from")] ? query.get("from") : null,
    back: back && back.startsWith("#/") ? back : null, open: query.get("open"),
  };
}

function matches(e, st, except) {
  if (st.q && !hay(e).includes(st.q.toLowerCase())) return false;
  for (const [k, vals] of Object.entries(st.sel)) {
    if (k === except) continue;
    if (!FACETS[k].get(e).some((v) => vals.includes(v))) return false;
  }
  return true;
}

const cite = (e) => (e.signals && e.signals.citations) || 0;
const SORT_FN = {
  featured: (a, b) => (b.featured - a.featured) || cite(b) - cite(a) || a.name.localeCompare(b.name),
  citations: (a, b) => cite(b) - cite(a) || a.name.localeCompare(b.name),
  year: (a, b) => b.year - a.year || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
};

// Adaptations sit inside their original's card when both match the filters.
function group(rows, flat) {
  if (flat) return { groups: rows.map((e) => ({ e, children: [] })), hidden: 0 };
  const ids = new Set(rows.map((e) => e.id));
  const kids = new Map();
  const hidden = new Set();
  rows.forEach((e) => e.adapted_from.forEach((p) => {
    if (!ids.has(p)) return;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(e);
    hidden.add(e.id);
  }));
  return { groups: rows.filter((e) => !hidden.has(e.id)).map((e) => ({ e, children: kids.get(e.id) || [] })), hidden: hidden.size };
}

// ---------- Rail ----------
function optionRows(key, st) {
  const F = FACETS[key];
  const sel = st.sel[key] || [];
  const counts = tally(D.entries.filter((e) => matches(e, st, key)), F.get);
  sel.forEach((v) => counts.has(v) || counts.set(v, 0));
  let opts = [...counts.entries()];
  if (F.order) opts.sort((a, b) => F.order.indexOf(a[0]) - F.order.indexOf(b[0]));
  else opts.sort((a, b) => b[1] - a[1] || valueName(key, a[0]).localeCompare(valueName(key, b[0])));
  const find = (S.find.get(key) || "").toLowerCase();
  if (find) opts = opts.filter(([v]) => valueName(key, v).toLowerCase().includes(find));
  const all = S.expanded.has(key) || find || opts.length <= SHOW + 2;
  const shown = all ? opts : [...opts.slice(0, SHOW), ...opts.slice(SHOW).filter(([v]) => sel.includes(v))];

  const row = ([v, n]) => `<li class="${n ? "" : "zero"}"><label><input type="checkbox" data-facet="${key}" value="${esc(v)}"${sel.includes(v) ? " checked" : ""}><span class="t">${esc(valueName(key, v))}</span><span class="n">${fmt(n)}</span></label></li>`;
  let html;
  if (F.byDomain && all) {
    const byDom = new Map();
    shown.forEach((o) => { const d = domainOf(o[0]); const k = d ? d.name : "Other"; if (!byDom.has(k)) byDom.set(k, []); byDom.get(k).push(o); });
    html = [...byDom.entries()].map(([d, os]) => `<li class="dom">${esc(d)}</li>${os.map(row).join("")}`).join("");
  } else html = shown.map(row).join("");
  if (!opts.length) html = `<li class="zero">Nothing matches.</li>`;
  let more = "";
  if (shown.length < opts.length) more = `<button type="button" class="linkbtn" data-more="${key}">Show all ${opts.length}</button>`;
  else if (S.expanded.has(key) && !find && opts.length > SHOW + 2) more = `<button type="button" class="linkbtn" data-less="${key}">Show fewer</button>`;
  return `${F.find ? `<input class="find" data-find="${key}" type="search" placeholder="Find a ${F.title.toLowerCase()}" aria-label="Find a ${F.title.toLowerCase()}" value="${esc(S.find.get(key) || "")}">` : ""}<ul class="fl" data-list="${key}">${html}</ul>${more}`;
}

function segHtml(st) {
  const sel = st.sel.kind || [];
  const counts = tally(D.entries.filter((e) => matches(e, st, "kind")), FACETS.kind.get);
  const opt = (v, label, n) => `<label><input type="radio" name="kind" data-seg="kind" value="${v}"${(v ? sel.length === 1 && sel[0] === v : !sel.length) ? " checked" : ""}>${label}<small>${fmt(n)}</small></label>`;
  return `<div class="fgroup"><span class="ftitle">${help("kind", "Type")}</span><div class="seg" role="radiogroup" aria-label="Type">
    ${opt("", "All", (counts.get("benchmark") || 0) + (counts.get("eval_framework") || 0))}${opt("benchmark", "Benchmarks", counts.get("benchmark") || 0)}${opt("eval_framework", "Frameworks", counts.get("eval_framework") || 0)}</div></div>`;
}

function facetHtml(key, st) {
  const F = FACETS[key];
  const n = (st.sel[key] || []).length;
  return `<div class="fgroup" data-key="${key}"><span class="ftitle">${help(F.gloss, F.title)}${n ? `<span class="sel">${n} selected</span>` : ""}</span>${optionRows(key, st)}</div>`;
}

function moreHtml(st) {
  const anySel = MORE.some((k) => (st.sel[k] || []).length) || MORE.includes(st.open);
  const open = S.open.has("more") ? S.open.get("more") : anySel;
  return `<details class="more" data-key="more"${open ? " open" : ""}><summary>More filters <i class="ph ph-caret-down" aria-hidden="true"></i></summary>
    <ul class="more-list">${MORE.map((key) => {
      const F = FACETS[key];
      const n = (st.sel[key] || []).length;
      const isOpen = S.open.has(key) ? S.open.get(key) : (n > 0 || st.open === key);
      return `<li><details data-key="${key}"${isOpen ? " open" : ""}><summary><span>${help(F.gloss, F.title)}${n ? `<span class="sel" style="color:var(--accent);margin-left:6px">${n}</span>` : ""}</span><i class="ph ph-caret-down" aria-hidden="true"></i></summary>${optionRows(key, st)}</details></li>`;
    }).join("")}</ul></details>`;
}

function renderRail(st) {
  const box = $("#rail");
  const a = document.activeElement;
  const focusKey = a && box.contains(a) ? (a.dataset.facet ? `[data-facet="${a.dataset.facet}"][value="${CSS.escape(a.value)}"]`
    : a.dataset.find ? `[data-find="${a.dataset.find}"]` : a.dataset.seg ? `[data-seg="${a.dataset.seg}"][value="${a.value}"]`
      : a.dataset.more || a.dataset.less ? `[data-list="${a.dataset.more || a.dataset.less}"] + .linkbtn` : null) : null;
  const scroll = $("#filters").scrollTop;
  box.innerHTML = segHtml(st) + PRIMARY.filter((k) => k !== "kind").map((k) => facetHtml(k, st)).join("") + moreHtml(st);
  $("#filters").scrollTop = scroll;
  if (focusKey) { const el = $(focusKey, box); if (el) el.focus({ preventScroll: true }); }
}

// ---------- Results ----------
function renderHead(st, n) {
  const chips = [];
  if (st.q) chips.push(`<span class="chip"><span class="k">Search:</span>&nbsp;${esc(st.q)}<button type="button" data-remove="q" aria-label="Remove the search for ${esc(st.q)}"><i class="ph ph-x" aria-hidden="true"></i></button></span>`);
  FACET_KEYS.forEach((k) => (st.sel[k] || []).forEach((v) => chips.push(
    `<span class="chip"><span class="k">${esc(FACETS[k].title)}:</span>&nbsp;${esc(valueName(k, v))}<button type="button" data-remove="${k}" data-value="${esc(v)}" aria-label="Remove filter ${esc(FACETS[k].title)}: ${esc(valueName(k, v))}"><i class="ph ph-x" aria-hidden="true"></i></button></span>`)));
  $("#res-head").innerHTML = `<span class="count num" id="count" aria-live="polite">${chips.length ? `${fmt(n)} of ${fmt(D.entries.length)} entries` : `${fmt(n)} entries`}</span>
    ${chips.join("")}${chips.length ? `<button type="button" class="linkbtn" data-clear>Clear all</button>` : ""}
    <div class="right">
      <label class="sort"><span>Sort</span><select id="sort">${SORTS.map(([v, t]) => `<option value="${v}"${v === st.sort ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <div class="view" role="group" aria-label="View"><button type="button" data-view="cards" aria-pressed="${st.view === "cards"}"><i class="ph ph-squares-four" aria-hidden="true"></i>Cards</button><button type="button" data-view="list" aria-pressed="${st.view === "list"}"><i class="ph ph-list-bullets" aria-hidden="true"></i>List</button></div>
      <label class="group"><input type="checkbox" id="group"${st.flat ? "" : " checked"}>${help("family", "Group adaptations under their original")}</label>
    </div>`;
  $("#filters-btn").innerHTML = `<i class="ph ph-funnel" aria-hidden="true"></i>Filters${chips.length ? ` (${chips.length})` : ""}`;
}

function renderBanner(st) {
  const box = $("#banner");
  if (!st.from) { box.innerHTML = ""; return; }
  const [icon, text, href, label] = FROM[st.from];
  box.innerHTML = `<div class="banner"><i class="ph ${icon}" aria-hidden="true"></i><span>${text}</span><a href="${esc(st.back || href)}">${label}</a>
    <button type="button" class="x" data-dismiss aria-label="Dismiss"><i class="ph ph-x" aria-hidden="true"></i></button></div>`;
}

function renderResults(st) {
  const rows = D.entries.filter((e) => matches(e, st)).sort(SORT_FN[st.sort] || SORT_FN.featured);
  const { groups, hidden } = group(rows, st.flat);
  renderHead(st, rows.length);
  const shown = groups.slice(0, S.limit);
  const box = $("#results");
  if (!shown.length) {
    box.innerHTML = `<div class="empty"><b>No entries match all of these filters</b>Try removing one. Each filter narrows the list; options inside one filter widen it.<br><br><button type="button" class="btn small" data-clear>Clear all filters</button></div>`;
  } else if (st.view === "list") {
    box.innerHTML = `<div class="list-wrap"><table class="list">${listHead()}<tbody>${shown.flatMap((g) => [g.e, ...g.children]).map(listRow).join("")}</tbody></table></div>`;
  } else {
    box.innerHTML = `<div class="cards">${shown.map((g) => card(g.e, { children: g.children })).join("")}</div>`;
  }
  const left = groups.length - shown.length;
  $("#more").innerHTML = `${hidden ? `<p class="muted small" style="margin-top:14px">${hidden} ${hidden === 1 ? "adaptation is" : "adaptations are"} grouped under their original.</p>` : ""}
    ${left > 0 ? `<div class="load-more"><button type="button" class="btn" id="load-more">Show ${Math.min(PAGE, left)} more <span class="muted">(${fmt(left)} left)</span></button></div>` : ""}`;
  return rows;
}

function title(st) {
  const names = FACET_KEYS.flatMap((k) => (st.sel[k] || []).map((v) => valueName(k, v)));
  setTitle(st.q ? `"${st.q}"` : "", names.slice(0, 2).join(", ") + (names.length > 2 ? "…" : ""), "Catalog");
}

function renderAll(st) {
  renderBanner(st);
  renderRail(st);
  renderResults(st);
  title(st);
  try { sessionStorage.setItem("lastCatalog", location.hash); } catch (e) { /* not saved */ }
}

// ---------- Navigation ----------
function go(mutate, { replace = false } = {}) {
  const q = new URLSearchParams(S.st.query);
  mutate(q);
  const h = `#/catalog${q.toString() ? `?${q}` : ""}`;
  if (replace) { history.replaceState(null, "", h); update({ query: q }); } else location.hash = h;
}

function bind(app) {
  app.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.facet) {
      go((q) => {
        const vals = q.getAll(t.dataset.facet).filter((v) => v !== t.value);
        q.delete(t.dataset.facet);
        (t.checked ? [...vals, t.value] : vals).forEach((v) => q.append(t.dataset.facet, v));
        q.delete("open");
      });
    } else if (t.dataset.seg) go((q) => { q.delete(t.dataset.seg); if (t.value) q.set(t.dataset.seg, t.value); });
    else if (t.id === "sort") go((q) => q.set("sort", t.value));
    else if (t.id === "group") go((q) => (t.checked ? q.delete("flat") : q.set("flat", "1")));
  });
  app.addEventListener("click", (ev) => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.remove) {
      go((q) => {
        if (t.dataset.remove === "q") { q.delete("q"); $("#q").value = ""; return; }
        const vals = q.getAll(t.dataset.remove).filter((v) => v !== t.dataset.value);
        q.delete(t.dataset.remove);
        vals.forEach((v) => q.append(t.dataset.remove, v));
      });
    } else if (t.dataset.clear != null) {
      $("#q").value = "";
      go((q) => { FACET_KEYS.forEach((k) => q.delete(k)); q.delete("q"); q.delete("open"); });
    } else if (t.dataset.view) go((q) => (t.dataset.view === "list" ? q.set("view", "list") : q.delete("view")), { replace: true });
    else if (t.dataset.more) { S.expanded.add(t.dataset.more); renderRail(S.st); }
    else if (t.dataset.less) { S.expanded.delete(t.dataset.less); renderRail(S.st); }
    else if (t.dataset.dismiss != null) go((q) => { q.delete("from"); q.delete("back"); });
    else if (t.id === "load-more") { S.limit += PAGE; renderResults(S.st); }
    else if (t.id === "filters-btn") { $("#filters").classList.add("open"); document.body.style.overflow = "hidden"; }
    else if (t.id === "filters-close" || t.id === "filters-done") { $("#filters").classList.remove("open"); document.body.style.overflow = ""; }
  });
  app.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (d.matches && d.matches("details[data-key]")) S.open.set(d.dataset.key, d.open);
  }, true);
  const search = debounce((v) => go((q) => (v ? q.set("q", v) : q.delete("q")), { replace: true }), 220);
  app.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "q") search(t.value.trim());
    else if (t.dataset.find) {
      S.find.set(t.dataset.find, t.value);
      const key = t.dataset.find;
      const list = $(`[data-list="${key}"]`);
      const wrap = document.createElement("div");
      wrap.innerHTML = optionRows(key, S.st);
      list.replaceWith(wrap.querySelector(`[data-list="${key}"]`));
      const btn = wrap.querySelector(".linkbtn");
      const old = $(`[data-list="${key}"]`).nextElementSibling;
      if (old && old.classList.contains("linkbtn")) old.remove();
      if (btn) $(`[data-list="${key}"]`).after(btn);
    }
  });
}

export function mount({ app, query }) {
  S = { st: read(query), limit: PAGE, open: new Map(), expanded: new Set(), find: new Map() };
  app.innerHTML = `<div class="wrap">
    ${pageHead({ title: "Catalog", lede: "Benchmarks and evaluation frameworks for health chatbots. Filter by what they test, where their questions come from, and how they score answers." })}
    <div id="banner"></div>
    <button class="btn filters-btn" id="filters-btn" type="button" aria-controls="filters"></button>
    <div class="cat-grid">
      <aside class="filters" id="filters" aria-label="Filters">
        <div class="filters-head"><h2>Filters</h2><button class="icon-btn" id="filters-close" type="button" aria-label="Close filters"><i class="ph ph-x" aria-hidden="true"></i></button></div>
        <div id="rail"></div>
        <div class="filters-head" style="border:0;margin-top:16px;justify-content:flex-end"><button class="btn primary" id="filters-done" type="button">Show results</button></div>
      </aside>
      <section aria-label="Results">
        <label class="search"><span>Search the catalog</span><span class="field"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" id="q" placeholder="Name, summary, country or language" autocomplete="off" value="${esc(S.st.q)}"></span></label>
        <div class="res-head" id="res-head"></div>
        <div id="results"></div>
        <div id="more"></div>
      </section>
    </div></div>`;
  bind(app);
  renderAll(S.st);
  // Point the rail at the filter the reader arrived with.
  const target = S.st.open || FACET_KEYS.find((k) => S.st.sel[k]);
  const el = target && $(`[data-key="${target}"]`);
  if (el && S.st.open) {
    // On a phone the rail is a sheet, so open it; on a desktop focus the facet's find box.
    if (matchMedia("(max-width: 900px)").matches) { $("#filters").classList.add("open"); document.body.style.overflow = "hidden"; }
    else { const f = $(".find", el); if (f) f.focus({ preventScroll: true }); }
  }
}

export function update({ query }) {
  const next = read(query);
  if (next.q !== S.st.q && document.activeElement !== $("#q")) $("#q").value = next.q;
  const filtersChanged = JSON.stringify([next.sel, next.q]) !== JSON.stringify([S.st.sel, S.st.q]);
  if (filtersChanged) S.limit = PAGE;
  S.st = next;
  renderAll(next);
}

export function unmount() { S = null; document.body.style.overflow = ""; }
