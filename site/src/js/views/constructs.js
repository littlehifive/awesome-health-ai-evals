// Constructs: the shared qualities evaluations judge, in two views. Browse shows the domains
// as a treemap and a ruled list; Matrix counts entries per construct by where their questions
// come from (or another column), with the constructs grouped under their domains.

import { D, constructName, tally } from "../data.js";
import { FACETS, ORIGIN_ORDER, lab } from "../labels.js";
import { bin, bindToc, chart, pageHead, registerPop } from "../ui.js";
import { $, $$, catalogHref, esc, fmt, setTitle } from "../util.js";

let S;

const domainsOf = (e) => [...new Set(e.constructs.map((c) => (D.constructs.get(c) || {}).domain).filter(Boolean))];

// ---------- Browse ----------
async function treemap(box, counts) {
  try {
    const d3 = await import("https://cdn.jsdelivr.net/npm/d3-hierarchy@3.1.2/+esm");
    const w = 960, h = 600, strip = 22;
    const root = d3.hierarchy({ children: D.meta.domains.map((d) => ({ ...d, children: D.meta.constructs.filter((c) => c.domain === d.id).map((c) => ({ ...c, value: Math.max(1, counts.get(c.id) || 0) })) })) })
      .sum((d) => d.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([w, h]).paddingOuter(3).paddingTop(strip).paddingInner(2).round(true)(root);
    const maxN = Math.max(1, ...counts.values());
    const shade = (n) => (!n ? 0 : Math.min(5, Math.max(1, Math.ceil((5 * n) / maxN))));
    // Labels wrap by words to fill the cell; what still doesn't fit ends in an ellipsis. Narrow
    // cells get a smaller face, and the bold domain names a wider per-character estimate.
    const label = (d, cls, { oneLine = false, bold = false } = {}) => {
      const ww = d.x1 - d.x0, hh = d.y1 - d.y0;
      const name = d.data.name;
      const fit = (size) => Math.floor((ww - 10) / ((bold ? 0.6 : 0.53) * size));
      const sizes = [12.5, 11, 10];
      let si = ww >= 150 ? 0 : ww >= 90 ? 1 : 2;
      // A one-line label (the domain strip) shrinks before it truncates.
      if (oneLine) while (si < sizes.length - 1 && name.length > fit(sizes[si])) si += 1;
      const size = sizes[si];
      const lh = Math.round(size * 11.5) / 10;
      const budget = fit(size);
      const maxLines = oneLine ? 1 : Math.floor((hh - 8) / lh);
      if (budget < 4 || maxLines < 1) return "";
      const cut = (s, n) => `${s.slice(0, Math.max(1, n - 1))}…`;
      const lines = [];
      let line = "";
      // Words break at spaces and after hyphens, so "danger-sign" can wrap as "danger-" / "sign".
      name.split(/\s+|(?<=-)/).map((x) => (x.length > budget ? cut(x, budget) : x)).forEach((x) => {
        const glue = line.endsWith("-") ? "" : " ";
        if (!line) line = x;
        else if (line.length + glue.length + x.length <= budget) line += glue + x;
        else { lines.push(line); line = x; }
      });
      if (line) lines.push(line);
      if (lines.length > maxLines) {
        lines.length = maxLines;
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = last.length < budget ? `${last}…` : cut(last, budget);
      }
      const x = d.x0 + 5;
      return `<text class="${cls}" x="${x}" y="${d.y0 + size + 1}" font-size="${size}">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join("")}</text>`;
    };
    const leaves = root.leaves().map((d) => {
      const n = counts.get(d.data.id) || 0, s = shade(n);
      registerPop(`tm:${d.data.id}`, () => `<b>${esc(d.data.name)}</b><div>${fmt(n)} ${n === 1 ? "entry judges" : "entries judge"} this.</div><div class="pop-long">${esc(d.data.definition || "")}</div><a class="pop-more" href="#/c/${d.data.id}">Open the construct</a>`);
      return `<a href="#/c/${d.data.id}" data-pop="tm:${d.data.id}" aria-label="${esc(d.data.name)}: ${fmt(n)} entries"><rect x="${d.x0}" y="${d.y0}" width="${d.x1 - d.x0}" height="${d.y1 - d.y0}" style="fill:var(--m${s})"></rect>${label(d, `cell-label${s >= 3 ? " light" : ""}`)}</a>`;
    }).join("");
    const doms = root.children.map((d) => `<rect class="dom-rect" x="${d.x0}" y="${d.y0}" width="${d.x1 - d.x0}" height="${d.y1 - d.y0}"></rect>${label({ x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y0 + strip, data: d.data }, "dom-label", { oneLine: true, bold: true })}`).join("");
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Treemap of ${D.meta.domains.length} domains and ${D.meta.constructs.length} constructs, sized by the number of entries that judge each">${leaves}${doms}</svg>`;
  } catch (err) {
    box.innerHTML = "";
  }
}

function browseHtml(counts) {
  const domTotals = tally(D.entries, domainsOf);
  const max = Math.max(1, ...counts.values());
  return `${chart({
    title: "",
    body: `<div class="tm" id="tm"><div class="skeleton"><div style="height:420px"></div></div></div>`,
    note: "Sized and shaded by how many entries judge each construct. Click a cell to open it.",
  })}
  <div class="dom-layout">
    <nav class="dom-nav" aria-label="Domains"><h2>Domains</h2><ol>${D.meta.domains.map((d) => `<li><a href="#d-${d.id}" data-sec="d-${d.id}"><span>${esc(d.name)}</span><span class="n">${fmt(domTotals.get(d.id) || 0)}</span></a></li>`).join("")}</ol></nav>
    <div>${D.meta.domains.map((d) => {
      const cs = D.meta.constructs.filter((c) => c.domain === d.id).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
      return `<section class="dom-sec" id="d-${d.id}"><h2>${esc(d.name)}</h2><p>${esc(d.description || "")}</p>
        <div class="crows">${cs.map((c) => { const n = counts.get(c.id) || 0; return `<a class="crow" href="#/c/${c.id}"><span class="cn">${esc(c.name)}${c.status === "contested" ? `<span class="tag warn">Benchmarks disagree</span>` : ""}</span><span class="cd">${esc(c.definition || "")}</span><span class="cc">${fmt(n)} ${n === 1 ? "entry" : "entries"}</span></a>`; }).join("")}</div>
      </section>`;
    }).join("")}</div>
  </div>`;
}

// ---------- Matrix ----------
const ROWS = {
  constructs: { name: "Constructs, by domain", head: "Construct", get: (e) => e.constructs },
  domains: { name: "Domains", head: "Domain", get: domainsOf },
  health_areas: { name: "Health area", head: "Health area", get: FACETS.health_areas.get },
  methods: { name: "How it's scored", head: "How it's scored", get: FACETS.methods.get },
  users: { name: "Who it's for", head: "Who it's for", get: FACETS.users.get },
  section: { name: "Main focus", head: "Main focus", get: FACETS.section.get },
};
const COLS = {
  income: { name: "Income group", get: FACETS.income.get, order: FACETS.income.order },
  origin: { name: "Origin", get: FACETS.origin.get, order: ORIGIN_ORDER },
  regions: { name: "Region", get: FACETS.regions.get },
  methods: { name: "How it's scored", get: FACETS.methods.get },
  users: { name: "Who it's for", get: FACETS.users.get },
};
function valName(kind, v) {
  if (kind === "constructs") return constructName(v);
  if (kind === "domains") return (D.domains.get(v) || { name: v }).name;
  return lab(kind, v);
}
function filterFor(kind, v) {
  if (kind === "domains") return { constructs: D.meta.constructs.filter((c) => c.domain === v).map((c) => c.id) };
  return { [kind]: v };
}

function renderMatrix() {
  const { rows: rk, cols: ck } = S;
  const R = ROWS[rk], C = COLS[ck];
  const E = D.entries;
  const cell = new Map();
  E.forEach((e) => {
    const cs = new Set(C.get(e));
    new Set(R.get(e)).forEach((r) => cs.forEach((c) => cell.set(`${r}|${c}`, (cell.get(`${r}|${c}`) || 0) + 1)));
  });
  const colTotals = tally(E, C.get);
  const cols = C.order ? C.order.filter((c) => colTotals.has(c)) : [...colTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const rowTotals = tally(E, R.get);
  const maxCell = Math.max(1, ...cell.values());
  const shade = (n) => (!n ? 0 : Math.min(5, Math.max(1, Math.ceil((5 * n) / maxCell))));
  const style = (n) => `background:var(--m${shade(n)});color:${shade(n) >= 3 ? "#fff" : "var(--ink)"}`;

  const cells = (r, name) => cols.map((c) => {
    const n = cell.get(`${r}|${c}`) || 0;
    return `<td class="cell" style="${style(n)}">${n ? `<button type="button" data-r="${esc(r)}" data-c="${esc(c)}" aria-label="${n} entries: ${esc(name)}, ${esc(valName(ck, c))}">${fmt(n)}</button>` : ""}</td>`;
  }).join("");
  const rowHtml = (r, cls = "") => {
    const name = valName(rk, r);
    const c = rk === "constructs" ? D.constructs.get(r) : null;
    const label = rk === "constructs" ? `<a href="#/c/${r}">${esc(name)}</a>${c && c.status === "contested" ? ` <span class="tag warn" data-help="disagree" tabindex="0">Disagree</span>` : ""}` : esc(name);
    return `<tr class="${cls}"><th scope="row" class="rl">${label}</th>${cells(r, name)}<td class="all">${fmt(rowTotals.get(r) || 0)}</td></tr>`;
  };

  let body;
  if (rk === "constructs") {
    const domTally = new Map();
    E.forEach((e) => { const cs = new Set(C.get(e)); domainsOf(e).forEach((d) => cs.forEach((c) => domTally.set(`${d}|${c}`, (domTally.get(`${d}|${c}`) || 0) + 1))); });
    const domTotals = tally(E, domainsOf);
    body = D.meta.domains.map((d) => {
      const members = D.meta.constructs.filter((c) => c.domain === d.id).map((c) => c.id).sort((a, b) => (rowTotals.get(b) || 0) - (rowTotals.get(a) || 0));
      const open = !S.collapsed.has(d.id);
      const dcells = cols.map((c) => { const n = domTally.get(`${d.id}|${c}`) || 0; return `<td class="cell" style="${style(n)}">${n ? `<button type="button" data-d="${d.id}" data-c="${esc(c)}" aria-label="${n} entries: ${esc(d.name)}, ${esc(valName(ck, c))}">${fmt(n)}</button>` : ""}</td>`; }).join("");
      return `<tr class="dom"><th scope="row" class="rl"><button type="button" class="dom-toggle" data-toggle="${d.id}" aria-expanded="${open}"><i class="ph ph-caret-down" aria-hidden="true"></i>${esc(d.name)}</button> <span class="muted small">${members.length} constructs</span></th>${dcells}<td class="all">${fmt(domTotals.get(d.id) || 0)}</td></tr>${open ? members.map((m) => rowHtml(m, "con")).join("") : ""}`;
    }).join("");
  } else {
    body = [...rowTotals.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => rowHtml(r)).join("");
  }
  $("#heat").innerHTML = `<table class="heat"><thead><tr><th scope="col">${R.head}</th>${cols.map((c) => `<th scope="col">${esc(valName(ck, c))}</th>`).join("")}<th scope="col" style="text-align:right">All entries</th></tr></thead><tbody>${body}</tbody></table>`;
}

function matrixHtml() {
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v.name}</option>`).join("");
  return `<div class="controls">
      <label>Rows <select id="rows">${opt(ROWS, S.rows)}</select></label>
      <label>Columns <select id="cols">${opt(COLS, S.cols)}</select></label>
      <button type="button" class="btn small quiet" id="fold"${S.rows !== "constructs" ? " hidden" : ""}>Collapse all domains</button>
    </div>
    <div class="heatwrap" id="heat"></div>
    <p class="chart-note">Click a number to see those entries. An entry can sit in several rows and columns, so cells don't add up to the totals.</p>`;
}

// ---------- Page ----------
function switchHtml() {
  return `<div class="switch-row"><div class="view" role="group" aria-label="View"><a href="#/constructs" class="${S.view === "browse" ? "on" : ""}"><i class="ph ph-squares-four" aria-hidden="true"></i>Browse</a><a href="#/constructs?view=matrix" class="${S.view === "matrix" ? "on" : ""}"><i class="ph ph-table" aria-hidden="true"></i>Matrix</a></div></div>`;
}

function render() {
  $("#view").innerHTML = switchHtml() + (S.view === "matrix" ? matrixHtml() : browseHtml(S.counts));
  if (S.view === "matrix") renderMatrix();
  else { treemap($("#tm"), S.counts); bindToc(S.app); }
  setTitle(S.view === "matrix" ? "Matrix" : "", "Constructs");
}

function readQuery(query) {
  S.view = query.get("view") === "matrix" ? "matrix" : "browse";
  S.rows = ROWS[query.get("rows")] ? query.get("rows") : "constructs";
  S.cols = COLS[query.get("cols")] ? query.get("cols") : "income";
}

export function mount({ app, query }) {
  S = { app, counts: tally(D.entries, (e) => e.constructs), collapsed: new Set() };
  readQuery(query);
  app.innerHTML = `<div class="wrap">${pageHead({ title: "Constructs", lede: "Common constructs across benchmarks and frameworks, grouped by key domains of evaluation." })}<div id="view"></div></div>`;
  render();

  app.addEventListener("change", (ev) => {
    if (ev.target.id === "rows" || ev.target.id === "cols") {
      S[ev.target.id] = ev.target.value;
      $("#fold").hidden = S.rows !== "constructs";
      history.replaceState(null, "", `#/constructs?view=matrix&rows=${S.rows}&cols=${S.cols}`);
      renderMatrix();
    }
  });
  app.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.toggle) { S.collapsed.has(b.dataset.toggle) ? S.collapsed.delete(b.dataset.toggle) : S.collapsed.add(b.dataset.toggle); renderMatrix(); }
    else if (b.id === "fold") {
      const all = S.collapsed.size === D.meta.domains.length;
      S.collapsed = all ? new Set() : new Set(D.meta.domains.map((d) => d.id));
      b.textContent = all ? "Collapse all domains" : "Expand all domains";
      renderMatrix();
    } else if (b.dataset.c != null && (b.dataset.r != null || b.dataset.d)) {
      const filters = { ...(b.dataset.d ? filterFor("domains", b.dataset.d) : filterFor(S.rows, b.dataset.r)) };
      Object.entries(filterFor(S.cols, b.dataset.c)).forEach(([k, v]) => { filters[k] = [].concat(filters[k] || [], v); });
      location.hash = catalogHref(filters, { from: "matrix", back: `#/constructs?view=matrix&rows=${S.rows}&cols=${S.cols}` });
    }
  });
  const d = query.get("d");
  if (d && $(`#d-${CSS.escape(d)}`)) $(`#d-${CSS.escape(d)}`).scrollIntoView();
}

export function update({ query }) {
  const was = S.view;
  readQuery(query);
  if (was !== S.view) { render(); window.scrollTo(0, 0); }
  const d = query.get("d");
  const el = d && $(`#d-${CSS.escape(d)}`);
  if (el) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

export function unmount() { S = null; }
