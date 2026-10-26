// Entry page: the facts, the adaptation family, and what it judges, shown as the source's own
// terms (nested the way the source nests them) with the constructs each one maps to.

import { signalText } from "../cards.js";
import { D, constructName, countryName, domainOf, languageName, loadDetails, realCountries } from "../data.js";
import { LABELS, info, lab, matchGlyph, matchLegend, originTag } from "../labels.js";
import { compareBtn } from "../ui.js";
import { $, esc, setTitle } from "../util.js";

const REPO = "https://github.com/littlehifive/awesome-health-ai-evals";

function links(e) {
  const L = e.links || {};
  return [
    L.paper && ["Paper", L.paper, "ph-file-text"],
    L.arxiv && !L.paper && ["arXiv", `https://arxiv.org/abs/${L.arxiv}`, "ph-article"],
    L.doi && !L.paper && ["DOI", `https://doi.org/${L.doi}`, "ph-article"],
    L.dataset && ["Dataset", L.dataset, "ph-database"],
    ...(L.huggingface || []).map((h) => [`Hugging Face: ${h}`, `https://huggingface.co/datasets/${h}`, "ph-database"]),
    L.code && ["Code", L.code, "ph-code"],
    L.website && ["Website", L.website, "ph-globe"],
  ].filter(Boolean);
}

const fact = (label, value, g) => (value ? `<div><dt>${label}${g ? info(g) : ""}</dt><dd>${value}</dd></div>` : "");
const list = (facet, vals) => vals.map((v) => esc(lab(facet, v))).join(", ");
const names = (codes) => codes.map(countryName).join(", ");

function whereFrom(e) {
  const real = realCountries(e);
  const base = real.length ? esc(names(real)) : e.origin === "global" ? "No specific country" : "Not stated";
  return base + (e.origin_note ? `<span class="muted">${esc(e.origin_note)}</span>` : "");
}

function familyBlock(e) {
  const kids = (D.families[e.id] || []).map((id) => D.byId.get(id)).filter(Boolean);
  const parents = e.adapted_from.map((id) => D.byId.get(id)).filter(Boolean);
  const item = (x) => `<li>${originTag(x)} <a href="#/e/${x.id}">${esc(x.name)}</a> <span class="muted num">${x.year}</span></li>`;
  let html = "";
  if (kids.length) {
    html += `<div class="facts fam-box"><h2><i class="ph ph-git-fork"></i> ${kids.length} ${kids.length === 1 ? "adaptation" : "adaptations"} of ${esc(e.name)}${info("family")}</h2>
      <ul class="family" style="list-style:none;padding:0;margin:0;display:grid;gap:6px">${kids.sort((a, b) => b.year - a.year).map(item).join("")}</ul></div>`;
  }
  parents.forEach((p) => {
    const sibs = (D.families[p.id] || []).filter((id) => id !== e.id).map((id) => D.byId.get(id)).filter(Boolean);
    html += `<div class="facts fam-box"><h2><i class="ph ph-git-fork"></i> Adapted from <a href="#/e/${p.id}">${esc(p.name)}</a>${info("family")}</h2>
      ${sibs.length ? `<p class="muted" style="margin:0 0 8px;font-size:14px">${sibs.length} other ${sibs.length === 1 ? "adaptation" : "adaptations"} of ${esc(p.name)}:</p>
      <ul class="family" style="list-style:none;padding:0;margin:0;display:grid;gap:6px">${sibs.map(item).join("")}</ul>` : ""}</div>`;
  });
  return html;
}

// Nest terms under their parent term when the parent is also a term; otherwise group them
// under the parent's label (e.g. HealthBench's "themes"). Source order is kept.
function tree(terms) {
  const byName = new Map(terms.map((t) => [t.term, t]));
  const kids = new Map();
  const top = [];
  const groups = new Map();
  terms.forEach((t) => {
    if (t.parent && byName.has(t.parent) && t.parent !== t.term) {
      if (!kids.has(t.parent)) kids.set(t.parent, []);
      kids.get(t.parent).push(t);
    } else if (t.parent) {
      if (!groups.has(t.parent)) { groups.set(t.parent, []); top.push({ group: t.parent }); }
      groups.get(t.parent).push(t);
    } else top.push(t);
  });
  const node = (t, depth) => {
    const sub = depth < 4 ? kids.get(t.term) || [] : [];
    return `<li class="tnode">
      <div class="tname"><b>${esc(t.term)}</b>${t.level ? `<span class="tlevel" data-gloss="term-level" tabindex="0">${esc(t.level)}</span>` : ""}</div>
      ${t.definition ? `<p class="quote${t.definition_verbatim === false ? " para" : ""}">${esc(t.definition)}</p>` : ""}
      <div class="tloc">${[t.definition_verbatim === false ? "Paraphrased" : "", t.location || ""].filter(Boolean).map(esc).join(". ")}</div>
      ${t.constructs.length ? `<div class="cchips">${t.constructs.map((m) => `<a class="cchip" href="#/c/${m.construct}" title="${esc(LABELS.relationship[m.relationship] || m.relationship)}">${matchGlyph(m.relationship)}${esc(constructName(m.construct))}${m.status === "contested" ? `<span class="tag disagree">Benchmarks disagree</span>` : ""}</a>`).join("")}</div>`
        : `<div class="tloc">Not matched to a construct</div>`}
      ${sub.length ? `<ul class="tree">${sub.map((c) => node(c, depth + 1)).join("")}</ul>` : ""}
    </li>`;
  };
  return `<ul class="tree">${top.map((t) => (t.group
    ? `<li class="tnode tgroup"><div class="tg-label">${esc(t.group)}</div><ul class="tree">${groups.get(t.group).map((c) => node(c, 1)).join("")}</ul></li>`
    : node(t, 0))).join("")}</ul>`;
}

function judged(e, terms) {
  if (!terms.length) {
    return `<p class="muted">No scoring terms were extracted for this entry. That usually means the source doesn't name what it scores beyond a single accuracy number, or the full text wasn't available.</p>`;
  }
  const cons = new Set(terms.flatMap((t) => t.constructs.map((m) => m.construct)));
  const doms = new Map();
  cons.forEach((c) => {
    const d = domainOf(c);
    if (!d) return;
    const x = doms.get(d.id) || { d, n: 0 };
    x.n += 1;
    doms.set(d.id, x);
  });
  const domList = [...doms.values()].sort((a, b) => b.n - a.n);
  return `<p class="lede" style="font-size:16px">${terms.length} ${terms.length === 1 ? "term" : "terms"}${info("term")}, matched to ${cons.size} ${cons.size === 1 ? "construct" : "constructs"}${info("construct")} in ${domList.length} ${domList.length === 1 ? "domain" : "domains"}${info("domain")}. Definitions are quoted from the source unless marked paraphrased.</p>
    <div class="judged-sum">${domList.map(({ d, n }) => `<a class="chip" href="#/constructs?d=${d.id}">${esc(d.name)} <span class="num muted">${n}</span></a>`).join("")}</div>
    ${matchLegend()}
    ${tree(terms)}`;
}

export async function mount({ app, arg }) {
  const e = D.byId.get(arg);
  if (!e) {
    setTitle("Not found");
    app.innerHTML = `<div class="page-head"><h1>No entry called "${esc(arg)}"</h1><p class="lede">It may have been merged or renamed. <a href="#/catalog">Search the catalog</a>.</p></div>`;
    return;
  }
  setTitle(e.name);
  let back = "#/catalog";
  try { back = sessionStorage.getItem("lastCatalog") || back; } catch (err) { /* default */ }
  const s = e.signals || {};
  const lic = e.license ? ` <span class="muted">License: ${esc(e.license)}</span>` : "";

  app.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${esc(back)}"><i class="ph ph-arrow-left"></i> Catalog</a></nav>
    <div class="page-head">
      <h1>${esc(e.name)}</h1>
      <div class="entry-head"><span class="tag">${lab("kind", e.kind)}</span>${originTag(e)}${e.featured ? `<span class="tag featured"><i class="ph ph-star"></i>Featured</span>` : ""}<span class="year">${e.year}</span></div>
      <p class="lede">${esc(e.summary)}</p>
      <div class="actions">${links(e).map(([t, u, i]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener"><i class="ph ${i}"></i>${esc(t)}<i class="ph ph-arrow-up-right"></i></a>`).join("")}
        ${compareBtn(e.id)}</div>
    </div>

    <div class="factgrid">
      <section class="facts"><h2>Questions</h2><dl>
        ${fact("Languages", esc(e.languages.map(languageName).join(", ")), "language")}
        ${fact("Where they come from", whereFrom(e), "country")}
        ${fact("Origin", originTag(e), "origin")}
        ${fact("Income group", esc(e.income.map((g) => lab("income", g)).join(", ")), "income-group")}
        ${fact("Region", esc(e.regions.map((r) => lab("regions", r)).join(", ")), "region")}
        ${fact("How they were made", list("provenance", e.provenance), "provenance")}
        ${fact("Made for this setting?", esc(lab("localization", e.localization)), "localization")}
      </dl></section>
      <section class="facts"><h2>What it tests</h2><dl>
        ${fact("How it's scored", list("methods", e.methods), "methods")}
        ${fact("Who it's for", list("users", e.users), "users")}
        ${fact("Health areas", list("health_areas", e.health_areas), "health-area")}
        ${fact("Main focus", esc(lab("section", e.section)), "main-focus")}
        ${fact("Size", esc(e.size))}
        ${fact("Format", list("modality", e.modality))}
      </dl></section>
      <section class="facts"><h2>Source and access</h2><dl>
        ${fact("Data access", esc(lab("open_data", e.open_data)) + lic, "data-access")}
        ${fact("Who built it", list("builders", e.builders), "builders")}
        ${fact("Lead institutions in", esc(names(e.lead_countries)))}
        ${fact("Raters based in", esc(names(e.rater_countries)))}
        ${fact("Published as", esc(lab("venue", e.venue)), "venue")}
        ${fact("Citations, downloads and stars", signalText(e) ? `${esc(signalText(e))}${s.updated ? `<span class="muted">As of ${esc(s.updated)}</span>` : ""}` : "", "signals")}
      </dl></section>
    </div>
    ${familyBlock(e)}

    ${e.subsets.length ? `<h2>Subsets</h2><div class="table-wrap"><table><thead><tr><th>Subset</th><th>Languages</th><th>Countries</th><th>Made for this setting?</th></tr></thead><tbody>
      ${e.subsets.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc((x.languages || []).map(languageName).join(", "))}</td><td>${esc(names(x.countries || []))}</td><td>${esc(x.localization ? lab("localization", x.localization) : "")}</td></tr>`).join("")}</tbody></table></div>` : ""}

    <h2 id="judged">What it judges</h2>
    <div id="judged-body"><div class="skeleton"><div style="width:60%"></div><div style="width:80%"></div><div style="width:50%"></div></div></div>

    <h2>How sure we are${info("confidence")}</h2>
    <div class="note" id="extraction">
      <p style="margin:0 0 6px"><b>${esc(lab("confidence", e.confidence))} confidence.</b> ${e.read_full_text ? "An agent read the full text." : "The full text wasn't read; facts come from the abstract or dataset page."}</p>
      <p style="margin:0" id="notes"></p>
    </div>
    <p class="muted" style="margin-top:12px;font-size:14px">Source file: <a class="mono" href="${REPO}/blob/main/entries/${e.id}.yaml">entries/${e.id}.yaml</a>.
      <a href="${REPO}/issues/new?title=${encodeURIComponent(`Correction: ${e.name}`)}&body=${encodeURIComponent(`Entry: entries/${e.id}.yaml\n\nWhat's wrong:\n`)}">Report a mistake</a></p>`;

  try {
    const d = await loadDetails();
    if (!$("#judged-body")) return; // navigated away
    const det = d[e.id] || { terms: [], notes: "" };
    $("#judged-body").innerHTML = judged(e, det.terms);
    if (det.notes) $("#notes").innerHTML = `<span class="muted">Notes from the extraction:</span> ${esc(det.notes)}`;
  } catch (err) {
    $("#judged-body").innerHTML = `<p class="muted">The scoring terms couldn't load. Reload the page to try again.</p>`;
  }
}
