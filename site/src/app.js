// Health AI Evals Map: single-page app over data/catalog.json.
// Routes (hash): #/ catalog, #/e/<id> entry, #/map, #/heatmap, #/constructs, #/c/<id> construct,
// #/compare?ids=a,b,c, #/about. Filters live in the catalog query string so views can link to them.

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
let DATA = null;

const LABELS = {
  section: {
    knowledge_exam: "Knowledge and exam QA", open_ended: "Open-ended and conversational",
    safety: "Safety, hallucination, and bias", mental_health: "Mental health",
    multilingual_regional: "Multilingual and regional", voice: "Voice", frameworks: "Evaluation frameworks",
  },
  kind: { benchmark: "Benchmark", eval_framework: "Framework" },
  income: { low: "Low income", "lower-middle": "Lower-middle", "upper-middle": "Upper-middle", high: "High income" },
  grounding: {
    "native LMIC": "Native LMIC", adapted: "Adapted", "translated only": "Translated only",
    "high-income only": "High-income only", "global or unknown": "Global or unknown",
  },
  methods: {
    mcq_exact_match: "Multiple choice / exact match", automatic_metric: "Automatic metric",
    rubric_llm_judge: "Rubric, LLM judge", expert_human_rating: "Expert rating",
    simulated_multi_turn: "Simulated multi-turn", real_user_data: "Real-user data",
  },
  open_data: { open: "Open", gated: "Gated", closed: "Closed", described_only: "Described only", unknown: "Unknown" },
  builders: { academic: "Academic", industry_lab: "Industry lab", implementer_ngo: "Implementer / NGO",
    government: "Government", multilateral: "Multilateral", unknown: "Unknown" },
  users: { patient_public: "Patients and public", chw: "Community health workers", nurse_midwife: "Nurses and midwives",
    pharmacist: "Pharmacists", clinician: "Clinicians", medical_student: "Medical students", unspecified: "Unspecified" },
  health_areas: { general_medicine: "General medicine", primary_care: "Primary care", maternal_newborn: "Maternal and newborn",
    child_health: "Child health", srh: "Sexual and reproductive health", hiv: "HIV", tb: "Tuberculosis", malaria: "Malaria",
    infectious_other: "Other infectious disease", ncd: "NCDs", oncology: "Oncology", cardiology: "Cardiology",
    mental_health: "Mental health", nutrition: "Nutrition", pharmacy_medication: "Pharmacy and medication", nursing: "Nursing",
    dentistry: "Dentistry", ophthalmology: "Ophthalmology", emergency_triage: "Emergency and triage",
    public_health: "Public health", traditional_medicine: "Traditional medicine", other_specialty: "Other specialty" },
  regions: { AFR: "Africa", AMR: "Americas", SEAR: "South-East Asia", EUR: "Europe", EMR: "Eastern Mediterranean", WPR: "Western Pacific" },
  provenance: { real_user_queries: "Real user queries", clinician_written: "Clinician-written", exam_questions: "Exam questions",
    llm_generated: "LLM-generated", adapted_dataset: "Adapted dataset", web_forum: "Web forum", literature: "Literature",
    not_applicable: "Not applicable", unknown: "Unknown" },
};
const pretty = (s) => String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const lab = (facet, v) => (LABELS[facet] && LABELS[facet][v]) || pretty(v);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Facets shown in the catalog sidebar: [key, title, value getter].
const FACETS = [
  ["section", "Section", (e) => [e.section]],
  ["kind", "Type", (e) => [e.kind]],
  ["grounding", "Item origin", (e) => [e.grounding]],
  ["income", "Income group", (e) => (e.income.length ? e.income : [])],
  ["regions", "WHO region", (e) => e.regions],
  ["methods", "Scoring", (e) => e.methods],
  ["open_data", "Open data", (e) => [e.open_data]],
  ["builders", "Builder", (e) => e.builders],
  ["users", "Intended users", (e) => e.users],
  ["health_areas", "Health area", (e) => e.health_areas],
  ["languages", "Language", (e) => e.languages],
  ["countries", "Country", (e) => e.countries.filter((c) => c.length === 3 && c !== "UNKNOWN")],
  ["constructs", "Construct", (e) => e.constructs],
];

function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, q = ""] = h.split("?");
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(q) };
}

function setActiveNav(route) {
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

function badge(e) {
  return `<span class="badge ${slug(e.grounding)}" title="Where the items come from">${esc(lab("grounding", e.grounding))}</span>`;
}

function signals(e) {
  const s = e.signals || {};
  const bits = [];
  if (s.citations) bits.push(`${s.citations.toLocaleString()} citations`);
  if (s.hf_downloads) bits.push(`${s.hf_downloads.toLocaleString()} downloads`);
  if (s.github_stars) bits.push(`${s.github_stars.toLocaleString()} stars`);
  return bits.join(" · ");
}

function countryName(code) {
  if (code === "GLOBAL") return "Global";
  if (code === "UNKNOWN") return "Unknown";
  return (DATA.countries[code] && DATA.countries[code].name) || code;
}

function short(list, n, noun) {
  if (!list.length) return "";
  return list.length <= n ? list.join(", ") : `${list.length} ${noun}`;
}

// ---------- Catalog ----------
function filtered(query) {
  const text = (query.get("q") || "").toLowerCase();
  const active = FACETS.map(([k, , get]) => [k, get, query.getAll(k)]).filter(([, , vals]) => vals.length);
  return DATA.entries.filter((e) => {
    if (text) {
      const hay = `${e.name} ${e.summary} ${e.id} ${e.languages.join(" ")} ${e.country_names.join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return active.every(([, get, vals]) => get(e).some((v) => vals.includes(v)));
  });
}

function renderCatalog(query) {
  setActiveNav("catalog");
  const rows = filtered(query);
  const sort = query.get("sort") || "featured";
  const cite = (e) => (e.signals && e.signals.citations) || 0;
  rows.sort((a, b) =>
    sort === "year" ? b.year - a.year || a.name.localeCompare(b.name)
    : sort === "name" ? a.name.localeCompare(b.name)
    : sort === "citations" ? cite(b) - cite(a)
    : (b.featured - a.featured) || cite(b) - cite(a));

  const lmic = DATA.entries.filter((e) => e.grounding === "native LMIC").length;
  const langs = new Set(DATA.entries.flatMap((e) => e.languages)).size;
  const ctry = new Set(DATA.entries.flatMap((e) => e.countries).filter((c) => c.length === 3 && c !== "UNKNOWN")).size;

  const facetHtml = FACETS.map(([key, title, get]) => {
    const counts = new Map();
    rows.forEach((e) => new Set(get(e)).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    query.getAll(key).forEach((v) => counts.has(v) || counts.set(v, 0));
    if (!counts.size) return "";
    const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, key === "languages" || key === "countries" || key === "constructs" ? 25 : 40);
    const open = query.getAll(key).length || ["section", "grounding", "income"].includes(key) ? " open" : "";
    return `<details${open}><summary>${title}</summary>${opts.map(([v, n]) => {
      const name = key === "countries" ? countryName(v) : key === "constructs" ? constructName(v) : lab(key, v);
      const on = query.getAll(key).includes(v) ? " checked" : "";
      return `<label class="facet-opt"><input type="checkbox" data-facet="${key}" value="${esc(v)}"${on}> ${esc(name)} <span class="n">${n}</span></label>`;
    }).join("")}</details>`;
  }).join("");

  const chips = FACETS.flatMap(([key]) => query.getAll(key).map((v) =>
    `<span class="chip x" data-facet="${key}" data-value="${esc(v)}">${esc(key === "countries" ? countryName(v) : key === "constructs" ? constructName(v) : lab(key, v))} ✕</span>`)).join("");

  app.innerHTML = `
    <section class="hero">
      <h1>Health benchmarks and evaluation frameworks for generative AI</h1>
      <p>Benchmarks and frameworks for judging how chatbots and language models answer health questions or converse about health, with attention to where the evidence comes from: low- and middle-income countries (LMICs) as well as high-income ones.</p>
      <div class="stats">
        <div class="stat"><b>${DATA.entries.length.toLocaleString()}</b><span>entries</span></div>
        <div class="stat"><b>${lmic}</b><span>with native LMIC items</span></div>
        <div class="stat"><b>${ctry}</b><span>item-origin countries</span></div>
        <div class="stat"><b>${langs}</b><span>item languages</span></div>
      </div>
    </section>
    <div class="layout">
      <aside class="filters" aria-label="Filters">
        <input class="search" type="search" placeholder="Search names, summaries, languages…" value="${esc(query.get("q") || "")}" aria-label="Search">
        ${facetHtml}
      </aside>
      <section>
        <div class="toolbar">
          <span class="count">${rows.length.toLocaleString()} ${rows.length === 1 ? "entry" : "entries"}</span>
          <label>Sort <select id="sort">
            ${[["featured", "Featured, then cited"], ["citations", "Most cited"], ["year", "Newest"], ["name", "Name"]].map(([v, t]) => `<option value="${v}"${v === sort ? " selected" : ""}>${t}</option>`).join("")}
          </select></label>
          <div class="active-filters">${chips}</div>
          ${chips ? `<a class="btn" href="#/">Clear</a>` : ""}
        </div>
        <div class="cards">${rows.slice(0, 300).map(card).join("")}</div>
        ${rows.length > 300 ? `<p class="muted">Showing 300 of ${rows.length}. Narrow the filters to see more.</p>` : ""}
      </section>
    </div>`;

  const update = (mutate) => {
    const q = new URLSearchParams(query);
    mutate(q);
    location.hash = `#/?${q.toString()}`;
  };
  app.querySelectorAll("input[data-facet]").forEach((box) => box.addEventListener("change", () => update((q) => {
    const vals = q.getAll(box.dataset.facet).filter((v) => v !== box.value);
    q.delete(box.dataset.facet);
    (box.checked ? [...vals, box.value] : vals).forEach((v) => q.append(box.dataset.facet, v));
  })));
  app.querySelectorAll(".chip.x").forEach((chip) => chip.addEventListener("click", () => update((q) => {
    const vals = q.getAll(chip.dataset.facet).filter((v) => v !== chip.dataset.value);
    q.delete(chip.dataset.facet);
    vals.forEach((v) => q.append(chip.dataset.facet, v));
  })));
  let timer;
  $(".search", app).addEventListener("input", (ev) => {
    clearTimeout(timer);
    timer = setTimeout(() => update((q) => (ev.target.value ? q.set("q", ev.target.value) : q.delete("q"))), 250);
  });
  $("#sort", app).addEventListener("change", (ev) => update((q) => q.set("sort", ev.target.value)));
}

function card(e) {
  const where = short(e.country_names.filter((n) => n !== "Unknown"), 3, "countries");
  return `<a class="card" href="#/e/${e.id}">
    <div class="row-top"><h3>${esc(e.name)}</h3><span class="muted">${e.year}</span></div>
    <div class="meta"><span class="chip kind">${lab("kind", e.kind)}</span>${badge(e)}</div>
    <div class="sum">${esc(e.summary)}</div>
    <div class="meta">
      ${e.languages.length ? `<span class="chip">${esc(short(e.languages, 3, "languages"))}</span>` : ""}
      ${where ? `<span class="chip">${esc(where)}</span>` : ""}
      ${e.methods.slice(0, 2).map((m) => `<span class="chip">${esc(lab("methods", m))}</span>`).join("")}
    </div>
    ${signals(e) ? `<div class="sig">${signals(e)}</div>` : ""}
  </a>`;
}

// ---------- Entry ----------
function renderEntry(id) {
  setActiveNav("catalog");
  const e = DATA.entries.find((x) => x.id === id);
  if (!e) { app.innerHTML = `<h1>Not found</h1><p>No entry called <span class="mono">${esc(id)}</span>. <a href="#/">Back to the catalog</a>.</p>`; return; }
  const L = e.links || {};
  const links = [
    L.paper && ["Paper", L.paper], L.arxiv && ["arXiv", `https://arxiv.org/abs/${L.arxiv}`],
    L.doi && !L.paper && ["DOI", `https://doi.org/${L.doi}`], L.dataset && ["Dataset", L.dataset],
    ...(L.huggingface || []).map((h) => [`🤗 ${h}`, `https://huggingface.co/datasets/${h}`]),
    L.code && ["Code", L.code], L.website && ["Website", L.website],
  ].filter(Boolean);
  const fact = (k, v) => (v ? `<div>${k}</div><div>${v}</div>` : "");
  const list = (facet, vals) => vals.map((v) => esc(lab(facet, v))).join(", ");
  const cn = (codes) => codes.map(countryName).join(", ");
  const s = e.signals || {};
  app.innerHTML = `
    <p><a href="#/">← Catalog</a></p>
    <div class="detail-head"><h1>${esc(e.name)}</h1><span class="chip kind">${lab("kind", e.kind)}</span>${badge(e)}<span class="muted">${e.year}</span></div>
    <p class="prose">${esc(e.summary)}</p>
    <div class="links">${links.map(([t, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join("")}
      <a class="btn primary" href="#/compare?ids=${e.id}">Compare</a></div>
    <div class="facts">
      ${fact("Section", lab("section", e.section))}
      ${fact("Item languages", esc(e.languages.join(", ")))}
      ${fact("Item origin", esc(cn(e.countries)) + (e.origin_note ? `<div class="muted">${esc(e.origin_note)}</div>` : ""))}
      ${fact("Income group", esc(e.income.map((g) => lab("income", g)).join(", ") || "—"))}
      ${fact("WHO region", esc(e.regions.map((r) => lab("regions", r)).join(", ") || "—"))}
      ${fact("Localization", esc(pretty(e.localization)))}
      ${fact("Raters based in", esc(cn(e.rater_countries)))}
      ${fact("Lead institutions", esc(cn(e.lead_countries)))}
      ${fact("Builder", list("builders", e.builders))}
      ${fact("Items from", list("provenance", e.provenance))}
      ${fact("Venue", esc(pretty(e.venue)))}
      ${fact("Health areas", esc(e.health_areas.map((h) => lab("health_areas", h)).join(", ")))}
      ${fact("Intended users", list("users", e.users))}
      ${fact("Scoring", list("methods", e.methods))}
      ${fact("Modality", esc(e.modality.join(", ")))}
      ${fact("Size", esc(e.size))}
      ${fact("Open data", esc(lab("open_data", e.open_data)))}
      ${fact("License", esc(e.license || "Not stated"))}
      ${fact("Signals", esc(signals(e)) + (s.updated ? ` <span class="muted">(as of ${esc(s.updated)})</span>` : ""))}
      ${fact("Adapted from", e.adapted_from.map((a) => `<a href="#/e/${a}">${esc(a)}</a>`).join(", "))}
    </div>
    ${e.subsets.length ? `<h2>Subsets</h2><div class="table-wrap"><table><tr><th>Subset</th><th>Languages</th><th>Countries</th><th>Localization</th></tr>
      ${e.subsets.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc((x.languages || []).join(", "))}</td><td>${esc(cn(x.countries || []))}</td><td>${esc(pretty(x.localization || ""))}</td></tr>`).join("")}</table></div>` : ""}
    ${e.terms.length ? `<h2>What it judges (${e.terms.length} terms)</h2><div class="table-wrap"><table>
      <tr><th>Term</th><th>Level</th><th>Definition</th><th>Construct</th></tr>
      ${e.terms.map((t) => `<tr><td><b>${esc(t.term)}</b>${t.parent ? `<div class="muted">under ${esc(t.parent)}</div>` : ""}</td>
        <td>${esc(t.level)}</td><td>${esc(t.definition)}${t.definition_verbatim === false ? ' <span class="muted">(paraphrased)</span>' : ""}
        ${t.location ? `<div class="muted">${esc(t.location)}</div>` : ""}</td>
        <td>${t.constructs.map((m) => `<a href="#/c/${m.construct}">${esc(constructName(m.construct))}</a> <span class="muted">${esc(m.relationship)}</span>${m.status === "contested" ? ' <span class="status-contested">contested</span>' : ""}`).join("<br>") || '<span class="muted">—</span>'}</td></tr>`).join("")}
    </table></div>` : ""}
    <h2>Extraction</h2>
    <p class="note">Confidence: <b>${esc(e.confidence)}</b>${e.read_full_text ? "; full text read" : "; full text not read"}.${e.notes ? " " + esc(e.notes) : ""}</p>
    <p class="muted">Entry file: <a class="mono" href="https://github.com/littlehifive/awesome-health-ai-evals/blob/main/entries/${e.id}.yaml">entries/${e.id}.yaml</a>. Corrections are welcome as issues or pull requests.</p>`;
}

// ---------- Map ----------
async function renderMap() {
  setActiveNav("map");
  app.innerHTML = `<h1>Where the items come from</h1>
    <p class="prose muted">Entries counted by the countries their questions, cases, or conversations came from. Click a country to see its entries. Items with no country origin (written to be general) and items whose origin the sources don't state are counted below the map.</p>
    <div class="map-box"><div class="tip"></div><p class="muted">Loading the map…</p></div>
    <div class="legend" id="legend"></div>
    <h2>By income group</h2><div class="bars" id="bars"></div>`;
  const counts = new Map();
  DATA.entries.forEach((e) => new Set(e.countries).forEach((c) => counts.set(c, (counts.get(c) || 0) + 1)));
  const byIncome = { low: 0, "lower-middle": 0, "upper-middle": 0, high: 0 };
  DATA.entries.forEach((e) => e.income.forEach((g) => (byIncome[g] = (byIncome[g] || 0) + 1)));
  const total = DATA.entries.length;
  const color = { low: "var(--low)", "lower-middle": "var(--lmid)", "upper-middle": "var(--umid)", high: "var(--high)" };
  $("#bars").innerHTML = Object.entries(byIncome).map(([g, n]) => `
    <a class="bar" href="#/?income=${g}"><span>${lab("income", g)}</span><span class="track"><span class="fill" style="width:${(100 * n / total).toFixed(1)}%;background:${color[g]}"></span></span><span>${n}</span></a>`).join("") +
    `<div class="bar"><span>Global (no country)</span><span class="track"><span class="fill" style="width:${(100 * (counts.get("GLOBAL") || 0) / total).toFixed(1)}%;background:var(--glob)"></span></span><span>${counts.get("GLOBAL") || 0}</span></div>
     <div class="bar"><span>Origin not stated</span><span class="track"><span class="fill" style="width:${(100 * (counts.get("UNKNOWN") || 0) / total).toFixed(1)}%;background:var(--glob)"></span></span><span>${counts.get("UNKNOWN") || 0}</span></div>`;

  try {
    const [d3, topojson] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm"),
      import("https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm"),
    ]);
    const world = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json")).json();
    const features = topojson.feature(world, world.objects.countries).features;
    const byNumeric = {};
    Object.entries(DATA.countries).forEach(([iso3, c]) => { if (c.numeric) byNumeric[String(Number(c.numeric))] = iso3; });
    const max = Math.max(1, ...[...counts.entries()].filter(([c]) => c.length === 3 && c !== "UNKNOWN").map(([, n]) => n));
    const steps = ["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
    const fill = (n) => (!n ? "var(--heat-0)" : steps[Math.min(3, Math.floor(3.999 * Math.log(n) / Math.log(max + 1)))]);
    const w = 960, h = 500;
    const proj = d3.geoNaturalEarth1().fitSize([w, h], { type: "Sphere" });
    const path = d3.geoPath(proj);
    const box = $(".map-box");
    const tip = $(".tip", box);
    box.querySelector("p")?.remove();
    const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img").attr("aria-label", "World map of item-origin countries");
    svg.append("path").attr("d", path({ type: "Sphere" })).attr("fill", "var(--surface-2)");
    svg.selectAll("path.country").data(features).join("path").attr("class", "country").attr("d", path)
      .attr("fill", (f) => fill(counts.get(byNumeric[String(Number(f.id))])))
      .on("mousemove", (ev, f) => {
        const iso = byNumeric[String(Number(f.id))];
        const r = box.getBoundingClientRect();
        tip.style.opacity = 1; tip.style.left = `${ev.clientX - r.left + 12}px`; tip.style.top = `${ev.clientY - r.top + 12}px`;
        tip.textContent = `${iso ? countryName(iso) : f.properties.name}: ${counts.get(iso) || 0} entries`;
      })
      .on("mouseleave", () => (tip.style.opacity = 0))
      .on("click", (ev, f) => { const iso = byNumeric[String(Number(f.id))]; if (iso && counts.get(iso)) location.hash = `#/?countries=${iso}`; });
    $("#legend").innerHTML = `<span>Entries:</span><i style="background:var(--heat-0)"></i>0` +
      steps.map((c, i) => `<i style="background:${c}"></i>${i === 3 ? `up to ${max}` : ""}`).join("");
  } catch (err) {
    $(".map-box").innerHTML = `<p class="muted">The map library couldn't load (offline?). Country counts:</p>` +
      `<p>${[...counts.entries()].filter(([c]) => c.length === 3).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<a href="#/?countries=${c}">${esc(countryName(c))}</a> ${n}`).join(" · ")}</p>`;
  }
}

// ---------- Heatmap ----------
function renderHeatmap(query) {
  setActiveNav("heatmap");
  const haveConstructs = DATA.constructs.length > 0;
  const rowsBy = query.get("rows") || (haveConstructs ? "constructs" : "health_areas");
  const colsBy = query.get("cols") || "income";
  const getters = {
    constructs: (e) => e.constructs, health_areas: (e) => e.health_areas, income: (e) => e.income,
    methods: (e) => e.methods, users: (e) => e.users, regions: (e) => e.regions, section: (e) => [e.section],
    grounding: (e) => [e.grounding],
  };
  const names = { constructs: "Construct", health_areas: "Health area", income: "Income group", methods: "Scoring",
    users: "Intended users", regions: "WHO region", section: "Section", grounding: "Item origin" };
  const valName = (k, v) => (k === "constructs" ? constructName(v) : lab(k, v));
  const tally = new Map();
  const rowTotals = new Map();
  const colTotals = new Map();
  DATA.entries.forEach((e) => {
    const rs = new Set(getters[rowsBy](e)), cs = new Set(getters[colsBy](e));
    rs.forEach((r) => { rowTotals.set(r, (rowTotals.get(r) || 0) + 1); cs.forEach((c) => tally.set(`${r}|${c}`, (tally.get(`${r}|${c}`) || 0) + 1)); });
    cs.forEach((c) => colTotals.set(c, (colTotals.get(c) || 0) + 1));
  });
  const order = { income: ["low", "lower-middle", "upper-middle", "high"] };
  const cols = order[colsBy] || [...colTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 14);
  const rows = [...rowTotals.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(0, 40);
  const max = Math.max(1, ...cols.flatMap((c) => rows.map((r) => tally.get(`${r}|${c}`) || 0)));
  // log scale, so small counts in sparse rows (often the LMIC columns) stay distinguishable
  const step = (n) => Math.min(3, Math.floor(3.999 * Math.log(n) / Math.log(max + 1)));
  const shade = (n) => (!n ? "var(--heat-0)" : ["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"][step(n)]);
  const ink = (n) => (n && step(n) >= 2 ? "var(--bg)" : "var(--fg)");
  const opt = (sel, keys) => keys.map((k) => `<option value="${k}"${k === sel ? " selected" : ""}>${names[k]}</option>`).join("");
  const rowKeys = haveConstructs ? ["constructs", "health_areas", "methods", "users", "section"] : ["health_areas", "methods", "users", "section"];
  app.innerHTML = `<h1>Heatmap</h1>
    <p class="prose muted">Number of entries for each pair. ${haveConstructs ? "Constructs come from the taxonomy built from the terms entries use." : "Constructs appear here once the taxonomy is built."} Click a cell to see the entries.</p>
    <div class="toolbar"><label>Rows <select id="rows">${opt(rowsBy, rowKeys)}</select></label>
      <label>Columns <select id="cols">${opt(colsBy, ["income", "regions", "grounding", "methods", "users", "health_areas"])}</select></label></div>
    <div class="table-wrap"><table class="heat"><tr><th class="lab">${names[rowsBy]}</th>${cols.map((c) => `<th>${esc(valName(colsBy, c))}</th>`).join("")}<th title="All entries in this row, including those whose items have no country or an unknown one">All</th></tr>
      ${rows.map((r) => `<tr><td class="lab">${rowsBy === "constructs" ? `<a href="#/c/${r}">${esc(valName(rowsBy, r))}</a>` : esc(valName(rowsBy, r))}</td>
        ${cols.map((c) => { const n = tally.get(`${r}|${c}`) || 0; return `<td class="cell" data-r="${esc(r)}" data-c="${esc(c)}" style="background:${shade(n)};color:${ink(n)}">${n || ""}</td>`; }).join("")}
        <td>${rowTotals.get(r)}</td></tr>`).join("")}
    </table></div>`;
  const go = (k, v) => { const q = new URLSearchParams(query); q.set(k, v); location.hash = `#/heatmap?${q}`; };
  $("#rows").addEventListener("change", (ev) => go("rows", ev.target.value));
  $("#cols").addEventListener("change", (ev) => go("cols", ev.target.value));
  const facetKey = { constructs: "constructs", health_areas: "health_areas", income: "income", methods: "methods", users: "users", regions: "regions", section: "section", grounding: "grounding" };
  app.querySelectorAll("td.cell").forEach((td) => td.addEventListener("click", () => {
    location.hash = `#/?${facetKey[rowsBy]}=${encodeURIComponent(td.dataset.r)}&${facetKey[colsBy]}=${encodeURIComponent(td.dataset.c)}`;
  }));
}

// ---------- Constructs ----------
function constructName(id) {
  const c = DATA.constructs.find((x) => x.id === id);
  return c ? c.name : pretty(id);
}

function renderConstructs() {
  setActiveNav("constructs");
  if (!DATA.constructs.length) {
    app.innerHTML = `<h1>Constructs</h1><p class="prose">The construct taxonomy is built bottom-up from the evaluation terms entries use (pass 2), with a proposer and a challenger agent reviewing each cluster. It hasn't been built yet.</p>`;
    return;
  }
  const counts = new Map();
  DATA.entries.forEach((e) => e.constructs.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1)));
  const domains = DATA.domains.length ? DATA.domains : [{ id: "all", name: "All constructs" }];
  app.innerHTML = `<h1>Constructs</h1>
    <p class="prose muted">What health AI evaluations judge, grouped from ${DATA.counts.terms.toLocaleString()} terms across the catalog. Each construct lists the terms mapped to it, with their verbatim definitions, how closely each matches (same, narrower, broader, partial). A proposer agent drafted the constructs and a challenger agent with a low-resource primary-care lens argued against them; <a href="https://github.com/littlehifive/awesome-health-ai-evals/blob/main/taxonomy/decisions.md">decisions</a>. <b>Contested</b> marks constructs where evaluations disagree on what counts as a good output.</p>
    <div class="domains">${domains.map((d) => {
      const cs = DATA.constructs.filter((c) => (c.domain || "all") === d.id).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
      return `<div class="domain"><h3>${esc(d.name)}</h3>${d.description ? `<p class="muted">${esc(d.description)}</p>` : ""}<ul>${cs.map((c) =>
        `<li><a href="#/c/${c.id}">${esc(c.name)}</a><span class="muted">${counts.get(c.id) || 0}</span></li>`).join("")}</ul></div>`;
    }).join("")}</div>`;
}

function renderConstruct(id) {
  setActiveNav("constructs");
  const c = DATA.constructs.find((x) => x.id === id);
  if (!c) { app.innerHTML = `<h1>Not found</h1><p><a href="#/constructs">All constructs</a></p>`; return; }
  const rows = DATA.entries.flatMap((e) => e.terms.flatMap((t) => t.constructs.filter((m) => m.construct === id).map((m) => ({ e, t, m }))));
  const domain = DATA.domains.find((d) => d.id === c.domain);
  app.innerHTML = `<p><a href="#/constructs">← Constructs</a></p>
    <h1>${esc(c.name)}</h1>
    ${domain ? `<p class="muted">${esc(domain.name)}</p>` : ""}
    <p class="prose">${esc(c.definition || "")}</p>
    ${c.status === "contested" ? `<p class="note"><span class="status-contested">Contested.</span> ${esc(c.contest_note || "")}</p>` : ""}
    <p><a class="btn" href="#/?constructs=${id}">${new Set(rows.map((r) => r.e.id)).size} entries</a></p>
    <div class="table-wrap"><table><tr><th>Entry</th><th>Term</th><th>Definition in the source</th><th>Match</th></tr>
      ${rows.map(({ e, t, m }) => `<tr><td><a href="#/e/${e.id}">${esc(e.name)}</a> ${badge(e)}</td><td><b>${esc(t.term)}</b></td>
        <td>${esc(t.definition)}${t.definition_verbatim === false ? ' <span class="muted">(paraphrased)</span>' : ""}</td>
        <td>${esc(m.relationship)}<br><span class="status-${m.status}">${esc(m.status)}</span></td></tr>`).join("")}
    </table></div>`;
}

// ---------- Compare ----------
function renderCompare(query) {
  setActiveNav("compare");
  const ids = (query.get("ids") || "").split(",").filter(Boolean).slice(0, 3);
  const picked = ids.map((id) => DATA.entries.find((e) => e.id === id)).filter(Boolean);
  const facts = [
    ["Type", (e) => lab("kind", e.kind)], ["Year", (e) => e.year], ["Item origin", (e) => e.countries.map(countryName).join(", ")],
    ["Item origin label", (e) => lab("grounding", e.grounding)], ["Languages", (e) => e.languages.join(", ")],
    ["Scoring", (e) => e.methods.map((m) => lab("methods", m)).join(", ")], ["Intended users", (e) => e.users.map((u) => lab("users", u)).join(", ")],
    ["Health areas", (e) => e.health_areas.map((h) => lab("health_areas", h)).join(", ")], ["Open data", (e) => lab("open_data", e.open_data)],
    ["Builder", (e) => e.builders.map((b) => lab("builders", b)).join(", ")], ["Size", (e) => e.size],
  ];
  const allC = [...new Set(picked.flatMap((e) => e.constructs))].sort((a, b) => constructName(a).localeCompare(constructName(b)));
  app.innerHTML = `<h1>Compare</h1>
    <p class="prose muted">Pick up to three entries to set side by side${DATA.constructs.length ? ", including which constructs each one judges" : ""}.</p>
    <div class="picker"><input class="search" id="pick" placeholder="Add an entry…" ${picked.length >= 3 ? "disabled" : ""} aria-label="Add an entry">
      ${picked.map((e) => `<span class="chip x" data-id="${e.id}">${esc(e.name)} ✕</span>`).join("")}</div>
    <div class="suggest" id="suggest" hidden></div>
    ${picked.length ? `<div class="table-wrap" style="margin-top:16px"><table><tr><th></th>${picked.map((e) => `<th><a href="#/e/${e.id}">${esc(e.name)}</a></th>`).join("")}</tr>
      ${facts.map(([k, f]) => `<tr><td class="muted">${k}</td>${picked.map((e) => `<td>${esc(f(e))}</td>`).join("")}</tr>`).join("")}
      ${allC.length ? `<tr><th colspan="${picked.length + 1}">Constructs judged</th></tr>` + allC.map((c) => `<tr><td><a href="#/c/${c}">${esc(constructName(c))}</a></td>${picked.map((e) => `<td>${e.constructs.includes(c) ? '<span class="check">✓</span>' : ""}</td>`).join("")}</tr>`).join("") : ""}
    </table></div>` : ""}`;
  const set = (list) => (location.hash = `#/compare?ids=${list.join(",")}`);
  app.querySelectorAll(".chip.x").forEach((ch) => ch.addEventListener("click", () => set(ids.filter((i) => i !== ch.dataset.id))));
  const input = $("#pick"), sug = $("#suggest");
  input?.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    const hits = q.length < 2 ? [] : DATA.entries.filter((e) => !ids.includes(e.id) && (e.name.toLowerCase().includes(q) || e.id.includes(q))).slice(0, 12);
    sug.hidden = !hits.length;
    sug.innerHTML = hits.map((e) => `<button type="button" data-id="${e.id}">${esc(e.name)} <span class="muted">${e.year}</span></button>`).join("");
    sug.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => set([...ids, b.dataset.id])));
  });
}

// ---------- About ----------
function renderAbout() {
  setActiveNav("about");
  app.innerHTML = `<div class="prose">
    <h1>About</h1>
    <p>This is an exploratory map of health benchmarks and evaluation frameworks for generative-AI chatbots and language models. It gathers what exists, shows the scope of the field, and pays attention to where the evidence comes from. It is not a systematic review, and its taxonomy is not academically adjudicated.</p>
    <h2>How it was built</h2>
    <ol>
      <li>Searches of OpenAlex (keywords, citations of anchor benchmarks, and survey reference lists), paperclip (arXiv, medRxiv, PMC, an abstracts corpus), Hugging Face, and GitHub. Every query and hit count is in the repository.</li>
      <li>Two screening passes over titles and abstracts with language models: a small model that kept anything uncertain, then a larger model with a stricter prompt.</li>
      <li>Claude agents read the full text, dataset card, or README of each remaining candidate and wrote an entry or logged why not; review agents then rechecked the weakest entries.</li>
      <li>Agents extracted every evaluation term each entry scores outputs on, with its verbatim definition, and the taxonomy was built from those terms.</li>
    </ol>
    <h2>Labels</h2>
    <p>Entries record facts: item languages, item-origin countries, rater and lead-institution countries, how items were made, who built them, and how outputs are scored. Labels are derived: income group from the World Bank classification (pinned), WHO region, and an item-origin label: <b>native LMIC</b> (items made in and for a low- or middle-income setting), <b>adapted</b>, <b>translated only</b>, <b>high-income only</b>, or <b>global or unknown</b>.</p>
    <h2>Known gaps</h2>
    <ul>
      <li>English-language search only; benchmarks described only in other languages are likely missing.</li>
      <li>Evaluation sets that implementers build for their own chatbots are rarely published, so practice is undercounted.</li>
      <li>Screening, extraction, and term mapping were done with language models. Expect errors; each entry states its confidence.</li>
    </ul>
    <p>Data: <a href="data/catalog.json">catalog.json</a>. Built ${esc(DATA.built)}. Corrections and additions: <a href="https://github.com/littlehifive/awesome-health-ai-evals/issues">GitHub issues</a>.</p>
  </div>`;
}

// ---------- Router ----------
function route() {
  const { parts, query } = parseHash();
  const [view, arg] = parts;
  window.scrollTo(0, 0);
  if (!view) return renderCatalog(query);
  if (view === "e") return renderEntry(arg);
  if (view === "map") return renderMap();
  if (view === "heatmap") return renderHeatmap(query);
  if (view === "constructs") return renderConstructs();
  if (view === "c") return renderConstruct(arg);
  if (view === "compare") return renderCompare(query);
  if (view === "about") return renderAbout();
  return renderCatalog(query);
}

$("#theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
});

fetch("data/catalog.json").then((r) => r.json()).then((d) => {
  DATA = d;
  window.addEventListener("hashchange", route);
  route();
}).catch(() => { app.innerHTML = `<p>Couldn't load data/catalog.json.</p>`; });
