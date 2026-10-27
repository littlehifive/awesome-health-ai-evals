// One construct: its definition, where its entries come from, and every source term matched
// to it, with the source's own definition.

import { D, loadDetails, tally } from "../data.js";
import { LABELS, ORIGIN_ORDER, help, originTag } from "../labels.js";
import { crumbs, pageHead, tag } from "../ui.js";
import { $, catalogHref, esc, fmt, lower, setTitle } from "../util.js";

const MATCHES = ["same", "narrower", "broader", "partial"];
const PAGE = 80;
const SW = { lmic: "var(--m5)", adapted: "var(--m4)", translated: "var(--m3)", high: "var(--g1)", global: "var(--g2)", unstated: "var(--g2)" };

export async function mount({ app, arg }) {
  const c = D.constructs.get(arg);
  if (!c) {
    setTitle("Not found");
    app.innerHTML = `<div class="wrap"><div class="page-head"><h1>No construct called "${esc(arg)}"</h1><p class="lede"><a href="#/constructs">See all constructs</a>.</p></div></div>`;
    return;
  }
  setTitle(c.name, "Constructs");
  const dom = D.domains.get(c.domain);
  const entries = D.entries.filter((e) => e.constructs.includes(c.id));
  const byOrigin = tally(entries, (e) => [e.origin]);
  const back = `#/c/${c.id}`;
  const total = entries.length || 1;

  app.innerHTML = `<div class="wrap">
    ${crumbs([{ href: "#/constructs", text: "Constructs" }, dom ? { href: `#/constructs?d=${dom.id}`, text: dom.name } : null, c.name].filter(Boolean))}
    <header class="title-block"><h1>${esc(c.name)}</h1>
      <p class="meta">${tag("Construct")}${dom ? `<a href="#/constructs?d=${dom.id}">${esc(dom.name)}</a>` : ""}<span class="num">${fmt(entries.length)} ${entries.length === 1 ? "entry judges" : "entries judge"} this</span></p>
      <p class="lede">${esc(c.definition || "")}</p>
      ${c.status === "contested" ? `<p class="callout warn" style="margin-top:16px"><b>Benchmarks disagree here.</b> ${esc(c.contest_note || "Sources differ on what a good answer looks like, so their scores aren't comparable without reading each definition.")}</p>` : ""}
      <p class="links"><a class="btn primary small" href="${catalogHref({ constructs: c.id }, { from: "construct", back })}">See the ${fmt(entries.length)} entries</a><a class="btn small" href="#/constructs?view=matrix">Open the matrix</a></p>
    </header>

    <section class="sec"><h2>Where these entries' questions come from</h2>
      <div class="bar" role="img" aria-label="${ORIGIN_ORDER.map((o) => `${LABELS.origin[o]} ${byOrigin.get(o) || 0}`).join(", ")}">${ORIGIN_ORDER.map((o) => `<a class="s-${o}" href="${catalogHref({ constructs: c.id, origin: o }, { from: "construct", back })}" style="width:${(100 * (byOrigin.get(o) || 0) / total).toFixed(2)}%" title="${LABELS.origin[o]}: ${byOrigin.get(o) || 0}" aria-label="${LABELS.origin[o]}: ${byOrigin.get(o) || 0} entries"></a>`).join("")}</div>
      <ul class="bar-legend">${ORIGIN_ORDER.filter((o) => byOrigin.get(o)).map((o) => `<li style="--sw:${SW[o]}"><a href="${catalogHref({ constructs: c.id, origin: o }, { from: "construct", back })}">${LABELS.origin[o]} <b>${byOrigin.get(o)}</b></a></li>`).join("")}</ul>
    </section>

    <section class="sec"><h2>How each source defines it</h2>
      <p>One row per source term. Definitions in quotation marks are the source's own words; the rest are paraphrased. Filter by ${help("match", "how closely each matches")}.</p>
      <div id="terms"><div class="skeleton"><div style="width:70%"></div><div style="width:50%"></div><div style="width:80%"></div></div></div>
    </section></div>`;

  const det = await loadDetails().catch(() => null);
  if (!$("#terms")) return;
  if (!det) { $("#terms").innerHTML = `<p class="muted">The terms couldn't load. Reload the page to try again.</p>`; return; }
  const cite = (e) => (e.signals && e.signals.citations) || 0;
  const rows = [];
  entries.forEach((e) => (det[e.id] ? det[e.id].terms : []).forEach((t) => t.constructs.forEach((m) => { if (m.construct === c.id) rows.push({ e, t, m }); })));
  rows.sort((a, b) => MATCHES.indexOf(a.m.relationship) - MATCHES.indexOf(b.m.relationship) || cite(b.e) - cite(a.e));
  const byMatch = tally(rows, (r) => [r.m.relationship]);
  let filter = "", limit = PAGE;

  const draw = () => {
    const list = rows.filter((r) => !filter || r.m.relationship === filter);
    const btn = (v, label, n) => `<button type="button" class="chip${filter === v ? " on" : ""}" data-m="${v}">${label} <b>${fmt(n)}</b></button>`;
    $("#terms").innerHTML = `<div class="overlap" role="group" aria-label="Filter by how closely terms match">${btn("", "All", rows.length)}${MATCHES.filter((m) => byMatch.get(m)).map((m) => btn(m, LABELS.relationship[m], byMatch.get(m))).join("")}</div>
      <div class="trows">${list.slice(0, limit).map(({ e, t, m }) => `<div class="trow">
        <div class="te"><a href="#/e/${e.id}">${esc(e.name)}</a><div>${originTag(e)} <span class="muted num small">${e.year}</span></div><span class="tm2 help" data-help="match-${m.relationship}" tabindex="0">${esc(LABELS.relationship[m.relationship] || m.relationship)}</span></div>
        <div><h5>${esc(t.term)}${t.level ? ` <span class="muted small">${esc(lower(t.level))}</span>` : ""}</h5>
          ${t.definition ? `<p style="margin:0;font-size:16px">${t.definition_verbatim === false ? esc(t.definition) : `<q>${esc(t.definition)}</q>`}</p>` : `<p class="muted small">The source gives no definition.</p>`}
          ${t.location ? `<div class="tm2" style="margin-top:6px">${esc(t.location)}</div>` : ""}</div>
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
