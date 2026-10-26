// Home: what this is, the main gap, and ways in.

import { card } from "../cards.js";
import { D, constructName, realCountries, realLanguages, tally } from "../data.js";
import { LABELS, ORIGIN_ORDER, originTag } from "../labels.js";
import { DEFAULT_COMPARE, countUp, drawMap, mark, reveal } from "../ui.js";
import { $, catalogHref, esc, fmt, setTitle } from "../util.js";

export async function mount({ app }) {
  setTitle();
  const E = D.entries;
  const P = D.meta.pipeline;
  const counts = tally(E, (e) => e.countries);
  const nCountries = new Set(E.flatMap(realCountries)).size;
  const nLangs = new Set(E.flatMap(realLanguages)).size;
  const byOrigin = tally(E, (e) => [e.origin]);
  const lmic = byOrigin.get("lmic") || 0;
  const low = E.filter((e) => e.income.includes("low")).length;
  const chinaOnly = E.filter((e) => e.origin === "lmic" && realCountries(e).join() === "CHN").length;

  // "Start with a question": real queries with real results.
  const maternal = E.filter((e) => e.health_areas.includes("maternal_newborn") && ["lmic", "adapted"].includes(e.origin));
  const emergency = E.filter((e) => e.constructs.includes("emergency_escalation"));
  const emOrigin = tally(emergency, (e) => [e.origin]);
  const chw = E.filter((e) => e.users.includes("chw"));
  const trio = DEFAULT_COMPARE.map((id) => D.byId.get(id)).filter(Boolean);
  const featured = E.filter((e) => e.featured).sort((a, b) => (b.signals.citations || 0) - (a.signals.citations || 0));

  const seg = (o) => `var(--${{ lmic: "accent", adapted: "heat-2", translated: "heat-1", high: "fg-3", global: "border-2" }[o] || "surface-3"})`;
  const segStyle = (o) => (o === "unstated" ? "" : `background:${seg(o)}`);

  app.innerHTML = `
  <section class="hero">
    <div class="rise">
      <h1>Health AI evals, mapped</h1>
      <p class="sub">${fmt(E.length)} benchmarks and frameworks for health chatbots, sorted by where their questions come from and what they judge.</p>
      <div class="ctas"><a class="btn primary" href="#/catalog">Browse the catalog<i class="ph ph-arrow-right"></i></a><a class="btn" href="#/map">See the map</a></div>
    </div>
    <div class="hero-map mapbox rise d2" id="home-map"></div>
  </section>

  <div class="numbers">
    <a href="#/catalog"><b data-count="${E.length}">${fmt(E.length)}</b><span>benchmarks and frameworks</span></a>
    <a href="${catalogHref({ origin: "lmic" }, { from: "home" })}"><b data-count="${lmic}">${fmt(lmic)}</b><span>with questions written in low- and middle-income countries</span></a>
    <a href="#/map"><b data-count="${nCountries}">${nCountries}</b><span>countries the questions come from</span></a>
    <a href="${catalogHref({}, { open: "languages" })}"><b data-count="${nLangs}">${nLangs}</b><span>languages</span></a>
  </div>

  <section class="section reveal">
    <h2>Only ${low} entries include questions from a low-income country</h2>
    <p class="lede">${chinaOnly} of the ${lmic} entries written in low- and middle-income countries come from China alone. ${fmt(byOrigin.get("unstated"))} entries don't say where their questions come from.</p>
    <div class="stack" role="img" aria-label="Entries by origin: ${ORIGIN_ORDER.map((o) => `${LABELS.origin[o]} ${byOrigin.get(o) || 0}`).join(", ")}">
      ${ORIGIN_ORDER.map((o) => `<a href="${catalogHref({ origin: o }, { from: "home" })}" class="${o === "unstated" ? "sw-unstated" : ""}" style="flex:${byOrigin.get(o) || 0};${segStyle(o)}" title="${LABELS.origin[o]}: ${byOrigin.get(o) || 0}" aria-label="${LABELS.origin[o]}: ${byOrigin.get(o) || 0} entries"></a>`).join("")}
    </div>
    <div class="keys">${ORIGIN_ORDER.map((o) => `<a href="${catalogHref({ origin: o }, { from: "home" })}"><i class="sw-${o}"></i>${LABELS.origin[o]} <b>${byOrigin.get(o) || 0}</b></a>`).join("")}</div>
    <p style="margin-top:18px"><a class="btn small" href="${catalogHref({ income: "low" }, { from: "home" })}">See the ${low} entries with questions from low-income countries<i class="ph ph-arrow-right"></i></a></p>
  </section>

  <section class="section reveal">
    <h2>Start with a question</h2>
    <div class="ask">
      <a class="tint" href="${catalogHref({ health_areas: "maternal_newborn", origin: ["lmic", "adapted"] }, { from: "home" })}">
        <h3>Is there a benchmark for a maternal health chatbot in a low- or middle-income country?</h3>
        <ul>${maternal.slice(0, 4).map((e) => `<li>${originTag(e)}<span>${esc(e.name)}</span></li>`).join("")}</ul>
        <span class="go">${maternal.length} entries<i class="ph ph-arrow-right"></i></span>
      </a>
      <a href="#/c/emergency_escalation">
        <h3>Who tests whether a chatbot spots an emergency?</h3>
        <span class="big">${emergency.length}</span>
        <div class="mini-stack" aria-hidden="true">${ORIGIN_ORDER.map((o) => `<span class="${o === "unstated" ? "sw-unstated" : ""}" style="flex:${emOrigin.get(o) || 0};${segStyle(o)}"></span>`).join("")}</div>
        <span class="muted" style="font-size:13.5px">entries judge ${esc(constructName("emergency_escalation").toLowerCase())}. ${emOrigin.get("lmic") || 0} have questions from low- and middle-income countries.</span>
        <span class="go">See how each one defines it<i class="ph ph-arrow-right"></i></span>
      </a>
      <a class="tint2" href="${catalogHref({ users: "chw" }, { from: "home" })}">
        <h3>What exists for chatbots that support community health workers?</h3>
        <ul>${chw.slice(0, 4).map((e) => `<li>${originTag(e)}<span>${esc(e.name)}</span></li>`).join("")}</ul>
        <span class="go">${chw.length} entries<i class="ph ph-arrow-right"></i></span>
      </a>
      <a href="#/compare?ids=${trio.map((e) => e.id).join(",")}">
        <h3>How does HealthBench differ from AfriMed-QA?</h3>
        <ul>${trio.map((e, i) => `<li>${mark(i)}<span>${esc(e.name)}</span></li>`).join("")}</ul>
        <span class="go">Compare what they judge<i class="ph ph-arrow-right"></i></span>
      </a>
    </div>
  </section>

  <section class="section reveal">
    <div class="rail-head"><h2>Featured</h2>
      <div class="btns"><button class="icon-btn" type="button" data-rail="-1" aria-label="Scroll back"><i class="ph ph-arrow-left"></i></button>
      <button class="icon-btn" type="button" data-rail="1" aria-label="Scroll forward"><i class="ph ph-arrow-right"></i></button></div></div>
    <p class="lede">A short list to start with: widely used benchmarks, and ones built in low- and middle-income countries.</p>
    <div class="rail" id="rail">${featured.map((e) => card(e)).join("")}</div>
  </section>

  <section class="section reveal">
    <h2>How the catalog was built</h2>
    <p class="lede">I searched OpenAlex, arXiv, medRxiv, PubMed Central, Hugging Face and GitHub, then screened and read the results with LLM help.</p>
    <div class="pipeline">
      <div><b>${fmt(P.screened)}</b><span>titles and abstracts screened</span></div>
      <div><b>${fmt(P.kept)}</b><span>kept after two screening passes</span></div>
      <div><b>${fmt(P.candidates)}</b><span>candidates read in full</span></div>
      <div class="hl"><b>${fmt(E.length)}</b><span>entries in the catalog</span></div>
      <div><b>${fmt(D.meta.counts.terms)}</b><span>scoring terms copied from their sources</span></div>
      <div class="hl"><b>${D.meta.counts.constructs}</b><span>constructs in ${D.meta.counts.domains} domains</span></div>
    </div>
    <p style="margin-top:16px"><a href="#/about">How it was built, and what it can't tell you</a></p>
  </section>

  <section class="section reveal split">
    <div>
      <h2>Use it from Claude Code</h2>
      <p class="lede">The repository includes four Claude Code skills that work from this catalog. They find benchmarks that fit your chatbot and setting, adapt a rubric, score your own transcripts, and run an open benchmark.</p>
      <a href="https://github.com/littlehifive/awesome-health-ai-evals/tree/main/skills">Read about the skills<i class="ph ph-arrow-up-right"></i></a>
    </div>
    <div class="code"><span id="install">/plugin marketplace add littlehifive/awesome-health-ai-evals
/plugin install health-ai-evals@health-ai-evals</span><button class="icon-btn copy" type="button" data-copy="#install" aria-label="Copy the install commands"><i class="ph ph-copy"></i></button></div>
  </section>`;

  drawMap($("#home-map"), { counts, href: (iso) => catalogHref({ countries: iso }, { from: "map" }) });
  countUp(app);
  reveal(app);
  const rail = $("#rail");
  app.querySelectorAll("[data-rail]").forEach((b) => b.addEventListener("click", () => {
    rail.scrollBy({ left: Number(b.dataset.rail) * rail.clientWidth * 0.9, behavior: "smooth" });
  }));
}
