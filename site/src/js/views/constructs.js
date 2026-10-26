// Constructs: the 76 shared qualities evaluations judge, in 13 domains, and how a benchmark's
// own terms roll up into them.

import { D, loadDetails, tally } from "../data.js";
import { info, matchLegend } from "../labels.js";
import { $, esc, fmt, setTitle } from "../util.js";

export function mount({ app, query }) {
  setTitle("Constructs");
  const counts = tally(D.entries, (e) => e.constructs);
  const max = Math.max(1, ...counts.values());
  const C = D.meta.counts;

  app.innerHTML = `
    <div class="page-head"><h1>Constructs</h1>
      <p class="lede">What health AI evaluations judge. Each benchmark names the qualities it scores in its own words. Those terms were matched to ${C.constructs} shared constructs${info("construct")} in ${C.domains} domains${info("domain")}, so you can compare benchmarks that use different words for the same thing.</p></div>
    <div class="flow" aria-label="How entries, terms, constructs and domains fit together">
      <div><b>${fmt(C.entries_with_terms)}</b><span>entries name what they score</span><span class="ex" id="ex-entry"></span></div>
      <div><b>${fmt(C.terms)}</b><span>terms, in each source's own words</span><span class="ex" id="ex-term"></span></div>
      <div><b>${C.constructs}</b><span>constructs the terms were matched to</span><span class="ex" id="ex-construct"></span></div>
      <div><b>${C.domains}</b><span>domains that group the constructs</span><span class="ex" id="ex-domain"></span></div>
    </div>
    ${matchLegend()}
    <p class="muted" style="font-size:14px;margin-top:-4px">A term can match more than one construct. <span class="tag disagree">Benchmarks disagree</span> marks constructs where benchmarks don't agree on what a good answer is${info("disagree")}.</p>
    <nav class="jump" aria-label="Domains">${D.meta.domains.map((d) => `<a class="chip" href="#/constructs?d=${d.id}">${esc(d.name)}</a>`).join("")}</nav>
    ${D.meta.domains.map((d) => {
      const cs = D.meta.constructs.filter((c) => c.domain === d.id).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
      return `<section class="domain" id="d-${d.id}"><h2>${esc(d.name)} <span class="muted num" style="font-size:15px;font-weight:450">${cs.length} constructs</span></h2>
        <p>${esc(d.description || "")}</p>
        <div class="crows">${cs.map((c) => {
          const n = counts.get(c.id) || 0;
          return `<a class="crow" href="#/c/${c.id}"><span class="cn">${esc(c.name)}${c.status === "contested" ? `<span class="tag disagree">Benchmarks disagree</span>` : ""}</span>
            <span class="cd">${esc(c.definition || "")}</span>
            <span class="cc">${fmt(n)} ${n === 1 ? "entry" : "entries"}<i style="width:${Math.max(2, (100 * n) / max)}%"></i></span></a>`;
        }).join("")}</div></section>`;
    }).join("")}`;

  const d = query.get("d");
  if (d && $(`#d-${CSS.escape(d)}`)) $(`#d-${CSS.escape(d)}`).scrollIntoView();

  // A worked example for the strip, taken from HealthBench when its terms are available.
  loadDetails().then((det) => {
    const t = ((det.healthbench || {}).terms || []).find((x) => x.constructs.some((m) => m.construct === "emergency_escalation"));
    if (!t || !$("#ex-entry")) return;
    const c = D.constructs.get("emergency_escalation");
    const dom = D.domains.get(c.domain);
    $("#ex-entry").innerHTML = `e.g. <a href="#/e/healthbench">HealthBench</a>`;
    $("#ex-term").textContent = `"${t.term}"`;
    $("#ex-construct").innerHTML = `<a href="#/c/${c.id}">${esc(c.name)}</a>`;
    $("#ex-domain").textContent = dom.name;
  }).catch(() => {});
}

export function update(ctx) {
  const d = ctx.query.get("d");
  const el = d && $(`#d-${CSS.escape(d)}`);
  if (el) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
