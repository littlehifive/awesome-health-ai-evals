// Entry page: a model-card-like page for one benchmark or framework. Every entry has the same
// sections in the same order (what it tests, what's in it, how answers are scored, access,
// who built it, related entries, sources), and each fact appears once. The rail holds the
// table of contents. The `card` block written by scripts/build_cards.py supplies the prose
// facts (task, how the items were made, scoring procedure, judge, scale, validation, results,
// limitations); when a field is empty the page says so instead of hiding the row.

import { domainsText } from "../cards.js";
import { D, constructName, countryName, domainOf, languageName, loadDetails, realCountries } from "../data.js";
import { LABELS, help, lab, originTag } from "../labels.js";
import { bindToc, compareBtn, docPage, facts, tag } from "../ui.js";
import { $, REPO, catalogHref, esc, fmt, join, lower, setTitle } from "../util.js";

const names = (codes) => codes.map(countryName);
const list = (facet, vals) => join(vals.map((v) => lab(facet, v)));
const link = (href, text) => `<a href="${esc(href)}">${esc(text || href.replace(/^https?:\/\//, ""))}</a>`;
const cite = (e) => (e.signals && e.signals.citations) || 0;
const NS = `<span class="none">Not stated in the source</span>`;
const said = (text, fallback = NS) => (text ? esc(text) : fallback);

function hfUrl(id) { return `https://huggingface.co/datasets/${id}`; }

function linkRow(e) {
  const L = e.links || {};
  const out = [];
  if (L.paper) out.push(["Paper", L.paper, "ph-file-text"]);
  else if (L.doi) out.push(["Paper (DOI)", `https://doi.org/${L.doi}`, "ph-file-text"]);
  else if (L.arxiv) out.push(["Paper (arXiv)", `https://arxiv.org/abs/${L.arxiv}`, "ph-file-text"]);
  else if (L.pmcid) out.push(["Paper (PMC)", `https://pmc.ncbi.nlm.nih.gov/articles/${L.pmcid}/`, "ph-file-text"]);
  if (L.dataset) out.push(["Dataset", L.dataset, "ph-database"]);
  (L.huggingface || []).forEach((h) => out.push([`Dataset (Hugging Face${(L.huggingface || []).length > 1 ? `: ${h}` : ""})`, hfUrl(h), "ph-database"]));
  if (L.code) out.push(["Code", L.code, "ph-code"]);
  if (L.website) out.push(["Website", L.website, "ph-globe"]);
  return out.map(([t, u, i]) => `<a href="${esc(u)}" target="_blank" rel="noopener"><i class="ph ${i}" aria-hidden="true"></i>${esc(t)}</a>`).join("");
}

function whereFrom(e) {
  const real = realCountries(e);
  if (real.length) return join(names(real));
  return e.origin === "global" ? "No specific country" : "Not stated";
}
const incomeRegion = (e) => join([...e.income.map((g) => lab("income", g)), ...e.regions.map((r) => lab("regions", r))]);

// ---------- Scoring terms, as a table nested the way the source nests them ----------
const LEVEL_PLURAL = { axis: "Axes", category: "Categories", dimension: "Dimensions", metric: "Metrics", criterion: "Criteria", principle: "Principles", other: "Other terms" };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (lvl) => LEVEL_PLURAL[lvl] || `${cap(lvl)}s`;
// A "definition" that only says where the term appears is no definition.
const LOC_ONLY = /^[\w\s()/-]{0,40}\b(in|from|of|under)\s+(table|section|figure|appendix|fig\.|sec\.)\s*[\w.]+\.?$/i;
const hasDefinition = (t) => t.definition && t.definition.trim().length > 12 && !LOC_ONLY.test(t.definition.trim());

function constructCells(t) {
  const cons = (t.constructs || []).map((m) => {
    const c = D.constructs.get(m.construct);
    return `<li><a href="#/c/${esc(m.construct)}" title="${esc(domainOf(m.construct) ? domainOf(m.construct).name : "")}">${esc(constructName(m.construct))}</a><em data-help="match-${m.relationship}" tabindex="0">${esc(lower(LABELS.relationship[m.relationship] || m.relationship))}</em>${c && c.status === "contested" ? `<span class="tag warn" data-help="disagree" tabindex="0">Disagree</span>` : ""}</li>`;
  }).join("");
  return cons ? `<ul class="constructs" aria-label="Matched constructs">${cons}</ul>` : `<span class="none">No match</span>`;
}

function termRow(t, showLoc, depth) {
  const def = hasDefinition(t)
    ? (t.definition_verbatim === false ? esc(t.definition) : `<q>${esc(t.definition)}</q>`)
    : `<span class="none">No definition in the source</span>`;
  return `<tr class="d${depth}">
    <td class="t"><span class="tn">${esc(t.term)}</span>${showLoc && t.location ? `<span class="loc">${esc(t.location)}</span>` : ""}</td>
    <td class="d">${def}</td>
    <td class="s" data-label="Scale">${t.scale ? esc(t.scale) : `<span class="none">Not stated</span>`}</td>
    <td class="c" data-label="Construct">${constructCells(t)}</td>
  </tr>`;
}

function termsTable(terms) {
  const byName = new Map(terms.map((t) => [t.term, t]));
  const kids = new Map();   // parent term -> child terms
  const groups = new Map(); // parent label that is not itself a term -> terms
  const top = [];
  terms.forEach((t) => {
    if (t.parent && byName.has(t.parent) && t.parent !== t.term) { if (!kids.has(t.parent)) kids.set(t.parent, []); kids.get(t.parent).push(t); }
    else if (t.parent) { if (!groups.has(t.parent)) groups.set(t.parent, []); groups.get(t.parent).push(t); }
    else top.push(t);
  });
  // Each term renders once. One location shared by every term in a group goes in the group's
  // header; otherwise each row shows its own. Nesting stops at depth 3 (deeper rows and the
  // members of any parent cycle land in "Other terms" below).
  const seen = new Set();
  const groupRows = (label, ts, depth) => {
    const locs = new Set(ts.map((t) => t.location || ""));
    const shared = locs.size === 1 ? [...locs][0] : "";
    let html = `<tr class="grp d${depth}"><th colspan="4" scope="rowgroup">${label} <span class="n">${ts.length}</span>${shared ? `<span class="loc">${esc(shared)}</span>` : ""}</th></tr>`;
    ts.forEach((t) => {
      seen.add(t);
      html += termRow(t, !shared, depth);
      const sub = depth < 3 ? (kids.get(t.term) || []).filter((k) => !seen.has(k)) : [];
      if (sub.length) html += groupRows(`Under ${esc(t.term)}`, sub, depth + 1);
    });
    return html;
  };
  const byLevel = new Map();
  top.forEach((t) => { const k = t.level || "other"; if (!byLevel.has(k)) byLevel.set(k, []); byLevel.get(k).push(t); });
  let body = "";
  byLevel.forEach((ts, lvl) => { body += groupRows(esc(plural(lvl)), ts, 0); });
  groups.forEach((ts, label) => { body += groupRows(`Under ${esc(label)}`, ts.filter((t) => !seen.has(t)), 1); });
  const left = terms.filter((t) => !seen.has(t));
  if (left.length) body += groupRows("Other terms", left, 0);
  return `<div class="list-wrap"><table class="terms">
    <thead><tr><th scope="col">Term</th><th scope="col">Definition</th><th scope="col">Scale</th><th scope="col">${help("construct", "Construct")}</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

// Three parts, the same on every entry: metrics (what is measured, from the scoring terms),
// rubrics (how a measurement becomes a score) and annotators (who or what does the scoring).
function judgedSection(e, det) {
  const c = det.card || {};
  const terms = det.terms || [];
  // Multiple-choice-only entries rarely spell out their scoring; the format implies it.
  const mcq = e.methods.length === 1 && e.methods[0] === "mcq_exact_match";
  let metrics;
  if (!terms.length) {
    metrics = `<p class="terms-intro">${e.read_full_text ? "None were extracted: the source reports one score without naming the qualities it judges." : "None were extracted because the full text wasn't read."}</p>`;
  } else {
    const cons = new Set(terms.flatMap((t) => t.constructs.map((m) => m.construct)));
    const verbatim = terms.some((t) => t.definition_verbatim !== false && hasDefinition(t));
    metrics = `<p class="terms-intro">${terms.length} ${terms.length === 1 ? "term" : "terms"} from the source, matched to ${cons.size} of the catalog's ${help("construct", "constructs")}.${verbatim ? " Definitions in quotation marks are the source's own words; the rest are paraphrased." : ""}</p>
      ${termsTable(terms)}`;
  }
  const rubrics = facts([
    ["Scale", said(c.scale, mcq ? "Correct or incorrect per item; accuracy overall." : NS)],
    ["Procedure", said(c.scoring, mcq ? "The chosen option is compared with the answer key; the score is the share of items answered correctly." : NS)],
    ["What the scores mean", said(c.score_meaning, mcq ? "A higher accuracy means more items answered as the key says." : NS)],
  ]);
  const annotators = facts([
    ["Scored by", list("methods", e.methods) || NS],
    ["Judge", said(c.judge, mcq ? "Exact match with the answer key." : NS)],
    ["Process", said(c.annotation_process, mcq ? "Automatic comparison with the answer key; no human or model rater." : NS)],
    ["Checked against people", said(c.validation, `<span class="none">Not reported</span>`)],
    ["Raters based in", e.rater_countries.length ? join(names(e.rater_countries)) : ""],
  ]);
  return `<p class="terms-intro">Metrics are what is measured, rubrics are how a measurement becomes a score, and annotators are who or what does the scoring.</p>
    <h3 id="judged-terms">Metrics</h3>${metrics}
    <h3>Rubrics</h3>${rubrics}
    <h3>Annotators</h3>${annotators}
    ${c.results ? `<h3>Results at release</h3><p>${esc(c.results)}</p>` : ""}`;
}

// ---------- Related entries ----------
function familyRows(e) {
  const kids = (D.families[e.id] || []).map((id) => D.byId.get(id)).filter(Boolean).sort((a, b) => b.year - a.year);
  const parents = e.adapted_from.map((id) => D.byId.get(id)).filter(Boolean);
  const item = (x) => `<li><a href="#/e/${x.id}">${esc(x.name)}</a><span class="yr num">${x.year}</span>${originTag(x)}</li>`;
  let html = "";
  if (parents.length) html += `<p class="note">Adapted from ${parents.map((p) => `<a href="#/e/${p.id}">${esc(p.name)}</a>`).join(", ")}.</p>`;
  if (kids.length) html += `<h3>${kids.length === 1 ? "An adaptation" : `${kids.length} adaptations`} of ${esc(e.name)}</h3><ul class="family">${kids.map(item).join("")}</ul>`;
  parents.forEach((p) => {
    const sibs = (D.families[p.id] || []).filter((id) => id !== e.id).map((id) => D.byId.get(id)).filter(Boolean);
    if (sibs.length) html += `<h3>Other adaptations of ${esc(p.name)}</h3><ul class="family">${sibs.map(item).join("")}</ul>`;
  });
  return html;
}

// Entries that judge the same constructs for the same people and health areas.
function similar(e, n = 5) {
  const A = new Set(e.constructs), U = new Set(e.users.filter((u) => u !== "unspecified")), H = new Set(e.health_areas);
  const fam = new Set([...(D.families[e.id] || []), ...e.adapted_from]);
  const jac = (a, arr) => { const b = new Set(arr); if (!a.size || !b.size) return 0; let i = 0; b.forEach((x) => { if (a.has(x)) i += 1; }); return i / (a.size + b.size - i); };
  return D.entries.filter((x) => x.id !== e.id && !fam.has(x.id)).map((x) => {
    const shared = x.constructs.filter((c) => A.has(c)).length;
    const score = jac(A, x.constructs) * 10 + jac(H, x.health_areas) * 3 + jac(U, x.users) * 2 + (x.origin === e.origin && !["unstated", "global"].includes(e.origin) ? 1 : 0);
    const why = [];
    if (shared) why.push(`${shared} shared ${shared === 1 ? "construct" : "constructs"}`);
    if (jac(H, x.health_areas) > 0) why.push("same health area");
    if (jac(U, x.users) > 0) why.push("same users");
    if (x.origin === e.origin && !["unstated", "global"].includes(e.origin)) why.push("same origin");
    return { x, score, why };
  }).filter((r) => r.score >= 2.5).sort((a, b) => b.score - a.score || cite(b.x) - cite(a.x)).slice(0, n);
}

function relatedSection(e) {
  const fam = familyRows(e);
  const sim = similar(e);
  const seeAlso = [];
  e.users.filter((u) => u !== "unspecified").slice(0, 2).forEach((u) => seeAlso.push([`Entries for ${lower(lab("users", u))}`, catalogHref({ users: u }, { from: "entry", back: `#/e/${e.id}` })]));
  e.health_areas.slice(0, 2).forEach((h) => seeAlso.push([`${lab("health_areas", h)} entries`, catalogHref({ health_areas: h }, { from: "entry", back: `#/e/${e.id}` })]));
  realCountries(e).slice(0, 2).forEach((c) => seeAlso.push([`Entries with questions from ${countryName(c)}`, catalogHref({ countries: c }, { from: "entry", back: `#/e/${e.id}` })]));
  if (!fam && !sim.length && !seeAlso.length) return "";
  return `${fam}
    ${sim.length ? `<h3 ${fam ? "" : 'style="margin-top:0"'}>Similar entries</h3><p class="note">Matched on shared constructs, health areas and users.</p>
      <ul class="sim">${sim.map(({ x, why }) => `<li><a href="#/e/${x.id}">${esc(x.name)}</a><span class="yr num">${x.year}</span>${originTag(x)}<a class="cmp" href="#/compare?ids=${e.id},${x.id}">Compare the two</a><span class="why">${esc(why.join(", "))}</span></li>`).join("")}</ul>` : ""}
    ${seeAlso.length ? `<h3>In the catalog</h3><div class="seealso">${seeAlso.map(([t, h]) => `<a class="btn small quiet" href="${h}">${esc(t)}</a>`).join("")}</div>` : ""}`;
}

// ---------- Sources ----------
function sourcesSection(e, det) {
  const L = e.links || {};
  const ids = [L.doi && `<span class="ids">DOI ${esc(L.doi)}</span>`, L.arxiv && `<span class="ids">arXiv ${esc(L.arxiv)}</span>`, L.pmcid && `<span class="ids">${esc(L.pmcid)}</span>`].filter(Boolean).join("");
  const paper = L.paper || (L.doi && `https://doi.org/${L.doi}`) || (L.arxiv && `https://arxiv.org/abs/${L.arxiv}`) || (L.pmcid && `https://pmc.ncbi.nlm.nih.gov/articles/${L.pmcid}/`);
  const seen = new Set([paper, ...(L.huggingface || []).map(hfUrl), L.dataset, L.code, L.website].filter(Boolean));
  const termSources = (det.sources || []).filter((u) => !seen.has(u));
  const cardSources = ((det.card || {}).sources || []).filter((u) => !seen.has(u) && !termSources.includes(u));
  const rows = [
    ["Paper", paper ? link(paper) + ids : ""],
    ["Dataset card", [...(L.huggingface || []).map((h) => link(hfUrl(h))), L.dataset && link(L.dataset)].filter(Boolean).join("<br>")],
    ["Code", L.code ? link(L.code) : ""],
    ["Website", L.website ? link(L.website) : ""],
    ["Also read", [...termSources, ...cardSources].map((u) => link(u)).join("<br>")],
    ["Catalog files", `${link(`${REPO}/blob/main/entries/${e.id}.yaml`, `entries/${e.id}.yaml`)}${det.terms.length ? `, ${link(`${REPO}/blob/main/terms/${e.id}.yaml`, `terms/${e.id}.yaml`)}` : ""}`],
    ["Something wrong?", `<a href="${REPO}/issues/new?title=${encodeURIComponent(`Correction: ${e.name}`)}&body=${encodeURIComponent(`Entry: entries/${e.id}.yaml\n\nWhat's wrong:\n`)}">Report a mistake</a>`],
  ];
  return `<p>Facts on this page come from these documents${e.extracted ? `, read on ${esc(e.extracted)}` : ""}${e.read_full_text ? "" : " (abstract and dataset page only)"}. Language models did the reading, so check the source before you cite a detail.</p>
    ${facts(rows, "src")}
    ${det.notes ? `<details class="notes"><summary><i class="ph ph-caret-down" aria-hidden="true"></i>Notes from extraction</summary><p>${esc(det.notes)}</p></details>` : ""}`;
}

// ---------- Page ----------
function sectionsFor(e, det) {
  const c = det.card || {};
  const s = e.signals || {};
  const sig = [s.citations != null && s.citations > 0 && `${fmt(s.citations)} citations${s.citations_source ? ` (${esc(s.citations_source)})` : ""}`,
    s.hf_downloads && `${fmt(s.hf_downloads)} Hugging Face downloads`, s.github_stars && `${fmt(s.github_stars)} GitHub stars`].filter(Boolean);
  const madeBy = list("provenance", e.provenance);
  return [
    { id: "purpose", title: "What it tests", body: facts([
      ["Task", said(c.task)],
      ["Who it's for", list("users", e.users)],
      ["Health areas", list("health_areas", e.health_areas)],
      ["Main focus", `<a href="${catalogHref({ section: e.section }, { from: "entry", back: `#/e/${e.id}` })}">${esc(lab("section", e.section))}</a>`],
      ["Format", e.modality.includes("voice") ? list("modality", e.modality) : ""],
      ["Limits the authors state", c.limitations ? esc(c.limitations) : ""],
    ]) },
    { id: "contents", title: "What's in it", body: facts([
      ["Size", e.size ? esc(e.size) : NS],
      ["How the items were made", c.items_built ? esc(c.items_built) : (madeBy || NS), c.items_built ? madeBy : ""],
      ["Example item", c.example ? `<q class="ex">${esc(c.example)}</q>` : ""],
      ["Languages", esc(join(e.languages.map(languageName)))],
      ["Where the questions come from", esc(whereFrom(e)), esc(incomeRegion(e))],
      [help("localization", "Localization"), esc(lab("localization", e.localization))],
    ]) + (e.origin_note ? `<p class="note">${esc(e.origin_note)}</p>` : "")
      + (e.subsets.length ? `<h3>Subsets</h3><table class="subsets"><thead><tr><th>Subset</th><th>Languages</th><th>Countries</th><th>Localization</th></tr></thead><tbody>${e.subsets.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(join((x.languages || []).map(languageName)))}</td><td>${esc(join(names(x.countries || [])))}</td><td>${esc(x.localization ? lab("localization", x.localization) : "")}</td></tr>`).join("")}</tbody></table>` : "") },
    { id: "judged", title: "How answers are scored", body: `<div id="judged-body">${judgedSection(e, det)}</div>` },
    { id: "access", title: "Access and license", body: facts([
      [help("data-access", "Data access"), esc(lab("open_data", e.open_data))],
      ["License", e.license ? esc(e.license) : NS],
      ["Hugging Face dataset", (e.links.huggingface || []).map((h) => link(hfUrl(h), h)).join(", ")],
      ["Dataset", e.links.dataset ? link(e.links.dataset) : ""],
      ["Code", e.links.code ? link(e.links.code) : ""],
    ]) },
    { id: "built", title: "Who built it", body: facts([
      ["Built by", list("builders", e.builders)],
      ["Lead institutions in", e.lead_countries.length ? esc(join(names(e.lead_countries))) : ""],
      ["Published as", esc(lab("venue", e.venue))],
      ["Year", String(e.year)],
      [help("signals", "Uptake"), sig.length ? `${sig.join("; ")}${s.updated ? `<span class="ids">as of ${esc(s.updated)}</span>` : ""}` : ""],
    ]) },
    { id: "related", title: "Related entries", body: relatedSection(e) },
    { id: "sources", title: "Sources", body: sourcesSection(e, det) },
  ];
}

let live = 0; // which mount is current, so a late details.json never redraws an older page

export async function mount({ app, arg }) {
  const me = ++live;
  const e = D.byId.get(arg);
  if (!e) {
    setTitle("Not found");
    app.innerHTML = `<div class="wrap"><div class="page-head"><h1>No entry called "${esc(arg)}"</h1><p class="lede">It may have been merged or renamed. <a href="#/catalog">Search the catalog</a>.</p></div></div>`;
    return;
  }
  setTitle(e.name);
  let back = "#/catalog";
  try { back = sessionStorage.getItem("lastCatalog") || back; } catch (err) { /* default */ }

  const titleBlock = `<h1>${esc(e.name)}</h1>
    <p class="meta">${tag(lab("kind", e.kind))}<span class="num">${e.year}</span>${originTag(e)}${e.featured ? `<span class="tag featured" data-help="featured" tabindex="0">Featured</span>` : ""}</p>
    <p class="lede">${esc(e.summary)}</p>
    <p class="links">${linkRow(e)}${compareBtn(e.id, "btn small")}</p>`;

  const draw = (det) => {
    app.innerHTML = `<div class="wrap">${docPage({
      crumbs: [{ href: back, text: "Catalog" }, { href: catalogHref({ section: e.section }), text: lab("section", e.section) }, e.name],
      titleBlock, details: "", sections: sectionsFor(e, det),
    })}</div>`;
    bindToc(app);
  };
  // Draw once with what entries.json has, then again when the details (terms and card) arrive.
  draw({ terms: [], notes: "", sources: [], terms_extracted: "", card: {} });
  try {
    const d = await loadDetails();
    if (live !== me) return; // navigated away
    draw(d[e.id] || { terms: [], notes: "", sources: [], terms_extracted: "", card: {} });
  } catch (err) {
    if (live === me && $("#judged-body")) $("#judged-body").insertAdjacentHTML("beforeend", `<p class="muted">The scoring terms couldn't load. Reload the page to try again.</p>`);
  }
}

export { domainsText };
