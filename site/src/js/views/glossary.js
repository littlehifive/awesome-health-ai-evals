// Glossary: every label and technical term on the site. Each (i) button links here.

import { D } from "../data.js";
import { $, $$, esc, setTitle } from "../util.js";

function focusTerm(id) {
  const el = id && $(`#g-${CSS.escape(id)}`);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.remove("hl");
  void el.offsetWidth;
  el.classList.add("hl");
}

export function mount({ app, arg }) {
  setTitle(arg ? (D.meta.glossary.terms.find((t) => t.id === arg) || {}).term : "", "Glossary");
  const G = D.meta.glossary;
  const byId = new Map(G.terms.map((t) => [t.id, t]));
  app.innerHTML = `
    <div class="page-head"><h1>Glossary</h1>
      <p class="lede">What the labels and technical terms on this site mean. Where a label simplifies something, the longer note says how.</p></div>
    <div class="search-wrap" style="max-width:420px;margin-top:12px"><i class="ph ph-magnifying-glass" aria-hidden="true"></i>
      <input class="search" id="gq" type="search" placeholder="Find a term" aria-label="Find a term"></div>
    <nav class="jump" aria-label="Sections">${G.groups.map((g) => `<a class="chip" href="#g-group-${g.id}" data-jump="${g.id}">${esc(g.name)}</a>`).join("")}</nav>
    ${G.groups.map((g) => `<section class="gloss-group" id="g-group-${g.id}"><h2>${esc(g.name)}</h2><dl class="gloss">
      ${G.terms.filter((t) => t.group === g.id).map((t) => `<div class="gterm" id="g-${t.id}" data-text="${esc(`${t.term} ${t.short} ${t.long || ""}`.toLowerCase())}">
        <dt>${esc(t.term)}</dt><dd><p>${esc(t.short)}</p>${t.long ? `<p>${esc(t.long)}</p>` : ""}
        ${(t.see_also || []).length ? `<div class="see">See also: ${t.see_also.filter((s) => byId.has(s)).map((s) => `<a href="#/glossary/${s}">${esc(byId.get(s).term)}</a>`).join(", ")}</div>` : ""}</dd></div>`).join("")}
      </dl></section>`).join("")}
    <p class="muted" style="margin-top:28px;font-size:14px">The constructs have their own page: <a href="#/constructs">all ${D.meta.counts.constructs} constructs with definitions</a>.</p>`;

  $("#gq").addEventListener("input", (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    $$(".gterm", app).forEach((el) => (el.hidden = q && !el.dataset.text.includes(q)));
    $$(".gloss-group", app).forEach((s) => (s.hidden = !$$(".gterm", s).some((el) => !el.hidden)));
  });
  app.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    $(`#g-group-${a.dataset.jump}`).scrollIntoView();
  }));
  focusTerm(arg);
}
