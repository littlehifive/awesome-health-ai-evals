// The entry card used by Home's featured row and the catalog.

import { D, countryName, realCountries, realLanguages } from "./data.js";
import { kindTag, lab, originTag } from "./labels.js";
import { compareBtn } from "./ui.js";
import { esc, fmt, listText } from "./util.js";

export function whereText(e) {
  if (e.origin === "global") return "No specific country";
  if (e.origin === "unstated") return "Origin not stated";
  return listText(realCountries(e).map(countryName), 3, "countries") || "Origin not stated";
}

export function signalText(e) {
  const s = e.signals || {};
  const bits = [];
  if (s.citations) bits.push(`${fmt(s.citations)} ${s.citations === 1 ? "citation" : "citations"}`);
  if (s.hf_downloads) bits.push(`${fmt(s.hf_downloads)} downloads`);
  if (s.github_stars) bits.push(`${fmt(s.github_stars)} stars`);
  return bits.slice(0, 2).join(", ");
}

// children: entries adapted from this one that also match the current filters.
export function card(e, { children = [] } = {}) {
  const parent = e.adapted_from.map((id) => D.byId.get(id)).filter(Boolean);
  return `<article class="card">
    <div class="card-top"><a class="card-title" href="#/e/${e.id}">${esc(e.name)}</a><span class="card-year">${e.year}</span></div>
    <div class="card-tags">${kindTag(e)}${originTag(e)}${e.featured ? `<span class="tag featured"><i class="ph ph-star"></i>Featured</span>` : ""}</div>
    <p class="card-sum">${esc(e.summary)}</p>
    <div class="card-meta">
      <span><i class="ph ph-translate" aria-label="Languages"></i><em>${esc(listText(realLanguages(e), 3, "languages") || "Language not stated")}</em></span>
      <span><i class="ph ph-map-pin" aria-label="Where the questions come from"></i><em>${esc(whereText(e))}</em></span>
      ${e.methods.length ? `<span><i class="ph ph-list-checks" aria-label="How it's scored"></i><em>${esc(e.methods.map((m) => lab("methods", m)).join(", "))}</em></span>` : ""}
    </div>
    ${parent.length ? `<div class="adapted-from">Adapted from ${parent.map((p) => `<a href="#/e/${p.id}">${esc(p.name)}</a>`).join(", ")}</div>` : ""}
    ${children.length ? `<details class="family"><summary><i class="ph ph-git-fork"></i>${children.length} ${children.length === 1 ? "adaptation" : "adaptations"} here</summary>
      <ul>${children.map((c) => `<li>${originTag(c)}<a href="#/e/${c.id}">${esc(c.name)}</a></li>`).join("")}</ul></details>` : ""}
    <div class="card-foot"><span class="sig">${signalText(e)}</span>${compareBtn(e.id)}</div>
  </article>`;
}
