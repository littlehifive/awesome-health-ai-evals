// Catalog: filters in four groups on the left, results on the right. Filters live in the URL.
// The page is drawn once; filter changes update the results, chips and counts in place so
// focus and scroll stay where they are.

import { card } from "../cards.js";
import { D, domainOf, tally } from "../data.js";
import { FACETS, FACET_KEYS, GROUPS, info, valueName } from "../labels.js";
import { $, $$, debounce, esc, fmt, setTitle } from "../util.js";

const PAGE = 60;
const DEFAULT_OPEN = new Set(["section", "origin", "income"]);
const SORTS = [["featured", "Featured first"], ["citations", "Most cited"], ["year", "Newest"], ["name", "A to Z"]];
const FROM = {
  map: ["ph-map-trifold", "These filters came from the map.", "#/map", "Back to the map"],
  coverage: ["ph-squares-four", "These filters came from the coverage table.", "#/coverage", "Back to the table"],
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

// ---------- Rendering ----------
function optionRows(key, st) {
  const F = FACETS[key];
  const sel = st.sel[key] || [];
  const counts = tally(D.entries.filter((e) => matches(e, st, key)), F.get);
  sel.forEach((v) => counts.has(v) || counts.set(v, 0));
  let opts = [...counts.entries()];
  if (F.order) opts.sort((a, b) => F.order.indexOf(a[0]) - F.order.indexOf(b[0]));
  else opts.sort((a, b) => b[1] - a[1] || valueName(key, a[0]).localeCompare(valueName(key, b[0])));
  const max = Math.max(1, ...opts.map((o) => o[1]));
  const find = (S.find.get(key) || "").toLowerCase();
  if (find) opts = opts.filter(([v]) => valueName(key, v).toLowerCase().includes(find));
  const all = S.expanded.has(key) || find || opts.length <= 8;
  const shown = all ? opts : [...opts.slice(0, 6), ...opts.slice(6).filter(([v]) => sel.includes(v))];

  const row = ([v, n]) => {
    const on = sel.includes(v);
    return `<label class="opt${on ? " checked" : ""}${n ? "" : " zero"}"><input type="checkbox" data-facet="${key}" value="${esc(v)}"${on ? " checked" : ""}>
      <span class="nm">${esc(valueName(key, v))}</span><span class="bar" style="--w:${Math.max(6, (100 * n) / max)}%" aria-hidden="true"></span><span class="n">${fmt(n)}</span></label>`;
  };
  let html;
  if (F.byDomain && all) {
    const byDom = new Map();
    shown.forEach((o) => { const d = domainOf(o[0]); const k = d ? d.name : "Other"; if (!byDom.has(k)) byDom.set(k, []); byDom.get(k).push(o); });
    html = [...byDom.entries()].map(([d, os]) => `<div class="dom-label">${esc(d)}</div>${os.map(row).join("")}`).join("");
  } else html = shown.map(row).join("");
  if (!opts.length) html = `<p class="muted" style="font-size:13px;margin:4px 6px">Nothing matches.</p>`;
  if (shown.length < opts.length) html += `<button type="button" class="more-opts" data-more="${key}">Show all ${opts.length}</button>`;
  else if (S.expanded.has(key) && !find && opts.length > 8) html += `<button type="button" class="more-opts" data-less="${key}">Show fewer</button>`;
  return html;
}

function facetHtml(key, st) {
  const F = FACETS[key];
  const sel = st.sel[key] || [];
  if (F.seg) {
    const counts = tally(D.entries.filter((e) => matches(e, st, key)), F.get);
    const btn = (v, label, n) => `<button type="button" data-seg="${key}" data-value="${v}" aria-pressed="${v ? sel.length === 1 && sel[0] === v : !sel.length}"${n != null ? ` title="${fmt(n)} entries"` : ""}>${label}</button>`;
    return `<div class="facet" data-key="${key}" style="padding:10px 0 0"><div style="font-size:14px;font-weight:550;color:var(--fg-2);margin-bottom:8px">${F.title}${info(F.gloss)}</div>
      <div class="seg" role="group" aria-label="${F.title}">${btn("", "All")}${btn("benchmark", "Benchmarks", counts.get("benchmark"))}${btn("eval_framework", "Frameworks", counts.get("eval_framework"))}</div></div>`;
  }
  const isOpen = S.open.has(key) ? S.open.get(key) : (sel.length > 0 || DEFAULT_OPEN.has(key) || st.open === key);
  return `<details class="facet" data-key="${key}"${isOpen ? " open" : ""}>
    <summary>${F.title}${info(F.gloss)}${sel.length ? `<span class="sel">${sel.length}</span>` : ""}<i class="ph ph-caret-down caret" aria-hidden="true"></i></summary>
    <div class="opts">${F.find ? `<input class="find" data-find="${key}" type="search" placeholder="Find a ${F.title.toLowerCase()}" aria-label="Find a ${F.title.toLowerCase()}" value="${esc(S.find.get(key) || "")}">` : ""}
      <div data-list="${key}">${optionRows(key, st)}</div></div></details>`;
}

function renderGroups(st) {
  const box = $("#groups");
  // remember focus so keyboard users don't lose their place when counts change
  const a = document.activeElement;
  const focusKey = a && box.contains(a) ? (a.dataset.facet ? `[data-facet="${a.dataset.facet}"][value="${CSS.escape(a.value)}"]`
    : a.dataset.find ? `[data-find="${a.dataset.find}"]` : a.dataset.seg ? `[data-seg="${a.dataset.seg}"][data-value="${a.dataset.value}"]`
      : a.dataset.more || a.dataset.less ? `[data-list="${a.dataset.more || a.dataset.less}"] .more-opts` : null) : null;
  const scroll = $("#filters").scrollTop;
  box.innerHTML = GROUPS.map((g) => {
    const n = g.facets.reduce((s, k) => s + (st.sel[k] || []).length, 0);
    return `<section class="fgroup"><h2 class="fgroup-title">${g.title}${n ? `<span class="count" aria-label="${n} selected">${n}</span>` : ""}</h2>
      ${g.facets.map((k) => facetHtml(k, st)).join("")}</section>`;
  }).join("");
  $("#filters").scrollTop = scroll;
  if (focusKey) { const el = $(focusKey, box); if (el) el.focus({ preventScroll: true }); }
}

function renderFilterbar(st, n) {
  const chips = [];
  if (st.q) chips.push(`<button type="button" class="chip filter" data-remove="q" aria-label="Remove the search for ${esc(st.q)}"><span class="k">Search:</span> ${esc(st.q)} <i class="ph ph-x"></i></button>`);
  FACET_KEYS.forEach((k) => (st.sel[k] || []).forEach((v) => chips.push(
    `<button type="button" class="chip filter" data-remove="${k}" data-value="${esc(v)}" aria-label="Remove filter ${esc(FACETS[k].title)}: ${esc(valueName(k, v))}"><span class="k">${esc(FACETS[k].title)}:</span> ${esc(valueName(k, v))} <i class="ph ph-x"></i></button>`)));
  const bar = $("#filterbar");
  const prev = bar.dataset.n;
  bar.classList.toggle("active", chips.length > 0);
  bar.innerHTML = `<span class="count" id="count" aria-live="polite">${chips.length ? `<b>${fmt(n)}</b> of ${fmt(D.entries.length)} entries` : `<b>${fmt(n)}</b> entries`}</span>
    ${chips.join("")}${chips.length ? `<button type="button" class="clear" data-clear>Clear all</button>` : `<span class="muted" style="font-size:13.5px">Showing everything. Narrow it down with the filters.</span>`}`;
  bar.dataset.n = n;
  if (prev && Number(prev) !== n) { const c = $("#count"); c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse"); }
  const total = chips.length;
  $("#filters-open").innerHTML = `<i class="ph ph-sliders-horizontal"></i>Filters${total ? ` (${total})` : ""}`;
}

function renderBanner(st) {
  const box = $("#banner");
  if (!st.from) { box.innerHTML = ""; return; }
  const [icon, text, href, label] = FROM[st.from];
  box.innerHTML = `<div class="banner"><i class="ph ${icon}"></i><span>${text}</span><a href="${esc(st.back || href)}">${label}</a>
    <button type="button" class="x" data-dismiss aria-label="Dismiss"><i class="ph ph-x"></i></button></div>`;
}

function renderResults(st) {
  const rows = D.entries.filter((e) => matches(e, st)).sort(SORT_FN[st.sort] || SORT_FN.featured);
  const { groups, hidden } = group(rows, st.flat);
  renderFilterbar(st, rows.length);
  $("#tools").innerHTML = `<label>Sort <select id="sort">${SORTS.map(([v, t]) => `<option value="${v}"${v === st.sort ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="toggle"><input type="checkbox" id="group"${st.flat ? "" : " checked"}> Group adaptations under their original${info("family")}</label>
    ${hidden ? `<span class="muted">${hidden} ${hidden === 1 ? "adaptation is" : "adaptations are"} grouped</span>` : ""}`;
  const shown = groups.slice(0, S.limit);
  $("#cards").innerHTML = shown.length ? shown.map((g) => card(g.e, { children: g.children })).join("")
    : `<div class="empty" style="grid-column:1/-1"><b>No entries match all of these filters</b>
        Try removing one. Each filter narrows the list; options inside one filter widen it.<br><br>
        <button type="button" class="btn small" data-clear>Clear all filters</button></div>`;
  const left = groups.length - shown.length;
  $("#more").innerHTML = left > 0 ? `<button type="button" class="btn" id="load-more">Show ${Math.min(PAGE, left)} more <span class="muted">(${fmt(left)} left)</span></button>` : "";
  return rows;
}

function title(st) {
  const names = FACET_KEYS.flatMap((k) => (st.sel[k] || []).map((v) => valueName(k, v)));
  setTitle(st.q ? `"${st.q}"` : "", names.slice(0, 2).join(", ") + (names.length > 2 ? "…" : ""), "Catalog");
}

function renderAll(st) {
  renderBanner(st);
  renderGroups(st);
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
    } else if (t.id === "sort") go((q) => q.set("sort", t.value));
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
    } else if (t.dataset.more) { S.expanded.add(t.dataset.more); renderGroups(S.st); }
    else if (t.dataset.less) { S.expanded.delete(t.dataset.less); renderGroups(S.st); }
    else if (t.dataset.seg) go((q) => { q.delete(t.dataset.seg); if (t.dataset.value) q.set(t.dataset.seg, t.dataset.value); });
    else if (t.dataset.dismiss != null) go((q) => { q.delete("from"); q.delete("back"); });
    else if (t.id === "load-more") { S.limit += PAGE; renderResults(S.st); }
    else if (t.id === "filters-open") { $("#filters").classList.add("open"); $("#q").focus({ preventScroll: true }); }
    else if (t.id === "sheet-done") $("#filters").classList.remove("open");
  });
  app.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (d.matches && d.matches("details.facet")) S.open.set(d.dataset.key, d.open);
  }, true);
  const search = debounce((v) => go((q) => (v ? q.set("q", v) : q.delete("q")), { replace: true }), 220);
  app.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "q") search(t.value.trim());
    else if (t.dataset.find) {
      S.find.set(t.dataset.find, t.value);
      $(`[data-list="${t.dataset.find}"]`).innerHTML = optionRows(t.dataset.find, S.st);
    }
  });
}

export function mount({ app, query }) {
  S = { st: read(query), limit: PAGE, open: new Map(), expanded: new Set(), find: new Map() };
  app.innerHTML = `
    <div class="page-head"><h1>Catalog</h1>
      <p class="lede">Benchmarks and evaluation frameworks for health chatbots. Filter by what they test, where their questions come from, and how they score answers.</p></div>
    <div id="banner"></div>
    <div class="cat">
      <aside class="filters" id="filters" aria-label="Filters">
        <div class="sheet-head"><b>Filters</b><button type="button" class="btn small primary" id="sheet-done">Show results</button></div>
        <div class="search-wrap"><i class="ph ph-magnifying-glass" aria-hidden="true"></i>
          <input class="search" id="q" type="search" placeholder="Search names, summaries, languages" aria-label="Search the catalog" value="${esc(S.st.q)}"></div>
        <div id="groups"></div>
      </aside>
      <section aria-label="Results">
        <div class="resbar"><div class="filterbar" id="filterbar"></div></div>
        <div class="tools" id="tools"></div>
        <div class="cards" id="cards"></div>
        <div class="load-more" id="more"></div>
      </section>
    </div>
    <button type="button" class="btn primary filters-open" id="filters-open"></button>`;
  bind(app);
  renderAll(S.st);
  // Point the sidebar at the filter the reader arrived with.
  const target = S.st.open || FACET_KEYS.find((k) => S.st.sel[k]);
  const el = target && $(`.facet[data-key="${target}"]`);
  if (el) {
    $("#filters").scrollTop = Math.max(0, el.offsetTop - 120);
    if (S.st.open) { el.open = true; const f = $(".find", el); if (f) f.focus({ preventScroll: true }); }
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

export function unmount() { S = null; }
