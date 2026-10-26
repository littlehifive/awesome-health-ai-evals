// Compare: up to three entries side by side on what they judge. Each slot has a fixed color
// and shape. Marks open a popover with that entry's own terms and definitions. The selection
// is saved in this browser, so leaving and coming back keeps it.

import { whereText } from "../cards.js";
import { D, constructName, languageName, loadDetails } from "../data.js";
import { LABELS, info, lab, originTag } from "../labels.js";
import { DEFAULT_COMPARE, getSlots, hasSavedCompare, mark, normalizeSlots, registerPop, setSlots, slotsParam } from "../ui.js";
import { $, esc, fmt, setTitle } from "../util.js";

let S;
const cite = (e) => (e.signals && e.signals.citations) || 0;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);

function readSlots(query) {
  if (query.has("ids")) return { slots: normalizeSlots(query.get("ids").split(",")), example: false };
  if (hasSavedCompare()) return { slots: getSlots(), example: false };
  return { slots: normalizeSlots(DEFAULT_COMPARE), example: true };
}

function go(slots) {
  setSlots(slots);
  location.hash = `#/compare?ids=${slotsParam(slots)}`;
}

function slotHtml(id, i) {
  if (!id) {
    return `<div class="slot empty" style="--sc:var(--s${i + 1})"><div class="sh">${mark(i, 16)}<span class="muted">Add a benchmark or framework</span></div>
      <input type="search" data-add="${i}" placeholder="Type a name, like MedQA" aria-label="Add an entry to the ${["first", "second", "third"][i]} slot" autocomplete="off">
      <div class="suggest" data-suggest="${i}" role="listbox" hidden></div></div>`;
  }
  const e = D.byId.get(id);
  const nTerms = e.n_terms, nCons = e.constructs.length;
  return `<div class="slot filled" style="--sc:var(--s${i + 1})">
    <div class="sh">${mark(i, 18)}<a href="#/e/${e.id}">${esc(e.name)}</a></div>
    <div class="card-tags">${originTag(e)}<span class="tag">${lab("kind", e.kind)}</span><span class="muted num" style="font-size:12.5px">${e.year}</span></div>
    <div class="muted" style="font-size:13px">${nTerms ? `${nTerms} ${nTerms === 1 ? "term" : "terms"}, matched to ${nCons} ${nCons === 1 ? "construct" : "constructs"}` : "No scoring terms extracted"}</div>
    <button type="button" class="rm" data-rm="${i}" aria-label="Remove ${esc(e.name)}"><i class="ph ph-x"></i></button></div>`;
}

const FACTS = [
  ["Year", (e) => e.year],
  ["Origin", (e) => originTag(e)],
  ["Where the questions come from", (e) => esc(whereText(e))],
  ["Languages", (e) => esc(e.languages.map(languageName).join(", "))],
  ["How it's scored", (e) => esc(e.methods.map((m) => lab("methods", m)).join(", "))],
  ["Who it's for", (e) => esc(e.users.map((u) => lab("users", u)).join(", "))],
  ["Health areas", (e) => esc(e.health_areas.map((h) => lab("health_areas", h)).join(", "))],
  ["Data access", (e) => esc(lab("open_data", e.open_data))],
  ["Who built it", (e) => esc(e.builders.map((b) => lab("builders", b)).join(", "))],
  ["Size", (e) => esc(e.size)],
  ["Citations", (e) => (cite(e) ? fmt(cite(e)) : "")],
];

function regionLabel(mask, filled) {
  const inSet = filled.filter(({ i }) => mask & (1 << i));
  if (inSet.length === filled.length && filled.length > 1) return filled.length === 2 ? "Shared by both" : "Shared by all three";
  if (inSet.length === 1) return `Only ${inSet[0].e.name}`;
  return `${inSet.map((x) => x.e.name).join(" and ")} only`;
}

function renderBody() {
  const filled = S.slots.map((id, i) => ({ id, i, e: D.byId.get(id) })).filter((x) => x.id);
  const body = $("#cmp-body");
  if (!filled.length) {
    body.innerHTML = `<div class="empty" style="margin-top:20px"><b>Nothing to compare yet</b>
      Add entries above, or use the Compare button on any card in the catalog.<br><br>
      <button type="button" class="btn small" data-example>Show an example</button></div>`;
    return;
  }
  if (!D.details) {
    body.innerHTML = `<div class="skeleton"><div style="width:60%"></div><div style="width:85%"></div><div style="width:40%"></div></div>`;
    return;
  }
  // construct -> slot index -> matching terms
  const hits = new Map();
  filled.forEach(({ id, i }) => (D.details[id] ? D.details[id].terms : []).forEach((t) => t.constructs.forEach((m) => {
    if (!hits.has(m.construct)) hits.set(m.construct, new Map());
    const per = hits.get(m.construct);
    if (!per.has(i)) per.set(i, []);
    per.get(i).push({ t, m });
  })));
  const maskOf = (c) => [...hits.get(c).keys()].reduce((a, i) => a | (1 << i), 0);
  const regions = new Map();
  hits.forEach((_, c) => regions.set(maskOf(c), (regions.get(maskOf(c)) || 0) + 1));
  const fullMask = filled.reduce((a, { i }) => a | (1 << i), 0);
  const order = [...regions.keys()].sort((a, b) => (b === fullMask) - (a === fullMask) || bitCount(b) - bitCount(a) || a - b);
  if (S.region != null && !regions.has(S.region)) S.region = null;

  registerPopsFor(hits, filled);
  const visible = [...hits.keys()].filter((c) => S.region == null || maskOf(c) === S.region);
  const rows = D.meta.domains.map((d) => {
    const cs = visible.filter((c) => (D.constructs.get(c) || {}).domain === d.id)
      .sort((a, b) => bitCount(maskOf(b)) - bitCount(maskOf(a)) || constructName(a).localeCompare(constructName(b)));
    if (!cs.length) return "";
    return `<tr class="dom"><td colspan="${S.slots.length + 1}">${esc(d.name)} <span class="muted" style="font-weight:400">${cs.length}</span></td></tr>
      ${cs.map((c) => {
        const con = D.constructs.get(c);
        return `<tr class="con"><td class="rl"><a href="#/c/${c}">${esc(con.name)}</a>${con.status === "contested" ? ` <span class="tag disagree" data-gloss="disagree" tabindex="0">Disagree</span>` : ""}</td>
          ${S.slots.map((id, i) => {
            const per = hits.get(c).get(i);
            if (!id) return `<td class="mc"></td>`;
            if (!per) return `<td class="mc"><span class="sr-only">${esc(D.byId.get(id).name)} doesn't judge this</span></td>`;
            return `<td class="mc"><button type="button" data-pop="cmp:${i}:${c}" data-pop-wide aria-label="${esc(D.byId.get(id).name)}: ${per.length} ${per.length === 1 ? "term" : "terms"} match ${esc(con.name)}. Show definitions">${mark(i, 16)}</button></td>`;
          }).join("")}</tr>`;
      }).join("")}`;
  }).join("");

  const total = hits.size;
  body.innerHTML = `
    ${filled.length > 1 ? `<div class="overlap" role="group" aria-label="Filter constructs by overlap"><span class="lbl">${total} constructs in all:</span>
      <button type="button" class="chip${S.region == null ? " on" : ""}" data-region="">All <b>${total}</b></button>
      ${order.map((m) => `<button type="button" class="chip${S.region === m ? " on" : ""}" data-region="${m}"><span class="marks">${filled.filter(({ i }) => m & (1 << i)).map(({ i }) => mark(i, 12)).join("")}</span>${esc(regionLabel(m, filled))} <b>${regions.get(m)}</b></button>`).join("")}</div>`
      : `<p class="muted">Add one more entry to see what they share.</p>`}
    ${total ? `<div class="table-wrap" style="margin-top:14px"><table class="matrix">
      <thead><tr><th>Construct${info("construct")}</th>${S.slots.map((id, i) => `<th class="mh">${id ? `<span class="mt">${mark(i)}${esc(clip(D.byId.get(id).name, 28))}</span>` : `<span class="mt muted">${mark(i)}Empty</span>`}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : `<p class="muted" style="margin-top:14px">None of these entries had scoring terms extracted, so there are no constructs to compare. The facts below still apply.</p>`}
    <details class="facts" style="margin-top:20px" open><summary style="cursor:pointer;font-weight:650">Basic facts</summary>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th></th>${filled.map(({ e, i }) => `<th><span class="mt" style="display:inline-flex;gap:6px;align-items:center">${mark(i)}${esc(e.name)}</span></th>`).join("")}</tr></thead>
      <tbody>${FACTS.map(([k, f]) => `<tr><td class="muted">${k}</td>${filled.map(({ e }) => `<td>${f(e)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}

const bitCount = (n) => n.toString(2).replace(/0/g, "").length;

function registerPopsFor(hits, filled) {
  filled.forEach(({ i, e }) => hits.forEach((per, c) => {
    const list = per.get(i);
    if (!list) return;
    registerPop(`cmp:${i}:${c}`, () => `<div class="pop-sec"><b>${esc(e.name)}</b> on ${esc(constructName(c))}</div>
      ${list.map(({ t, m }) => `<div class="pop-sec"><b>${esc(t.term)}</b> <span style="opacity:.8">${esc(LABELS.relationship[m.relationship] || m.relationship)}</span>
        ${t.definition ? `<blockquote>${esc(clip(t.definition, 420))}</blockquote>` : ""}</div>`).join("")}`);
  }));
}

function renderSlots() {
  $("#slots").innerHTML = S.slots.map(slotHtml).join("");
}

function render() {
  renderSlots();
  $("#example-note").hidden = !S.example;
  setTitle(S.slots.filter(Boolean).map((id) => D.byId.get(id).name).join(", "), "Compare");
  renderBody();
}

function suggest(i, text) {
  const box = $(`[data-suggest="${i}"]`);
  const q = text.trim().toLowerCase();
  const hits = q.length < 2 ? [] : D.entries.filter((e) => !S.slots.includes(e.id) && (e.name.toLowerCase().includes(q) || e.id.includes(q)))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || cite(b) - cite(a)).slice(0, 10);
  box.hidden = !hits.length;
  box.innerHTML = hits.map((e, k) => `<button type="button" role="option" data-pick="${e.id}" data-slot="${i}"${k === 0 ? ' class="hl"' : ""}><span>${esc(e.name)}</span><span class="muted num">${e.year}</span></button>`).join("");
}

export async function mount({ app, query }) {
  S = { ...readSlots(query), region: null };
  if (!S.example) setSlots(S.slots);
  app.innerHTML = `
    <div class="page-head"><h1>Compare</h1>
      <p class="lede">Put up to three benchmarks or frameworks side by side and see which constructs each one judges. Every entry gets its own color and shape. Hover over or tap a mark to read how that entry defines the construct, in its own words.</p></div>
    <div class="note" id="example-note" hidden>This is an example: a global benchmark from an industry lab, a pan-African question set, and a vignette benchmark for community health workers in Rwanda. Change any slot to compare your own picks. Your choices are saved in this browser.</div>
    <div class="slots" id="slots"></div>
    <div id="cmp-body"></div>`;
  render();

  app.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.rm != null) { const s = [...S.slots]; s[Number(b.dataset.rm)] = ""; go(s); }
    else if (b.dataset.pick) { const s = [...S.slots]; s[Number(b.dataset.slot)] = b.dataset.pick; go(s); }
    else if (b.dataset.region != null) { S.region = b.dataset.region === "" ? null : Number(b.dataset.region); renderBody(); }
    else if (b.dataset.example != null) go(DEFAULT_COMPARE);
  });
  app.addEventListener("input", (ev) => { if (ev.target.dataset.add != null) suggest(ev.target.dataset.add, ev.target.value); });
  app.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (t.dataset.add == null) return;
    const box = $(`[data-suggest="${t.dataset.add}"]`);
    const opts = [...box.querySelectorAll("button")];
    if (!opts.length) return;
    const at = opts.findIndex((o) => o.classList.contains("hl"));
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const next = (at + (ev.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, k) => o.classList.toggle("hl", k === next));
    } else if (ev.key === "Enter") { ev.preventDefault(); (opts[at] || opts[0]).click(); }
    else if (ev.key === "Escape") box.hidden = true;
  });

  await loadDetails().catch(() => null);
  if (S) renderBody();
}

export function update({ query }) {
  const next = readSlots(query);
  S.slots = next.slots;
  S.example = next.example;
  S.region = null;
  render();
}

export function unmount() { S = null; }

