// About: what this is, how it was built, how to use it and how not to, and what's next.

import { D } from "../data.js";
import { $, $$, esc, fmt, setTitle } from "../util.js";

const REPO = "https://github.com/littlehifive/awesome-health-ai-evals";
const file = (path, label = path) => `<a class="mono" href="${REPO}/blob/main/${path}">${label}</a>`;

const SECTIONS = [
  ["what", "What this is"],
  ["built", "How it was built"],
  ["use", "How to use it"],
  ["not", "How not to use it"],
  ["gaps", "Known gaps"],
  ["next", "What's next"],
  ["reading", "Further reading"],
  ["credit", "Credit and corrections"],
];

function reading(items) {
  return `<ul class="reading">${items.map((it) => `<li><a href="${esc(it.url)}">${esc(it.title)}</a>${it.year ? ` (${it.year})` : ""}${it.by ? `. ${esc(it.by)}` : ""}.</li>`).join("")}</ul>`;
}

export function mount({ app }) {
  setTitle("About");
  const P = D.meta.pipeline, C = D.meta.counts, R = D.meta.related;
  const low = D.entries.filter((e) => e.confidence === "low").length;

  app.innerHTML = `<div class="about-grid">
    <nav class="toc" aria-label="On this page">${SECTIONS.map(([id, t]) => `<a href="#${id}" data-sec="${id}">${t}</a>`).join("")}</nav>
    <article class="prose">
      <div class="page-head"><h1>About</h1></div>

      <h2 id="what" style="margin-top:12px">What this is</h2>
      <p>This is a catalog of benchmarks and evaluation frameworks for health chatbots and language models: test sets and rubrics for judging how a model answers health questions or talks with people about their health. It covers ${fmt(C.entries)} of them.</p>
      <p>I built it to answer three questions. What exists? How much of it comes from low- and middle-income countries? And what do these evaluations actually judge, once you look past the different names they use?</p>
      <p>It is exploratory. It isn't a systematic review, and the way it groups evaluation terms is a working draft rather than an agreed standard. I'd rather publish a useful map with its limits written down than wait for a perfect one.</p>
      <p>It's meant for people choosing how to test a health chatbot, especially one built for a low- or middle-income setting, for researchers looking for gaps, and for funders deciding what evaluation work to support.</p>

      <h2 id="built">How it was built</h2>
      <p>Language models did most of the reading. Every step left files in the repository, so you can check any decision.</p>
      <ol>
        <li><b>Search.</b> Queries to OpenAlex (keywords, papers that cite anchor benchmarks such as MedQA and HealthBench, and the reference lists of surveys), to paperclip (arXiv, medRxiv, PubMed Central and an abstracts corpus), and to Hugging Face and GitHub. ${fmt(P.queries)} logged queries returned ${fmt(P.records)} unique records. See ${file("search/queries.yaml")} and ${file("search/log.csv")}.</li>
        <li><b>Screening.</b> A small OpenAI model screened ${fmt(P.screened)} titles and abstracts and kept anything it was unsure about. A larger model rescreened what it kept with a stricter prompt. ${fmt(P.kept)} records made it through (${file("search/screening.csv")}).</li>
        <li><b>Reading.</b> Records about the same benchmark were merged into ${fmt(P.candidates)} candidates. Claude agents read the full text, dataset card or README of each one, then either wrote an entry or logged why not (${file("search/candidates.csv")}). Review agents rechecked the weakest entries. That left ${fmt(C.entries)}.</li>
        <li><b>Terms.</b> Agents copied every term an entry scores answers on, with its definition in the source's own words: ${fmt(C.terms)} terms from ${fmt(C.entries_with_terms)} entries (${file("terms/", "terms/")}).</li>
        <li><b>Constructs.</b> The terms were embedded and clustered. One Claude agent proposed constructs from the clusters. A second argued against the draft from the point of view of a primary-care clinician in a low-resource setting. Claude then reconciled the two and logged every decision in ${file("taxonomy/decisions.md")}. Finally each term was mapped to constructs with a match type, giving ${C.constructs} constructs in ${C.domains} domains.</li>
      </ol>
      <p>Entries record facts: the languages and countries of the questions, who rated answers, who built the set, how questions were made and how answers are scored. Labels such as origin and income group are worked out from those facts when the site is built, using the World Bank classification saved in the repository. The scope and decisions are in ${file("docs/plan.md")}.</p>

      <h2 id="use">How to use it</h2>
      <div class="uses">
        <div><h3>Pick benchmarks for a chatbot</h3><p>In the <a href="#/catalog">catalog</a>, filter by who the chatbot serves, the health area and where the questions come from. Each entry page says what it scores and whether you can get the data.</p></div>
        <div><h3>See what's tested where</h3><p>The <a href="#/coverage">coverage table</a> shows which constructs have evaluations grounded in low- and middle-income countries and which have almost none.</p></div>
        <div><h3>Write your own rubric</h3><p>Each <a href="#/constructs">construct page</a> quotes how every source defines that quality. Borrow wording, and look for the constructs where benchmarks disagree.</p></div>
        <div><h3>Compare two benchmarks</h3><p><a href="#/compare">Compare</a> lines up what each one judges, with its own definitions a hover away.</p></div>
      </div>
      <p>If you use Claude Code, the repository includes four skills that work from this catalog: finding benchmarks for a chatbot, adapting a rubric, scoring your own transcripts, and running an open benchmark. See ${file("skills/", "skills/")}.</p>

      <h2 id="not">How not to use it</h2>
      <ul>
        <li><b>As a ranking.</b> Citations, downloads and stars show attention, not quality.</li>
        <li><b>As a measure of the field.</b> The counts reflect what was published in English and turned up in these searches. Evaluations that teams build for their own chatbots are mostly missing.</li>
        <li><b>As the last word on any entry.</b> Language models extracted the facts, and ${fmt(low)} entries (about one in ${Math.round(C.entries / Math.max(1, low))}) carry low confidence. Check the source before you cite a detail.</li>
        <li><b>As an agreed taxonomy.</b> The constructs are a draft built with LLM help. Use them to find and compare evaluations, not to claim two scores measure the same thing.</li>
        <li><b>To compare scores across benchmarks.</b> Two benchmarks that judge the same construct still differ in their questions, raters and scales.</li>
      </ul>

      <h2 id="gaps">Known gaps</h2>
      <ul>
        <li>The search was in English only, so benchmarks described only in other languages are likely missing.</li>
        <li>Implementers rarely publish the evaluation sets they build for their own chatbots, so practice is undercounted. If you have one you can share, even as a description, please open an issue.</li>
        <li>Image question answering in radiology and pathology, clinical documentation and coding, biomedical text mining and drug discovery are out of scope on purpose.</li>
        <li>The constructs don't yet record whose guideline or standard of care a reference answer follows. That matters when a benchmark rewards advice that fits a US hospital but not a rural clinic.</li>
      </ul>

      <h2 id="next">What's next</h2>
      <ul>
        <li>Search in Spanish, Portuguese, French and Chinese for benchmarks described only in those languages.</li>
        <li>Collect evaluation sets from implementers, including ones they can only describe.</li>
        <li>Ask clinicians, including people working in low-resource settings, to review the constructs, starting with the three where benchmarks disagree.</li>
        <li>Record whose guideline each reference answer follows.</li>
        <li>Rerun the search on a schedule so new benchmarks show up.</li>
      </ul>

      <h2 id="reading">Further reading</h2>
      <p>These aren't in the catalog because they don't define how to judge a model's answers, but they're worth knowing. Below are the most cited of each kind. The full lists (${fmt(R.counts.guidance || 0)} guidance documents and ${fmt(R.counts.surveys || 0)} surveys) are in ${file("data/related.yaml")}.</p>
      <h3>Guidance and reporting standards</h3>
      ${reading(R.guidance)}
      <h3>Surveys and reviews</h3>
      ${reading(R.surveys)}

      <h2 id="credit">Credit and corrections</h2>
      <p>Made by Zezhen Wu, as a personal project. The code is MIT licensed and the content is CC BY 4.0. Datasets are linked, not copied, and each keeps its own license.</p>
      <p>Spotted a mistake, or know a benchmark that's missing? <a href="${REPO}/issues/new">Open an issue on GitHub</a>. Each entry is a YAML file, so you can also send a pull request. You can download everything as <a href="data/catalog.json" download>one JSON file</a>. Last built ${esc(D.meta.built)}.</p>
    </article></div>`;

  // Keep in-page links working inside the hash router.
  $$("[data-sec]", app).forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    $(`#${a.dataset.sec}`).scrollIntoView();
  }));
}
