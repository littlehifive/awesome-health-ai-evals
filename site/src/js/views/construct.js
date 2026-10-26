// One construct: its definition, where its entries come from, and every source term matched
// to it, with the source's own definition.

import { D, loadDetails, tally } from "../data.js";
import { LABELS, ORIGIN_ORDER, info, matchGlyph, originTag } from "../labels.js";
import { $, catalogHref, esc, fmt, setTitle } from "../util.js";

const MATCHES = ["same", "narrower", "broader", "partial"];
const PAGE = 80;

export async function mount({ app, arg }) {
  const c = D.constructs.get(arg);
  if (!c) {
    setTitle("Not found");
    app.innerHTML = `<div class="page-head"><h1>No construct called "${esc(arg)}"</h1><p class="lede"><a href="#/constructs">See all constructs</a>.</p></div>`;
    return;
  }
  setTitle(c.name, "Constructs");
  const dom = D.domains.get(c.domain);
  const entries = D.entries.filter((e) => e.constructs.includes(c.id));
  const byOrigin = tally(entries, (e) => [e.origin]);
  const seg = { lmic: "var(--accent)", adapted: "var(--heat-2)", translated: "var(--heat-1)", high: "var(--fg-3)", global: "var(--border-2)" };
  const back = `#/c/${c.id}`;

  app.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/constructs"><i class="ph ph-arrow-left"></i> Constructs</a><span>/</span>
      ${dom ? `<a href="#/constructs?d=${dom.id}">${esc(dom.name)}</a>` : ""}</nav>
    <div class="page-head">
      <h1>${esc(c.name)}</h1>
      <p class="lede">${esc(c.definition || "")}</p>
      ${c.status === "contested" ? `<div class="note warn"><b>Benchmarks disagree here${info("disagree")}</b><br>${esc(c.contest_note || "")}</div>` : ""}
      <div class="actions"><a class="btn primary" href="${catalogHref({ constructs: c.id }, { from: "construct", back })}">See the ${fmt(entries.length)} entries<i class="ph ph-arrow-right"></i></a>
        <a class="btn" href="#/coverage">Coverage table</a></div>
    </div>
    <h2>Where these entries' questions come from</h2>
    <div class="stack" style="margin-top:8px">${ORIGIN_ORDER.map((o) => `<a href="${catalogHref({ constructs: c.id, origin: o }, { from: "construct", back })}" class="${o === "unstated" ? "sw-unstated" : ""}" style="flex:${byOrigin.get(o) || 0};${seg[o] ? `background:${seg[o]}` : ""}" title="${LABELS.origin[o]}: ${byOrigin.get(o) || 0}" aria-label="${LABELS.origin[o]}: ${byOrigin.get(o) || 0} entries"></a>`).join("")}</div>
    <div class="keys">${ORIGIN_ORDER.filter((o) => byOrigin.get(o)).map((o) => `<a href="${catalogHref({ constructs: c.id, origin: o }, { from: "construct", back })}"><i class="sw-${o}"></i>${LABELS.origin[o]} <b>${byOrigin.get(o)}</b></a>`).join("")}</div>
    <h2>How each source defines it</h2>
    <p class="muted" style="margin-top:-4px">Each row is one benchmark's own term, with its definition quoted from the source. The tabs filter by how closely the term matches this construct${info("match")}.</p>
    <div id="terms"><div class="skeleton"><div style="width:70%"></div><div style="width:50%"></div><div style="width:80%"></div></div></div>`;

  const det = await loadDetails().catch(() => null);
  if (!$("#terms")) return;
  if (!det) { $("#terms").innerHTML = `<p class="muted">The terms couldn't load. Reload the page to try again.</p>`; return; }
  const cite = (e) => (e.signals && e.signals.citations) || 0;
  const rows = [];
  entries.forEach((e) => (det[e.id] ? det[e.id].terms : []).forEach((t) => t.constructs.forEach((m) => {
    if (m.construct === c.id) rows.push({ e, t, m });
  })));
  rows.sort((a, b) => MATCHES.indexOf(a.m.relationship) - MATCHES.indexOf(b.m.relationship) || cite(b.e) - cite(a.e));
  const byMatch = tally(rows, (r) => [r.m.relationship]);
  let filter = "", limit = PAGE;

  const draw = () => {
    const list = rows.filter((r) => !filter || r.m.relationship === filter);
    const btn = (v, label, n, glyph = "") => `<button type="button" data-m="${v}" aria-pressed="${filter === v}">${glyph}${label} <span class="num">${fmt(n)}</span></button>`;
    $("#terms").innerHTML = `<div class="tabs" role="group" aria-label="Filter by how closely terms match">${btn("", "All", rows.length)}
      ${MATCHES.filter((m) => byMatch.get(m)).map((m) => btn(m, LABELS.relationship[m], byMatch.get(m), matchGlyph(m))).join("")}</div>
      <div class="trows">${list.slice(0, limit).map(({ e, t, m }) => `<div class="trow">
        <div class="te"><a href="#/e/${e.id}">${esc(e.name)}</a><div>${originTag(e)} <span class="muted num" style="font-size:12.5px">${e.year}</span></div>
          <span class="tm" data-gloss="match-${m.relationship}" tabindex="0">${matchGlyph(m.relationship)}${esc(LABELS.relationship[m.relationship] || m.relationship)}</span></div>
        <div><b>${esc(t.term)}</b>${t.level ? ` <span class="tlevel">${esc(t.level)}</span>` : ""}
          ${t.definition ? `<p class="quote${t.definition_verbatim === false ? " para" : ""}">${esc(t.definition)}</p>` : ""}
          ${t.definition_verbatim === false || t.location ? `<div class="tloc">${[t.definition_verbatim === false ? "Paraphrased" : "", t.location || ""].filter(Boolean).map(esc).join(". ")}</div>` : ""}</div>
      </div>`).join("")}</div>
      ${list.length > limit ? `<div class="load-more"><button type="button" class="btn" id="more-terms">Show ${Math.min(PAGE, list.length - limit)} more <span class="muted">(${fmt(list.length - limit)} left)</span></button></div>` : ""}`;
  };
  draw();
  $("#terms").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.m != null) { filter = b.dataset.m; limit = PAGE; draw(); }
    if (b.id === "more-terms") { limit += PAGE; draw(); }
  });
}
