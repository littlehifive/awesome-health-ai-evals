// The entry card and list row used by the catalog. Both carry the facts a reader compares on
// before opening an entry: what it is, where its questions come from, who it's for, how it's
// scored, how big it is, whether the data is available, and which domains it judges.

import { D, countryName, domainOf, realCountries, realLanguages } from "./data.js";
import { kindTag, lab, originTag } from "./labels.js";
import { compareBtn } from "./ui.js";
import { esc, join, someOf } from "./util.js";

export function whereText(e, max = 3) {
  if (e.origin === "global") return "No specific country";
  if (e.origin === "unstated") return "Not stated";
  const names = realCountries(e).map(countryName);
  return names.length ? someOf(names, max) : "Not stated";
}
export const languagesText = (e, max = 3) => someOf(realLanguages(e), max) || "Not stated";
export const usersText = (e) => join(e.users.filter((u) => u !== "unspecified").map((u) => lab("users", u))) || "Not stated";
export const methodsText = (e) => join(e.methods.map((m) => lab("methods", m))) || "Not stated";
export function accessText(e) {
  const a = lab("open_data", e.open_data);
  return e.open_data === "open" && e.license ? `${a}, ${e.license}` : a;
}
// The domains an entry's scoring terms were matched to, most-covered first.
export function domainsText(e, max = 3) {
  if (!e.constructs.length) return "";
  const counts = new Map();
  e.constructs.forEach((c) => { const d = domainOf(c); if (d) counts.set(d.name, (counts.get(d.name) || 0) + 1); });
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return someOf(names, max);
}

// children: entries adapted from this one that also match the current filters.
export function card(e, { children = [] } = {}) {
  const parent = e.adapted_from.map((id) => D.byId.get(id)).filter(Boolean);
  const judges = domainsText(e);
  return `<article class="card">
    <div class="head"><h3><a href="#/e/${e.id}">${esc(e.name)}</a></h3><span class="year num">${e.year}</span></div>
    <div class="tags">${kindTag(e)}${originTag(e)}${e.featured ? `<span class="tag featured">Featured</span>` : ""}</div>
    <p class="sum">${esc(e.summary)}</p>
    <dl class="cf">
      <div><dt>Questions from</dt><dd title="${esc(whereText(e, 20))}">${esc(whereText(e))}</dd></div>
      <div><dt>Languages</dt><dd title="${esc(languagesText(e, 20))}">${esc(languagesText(e))}</dd></div>
      <div><dt>For</dt><dd title="${esc(usersText(e))}">${esc(usersText(e))}</dd></div>
      <div><dt>Scored by</dt><dd title="${esc(methodsText(e))}">${esc(methodsText(e))}</dd></div>
      <div><dt>Size</dt><dd title="${esc(e.size || "")}">${e.size ? esc(e.size) : `<span class="none">Not stated</span>`}</dd></div>
      <div><dt>Data access</dt><dd>${esc(accessText(e))}</dd></div>
      <div class="full"><dt>Judges</dt><dd class="wrap-ok">${judges ? `<a href="#/e/${e.id}#judged">${esc(judges)}</a>` : `<span class="none">No scoring terms extracted</span>`}</dd></div>
    </dl>
    ${parent.length ? `<div class="fam-line">Adapted from ${parent.map((p) => `<a href="#/e/${p.id}">${esc(p.name)}</a>`).join(", ")}</div>` : ""}
    ${children.length ? `<div class="fam-line">${children.length} ${children.length === 1 ? "adaptation" : "adaptations"} grouped here: ${children.slice(0, 4).map((c) => `<a href="#/e/${c.id}">${esc(c.name)}</a>`).join(", ")}${children.length > 4 ? ` and <a href="#/e/${e.id}#related">${children.length - 4} more</a>` : ""}</div>` : ""}
    <div class="cfoot"><a class="btn small" href="#/e/${e.id}">Details</a>${compareBtn(e.id)}</div>
  </article>`;
}

export function listHead() {
  return `<thead><tr><th>Name</th><th>Year</th><th>Type</th><th>Questions from</th><th>Languages</th><th>For</th><th>Scored by</th><th>Data access</th></tr></thead>`;
}

export function listRow(e) {
  return `<tr>
    <td class="name"><a href="#/e/${e.id}">${esc(e.name)}</a></td>
    <td class="yr">${e.year}</td>
    <td class="nw">${esc(lab("kind", e.kind))}</td>
    <td>${originTag(e)} ${esc(whereText(e, 2))}</td>
    <td>${esc(languagesText(e, 2))}</td>
    <td>${esc(usersText(e))}</td>
    <td>${esc(methodsText(e))}</td>
    <td class="nw">${esc(lab("open_data", e.open_data))}</td>
  </tr>`;
}
