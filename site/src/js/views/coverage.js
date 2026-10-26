// Coverage: how many entries fall in each pair of categories, for example constructs by
// income group. Constructs are grouped under their 13 domains; click a number for the entries.

import { D, constructName, tally } from "../data.js";
import { FACETS, ORIGIN_ORDER, info, lab } from "../labels.js";
import { heat, heatInk, legendHtml } from "../ui.js";
import { $, catalogHref, esc, fmt, setTitle } from "../util.js";

const domainsOf = (e) => [...new Set(e.constructs.map((c) => (D.constructs.get(c) || {}).domain).filter(Boolean))];

const ROWS = {
  constructs: { name: "Constructs (76), by domain", head: "Construct", get: (e) => e.constructs },
  domains: { name: "Domains (13)", head: "Domain", get: domainsOf },
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
// The catalog filter a row or column value stands for.
function filterFor(kind, v) {
  if (kind === "domains") return { constructs: D.meta.constructs.filter((c) => c.domain === v).map((c) => c.id) };
  return { [kind]: v };
}

let S;

function render() {
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

  const cells = (r, name) => cols.map((c) => {
    const n = cell.get(`${r}|${c}`) || 0;
    return `<td class="cell" style="background:${heat(n)};color:${heatInk(n)}">${n
      ? `<button type="button" data-r="${esc(r)}" data-c="${esc(c)}" aria-label="${n} entries: ${esc(name)}, ${esc(valName(ck, c))}">${fmt(n)}</button>` : ""}</td>`;
  }).join("");
  const rowHtml = (r, cls = "") => {
    const name = valName(rk, r);
    const c = rk === "constructs" ? D.constructs.get(r) : null;
    const label = rk === "constructs" ? `<a href="#/c/${r}">${esc(name)}</a>${c && c.status === "contested" ? `<span class="tag disagree badge-d" data-gloss="disagree" tabindex="0">Disagree</span>` : ""}` : esc(name);
    return `<tr class="${cls}"><th scope="row" class="rl">${label}</th>${cells(r, name)}<td class="all">${fmt(rowTotals.get(r) || 0)}</td></tr>`;
  };

  let body;
  if (rk === "constructs") {
    const domTally = new Map();
    E.forEach((e) => {
      const cs = new Set(C.get(e));
      domainsOf(e).forEach((d) => cs.forEach((c) => domTally.set(`${d}|${c}`, (domTally.get(`${d}|${c}`) || 0) + 1)));
    });
    const domTotals = tally(E, domainsOf);
    body = D.meta.domains.map((d) => {
      const members = D.meta.constructs.filter((c) => c.domain === d.id).map((c) => c.id).sort((a, b) => (rowTotals.get(b) || 0) - (rowTotals.get(a) || 0));
      const open = !S.collapsed.has(d.id);
      const dcells = cols.map((c) => {
        const n = domTally.get(`${d.id}|${c}`) || 0;
        return `<td class="cell" style="background:${heat(n)};color:${heatInk(n)}">${n ? `<button type="button" data-d="${d.id}" data-c="${esc(c)}" aria-label="${n} entries: ${esc(d.name)}, ${esc(valName(ck, c))}">${fmt(n)}</button>` : ""}</td>`;
      }).join("");
      return `<tr class="dom"><th scope="row" class="rl"><button type="button" class="dom-toggle" data-toggle="${d.id}" aria-expanded="${open}"><i class="ph ph-caret-down"></i>${esc(d.name)}</button>
        <span class="muted" style="font-weight:400;font-size:12px"> ${members.length} constructs</span></th>${dcells}<td class="all">${fmt(domTotals.get(d.id) || 0)}</td></tr>
        ${open ? members.map((m) => rowHtml(m, "con")).join("") : ""}`;
    }).join("");
  } else {
    body = [...rowTotals.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => rowHtml(r)).join("");
  }

  $("#heat").innerHTML = `<table class="heat"><thead><tr><th scope="col">${R.head}</th>${cols.map((c) => `<th scope="col">${esc(valName(ck, c))}</th>`).join("")}<th scope="col" style="text-align:right">All entries</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function setQuery() {
  history.replaceState(null, "", `#/coverage?rows=${S.rows}&cols=${S.cols}`);
}

export function mount({ app, query }) {
  setTitle("Coverage");
  S = {
    rows: ROWS[query.get("rows")] ? query.get("rows") : "constructs",
    cols: COLS[query.get("cols")] ? query.get("cols") : "income",
    collapsed: new Set(),
  };
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v.name}</option>`).join("");
  app.innerHTML = `
    <div class="page-head"><h1>Coverage</h1>
      <p class="lede">How many entries judge each construct${info("construct")}, split by where their questions come from. There are ${D.meta.counts.constructs} constructs in ${D.meta.counts.domains} domains${info("domain")}. Click a number to see those entries.</p></div>
    <div class="controls">
      <label>Rows <select id="rows">${opt(ROWS, S.rows)}</select></label>
      <label>Columns <select id="cols">${opt(COLS, S.cols)}</select></label>
      <button type="button" class="btn small" id="fold">Collapse all domains</button>
      ${legendHtml("Entries")}
    </div>
    <div class="heatwrap" id="heat"></div>
    <p class="muted" style="font-size:13.5px;margin-top:12px">An entry counts once in every row and column it belongs to, so cells don't add up to the totals. "All entries" also counts entries whose questions have no country or don't say, which have no income group or region.</p>`;
  render();
  $("#fold").hidden = S.rows !== "constructs";

  app.addEventListener("change", (ev) => {
    if (ev.target.id === "rows" || ev.target.id === "cols") {
      S[ev.target.id] = ev.target.value;
      $("#fold").hidden = S.rows !== "constructs";
      setQuery();
      render();
    }
  });
  app.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.toggle) {
      S.collapsed.has(b.dataset.toggle) ? S.collapsed.delete(b.dataset.toggle) : S.collapsed.add(b.dataset.toggle);
      render();
    } else if (b.id === "fold") {
      const all = S.collapsed.size === D.meta.domains.length;
      S.collapsed = all ? new Set() : new Set(D.meta.domains.map((d) => d.id));
      b.textContent = all ? "Collapse all domains" : "Expand all domains";
      render();
    } else if (b.dataset.c != null && (b.dataset.r != null || b.dataset.d)) {
      const rowFilter = b.dataset.d ? filterFor("domains", b.dataset.d) : filterFor(S.rows, b.dataset.r);
      const filters = { ...rowFilter };
      const colFilter = filterFor(S.cols, b.dataset.c);
      Object.entries(colFilter).forEach(([k, v]) => { filters[k] = [].concat(filters[k] || [], v); });
      location.hash = catalogHref(filters, { from: "coverage", back: `#/coverage?rows=${S.rows}&cols=${S.cols}` });
    }
  });
}

export function unmount() { S = null; }
