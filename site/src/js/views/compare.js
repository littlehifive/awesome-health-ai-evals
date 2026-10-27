// Compare: up to three entries side by side on what they judge. Each slot has a fixed colour
// and shape. Cells name the source's own term; the popover quotes its definition. The
// selection is saved in this browser, so leaving and coming back keeps it.

import { accessText, usersText, whereText } from "../cards.js";
import { D, constructName, languageName, loadDetails } from "../data.js";
import { LABELS, help, lab, originTag, relationshipSentence } from "../labels.js";
import { DEFAULT_COMPARE, getSlots, hasSavedCompare, mark, normalizeSlots, pageHead, registerPop, setSlots, slotsParam, tag } from "../ui.js";
import { $, $$, esc, fmt, lower, setTitle } from "../util.js";

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
      <div class="srch"><input type="search" data-add="${i}" placeholder="Type a name, like MedQA" aria-label="Add an entry to the ${["first", "second", "third"][i]} slot" autocomplete="off"><div class="suggest" data-suggest="${i}" role="listbox" hidden></div></div>
      <button type="button" class="btn small quiet" data-pickfor="${i}"><i class="ph ph-list-bullets" aria-hidden="true"></i>Choose from the list</button></div>`;
  }
  const e = D.byId.get(id);
  const nTerms = e.n_terms, nCons = e.constructs.length;
  return `<div class="slot filled" style="--sc:var(--s${i + 1})">
    <div class="sh">${mark(i, 18)}<a href="#/e/${e.id}">${esc(e.name)}</a></div>
    <div class="tags">${tag(lab("kind", e.kind))}${originTag(e)}<span class="muted num small">${e.year}</span></div>
    <div class="muted small">${nTerms ? `${nTerms} scoring ${nTerms === 1 ? "term" : "terms"}, matched to ${nCons} ${nCons === 1 ? "construct" : "constructs"}` : "No scoring terms extracted"}</div>
    <button type="button" class="rm" data-rm="${i}" aria-label="Remove ${esc(e.name)}"><i class="ph ph-x" aria-hidden="true"></i></button></div>`;
}

const FACTS = [
  ["Year", (e) => String(e.year)],
  ["Type", (e) => esc(lab("kind", e.kind))],
  ["Origin", (e) => originTag(e)],
  ["Where the questions come from", (e) => esc(whereText(e, 6))],
  ["Languages", (e) => esc(e.languages.map(languageName).join(", "))],
  ["Who it's for", (e) => esc(usersText(e))],
  ["Health areas", (e) => esc(e.health_areas.map((h) => lab("health_areas", h)).join(", "))],
  ["How it's scored", (e) => esc(e.methods.map((m) => lab("methods", m)).join(", "))],
  ["Size", (e) => esc(e.size || "")],
  ["Data access", (e) => esc(accessText(e))],
  ["Who built it", (e) => esc(e.builders.map((b) => lab("builders", b)).join(", "))],
  ["Citations", (e) => (cite(e) ? fmt(cite(e)) : "")],
];

function regionLabel(mask, filled) {
  const inSet = filled.filter(({ i }) => mask & (1 << i));
  if (inSet.length === filled.length && filled.length > 1) return filled.length === 2 ? "Shared by both" : "Shared by all three";
  if (inSet.length === 1) return `Only ${inSet[0].e.name}`;
  return `${inSet.map((x) => x.e.name).join(" and ")} only`;
}
const bitCount = (n) => n.toString(2).replace(/0/g, "").length;

function registerPopsFor(hits, filled) {
  filled.forEach(({ i, e }) => hits.forEach((per, c) => {
    const list = per.get(i);
    if (!list) return;
    registerPop(`cmp:${i}:${c}`, () => `<div class="pop-sec"><span class="muted small">How ${esc(e.name)} names ${esc(constructName(c))}</span></div>
      ${list.map(({ t, m }) => `<div class="pop-sec"><b>${esc(t.term)}</b>${t.level ? ` <span class="muted small">${esc(lower(t.level))}</span>` : ""}
        <div class="pop-rel">${esc(LABELS.relationship[m.relationship] || m.relationship)}: ${esc(lower(relationshipSentence(m.relationship)))}</div>
        ${t.definition ? `<blockquote>${esc(clip(t.definition, 420))}</blockquote>` : ""}${t.location ? `<div class="pop-loc">${esc(t.location)}</div>` : ""}</div>`).join("")}
      <a class="pop-more" href="#/e/${e.id}#judged">Open ${esc(e.name)}</a>`);
  }));
}

function renderBody() {
  const filled = S.slots.map((id, i) => ({ id, i, e: D.byId.get(id) })).filter((x) => x.id);
  const body = $("#cmp-body");
  if (!filled.length) {
    body.innerHTML = `<div class="empty" style="margin-top:20px"><b>Nothing to compare yet</b>Add entries above, or use the Compare button on any card in the catalog.<br><br><button type="button" class="btn small" data-example>Show an example</button></div>`;
    return;
  }
  if (!D.details) { body.innerHTML = `<div class="skeleton"><div style="width:60%"></div><div style="width:85%"></div><div style="width:40%"></div></div>`; return; }
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
        return `<tr class="con"><td class="rl"><a href="#/c/${c}">${esc(con.name)}</a>${con.status === "contested" ? ` <span class="tag warn" data-help="disagree" tabindex="0">Disagree</span>` : ""}</td>
          ${S.slots.map((id, i) => {
            const per = hits.get(c).get(i);
            if (!id) return `<td class="mc none"></td>`;
            if (!per) return `<td class="mc none"><span class="vh">${esc(D.byId.get(id).name)} doesn't judge this</span></td>`;
            const first = per[0].t.term;
            return `<td class="mc"><button type="button" data-pop="cmp:${i}:${c}" data-pop-wide aria-label="${esc(D.byId.get(id).name)}: ${per.length} ${per.length === 1 ? "term matches" : "terms match"} ${esc(con.name)}. Show definitions">${mark(i, 14)}<span class="ct">${esc(first)}${per.length > 1 ? ` <span class="more">+${per.length - 1}</span>` : ""}</span></button></td>`;
          }).join("")}</tr>`;
      }).join("")}`;
  }).join("");

  const total = hits.size;
  body.innerHTML = `
    ${filled.length > 1 ? `<div class="overlap" role="group" aria-label="Filter constructs by overlap"><span class="lbl">${total} constructs in all:</span>
      <button type="button" class="chip${S.region == null ? " on" : ""}" data-region="">All <b>${total}</b></button>
      ${order.map((m) => `<button type="button" class="chip${S.region === m ? " on" : ""}" data-region="${m}"><span class="marks">${filled.filter(({ i }) => m & (1 << i)).map(({ i }) => mark(i, 12)).join("")}</span>${esc(regionLabel(m, filled))} <b>${regions.get(m)}</b></button>`).join("")}</div>`
      : `<p class="muted" style="margin-top:18px">Add one more entry to see what they share.</p>`}
    ${total ? `<div class="matrix-wrap"><table class="matrix">
      <thead><tr><th class="mh">${help("construct", "Construct")}</th>${S.slots.map((id, i) => `<th class="mh">${id ? `<span class="mt">${mark(i)}${esc(clip(D.byId.get(id).name, 28))}</span>` : `<span class="mt muted">${mark(i)}Empty</span>`}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="chart-note">Cells show each entry's own term. Hover or tap one for its definition and ${help("match", "how closely it matches")}.</p>`
      : `<p class="muted" style="margin-top:14px">None of these entries had scoring terms extracted, so there are no constructs to compare. The facts below still apply.</p>`}
    <div class="cmp-facts"><h2 style="font-size:22px;margin-bottom:10px">Basic facts</h2><div class="list-wrap"><table><thead><tr><th></th>${filled.map(({ e, i }) => `<th><span class="mt" style="display:inline-flex;gap:6px;align-items:center">${mark(i)}${esc(e.name)}</span></th>`).join("")}</tr></thead>
      <tbody>${FACTS.map(([k, f]) => `<tr><td class="k">${k}</td>${filled.map(({ e }) => `<td>${f(e)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}

// ---------- Picker ----------
function pickerHtml(i) {
  const q = (S.pickQ || "").trim().toLowerCase();
  const rows = D.entries.filter((e) => !S.slots.includes(e.id) && (!q || e.name.toLowerCase().includes(q) || e.id.includes(q)))
    .sort((a, b) => (b.featured - a.featured) || cite(b) - cite(a) || a.name.localeCompare(b.name)).slice(0, 60);
  return `<div class="picker" id="picker"><div class="picker-head"><h2>Choose an entry for slot ${i + 1} ${mark(i, 16)}</h2>
      <input type="search" id="pick-q" placeholder="Filter by name" aria-label="Filter the list by name" value="${esc(S.pickQ || "")}" autocomplete="off">
      <button type="button" class="btn small quiet" data-pickclose>Close</button></div>
    <div class="pick-list">${rows.map((e) => `<div class="pick-row"><div><div class="pn">${esc(e.name)}</div><div class="pm"><span class="num">${e.year}</span>${tag(lab("kind", e.kind))}${originTag(e)}${e.n_terms ? `<span>${e.n_terms} terms</span>` : `<span>no terms extracted</span>`}</div></div>
      <button type="button" class="btn small" data-pick="${e.id}" data-slot="${i}">Add</button></div>`).join("")}${rows.length === 60 ? `<p class="muted small" style="padding:10px 0">Showing the first 60. Type a name to narrow the list.</p>` : ""}</div></div>`;
}

function renderSlots() {
  $("#slots").innerHTML = S.slots.map(slotHtml).join("");
  $("#picker-box").innerHTML = S.pickFor != null ? pickerHtml(S.pickFor) : "";
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
  S = { ...readSlots(query), region: null, pickFor: null, pickQ: "" };
  if (!S.example) setSlots(S.slots);
  app.innerHTML = `<div class="wrap">
    ${pageHead({ title: "Compare", lede: "Compare benchmarks or frameworks side by side." })}
    <p class="callout" id="example-note" hidden style="margin-top:18px">This is an example: a global benchmark from an industry lab, a pan-African question set, and a vignette benchmark for community health workers in Rwanda. Change any slot to compare your own picks. Your choices are saved in this browser.</p>
    <div class="slots" id="slots"></div>
    <div id="picker-box"></div>
    <div id="cmp-body"></div></div>`;
  render();

  app.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.rm != null) { const s = [...S.slots]; s[Number(b.dataset.rm)] = ""; go(s); }
    else if (b.dataset.pick) { const s = [...S.slots]; s[Number(b.dataset.slot)] = b.dataset.pick; S.pickFor = null; S.pickQ = ""; go(s); }
    else if (b.dataset.pickfor != null) { S.pickFor = Number(b.dataset.pickfor); S.pickQ = ""; renderSlots(); $("#pick-q").focus(); }
    else if (b.dataset.pickclose != null) { S.pickFor = null; renderSlots(); }
    else if (b.dataset.region != null) { S.region = b.dataset.region === "" ? null : Number(b.dataset.region); renderBody(); }
    else if (b.dataset.example != null) go(DEFAULT_COMPARE);
  });
  app.addEventListener("input", (ev) => {
    if (ev.target.dataset.add != null) suggest(ev.target.dataset.add, ev.target.value);
    else if (ev.target.id === "pick-q") { S.pickQ = ev.target.value; const list = $("#picker .pick-list"); const tmp = document.createElement("div"); tmp.innerHTML = pickerHtml(S.pickFor); list.replaceWith(tmp.querySelector(".pick-list")); }
  });
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
