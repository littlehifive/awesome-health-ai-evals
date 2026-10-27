// Glossary: the technical terms of health AI evaluation, A to Z, with search.

import { D } from "../data.js";
import { pageHead } from "../ui.js";
import { $, $$, esc, setTitle } from "../util.js";

function focusTerm(id) {
  const el = id && $(`#g-${CSS.escape(id)}`);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.add("hl");
  setTimeout(() => el.classList.remove("hl"), 2400);
}

export function mount({ app, arg }) {
  const G = D.meta.glossary;
  const byId = new Map(G.terms.map((t) => [t.id, t]));
  setTitle(arg && byId.has(arg) ? byId.get(arg).term : "", "Glossary");
  const sorted = [...G.terms].sort((a, b) => a.term.localeCompare(b.term));
  const firstOf = new Map();
  sorted.forEach((t) => { const l = t.term.charAt(0).toUpperCase(); if (!firstOf.has(l)) firstOf.set(l, t.id); });

  const termHtml = (t) => `<div class="gterm" id="g-${t.id}" data-text="${esc(`${t.term} ${t.short} ${t.long || ""}`.toLowerCase())}">
    <dt>${esc(t.term)}</dt>
    <dd><p class="short">${esc(t.short)}</p>${t.long ? `<p class="long">${esc(t.long)}</p>` : ""}
      <div class="gmeta">${t.catalog ? `<span><a href="${esc(t.catalog.href)}">${esc(t.catalog.label)}</a></span>` : ""}
        ${t.source ? `<span>Source: <a href="${esc(t.source.url)}">${esc(t.source.title)}</a></span>` : ""}
        ${(t.see_also || []).filter((s) => byId.has(s)).length ? `<span>See also: ${t.see_also.filter((s) => byId.has(s)).map((s) => `<a href="#/glossary/${s}">${esc(byId.get(s).term)}</a>`).join(", ")}</span>` : ""}</div></dd></div>`;

  app.innerHTML = `<div class="wrap">
    ${pageHead({ title: "Glossary", lede: "Key terms used in evaluating health AI." })}
    <div class="gloss-head">
      <label class="search"><span class="vh">Find a term</span><span class="field"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" id="gq" placeholder="Find a term" autocomplete="off"></span></label>
      <nav class="az" aria-label="A to Z">${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => (firstOf.has(l) ? `<a href="#/glossary/${firstOf.get(l)}">${l}</a>` : `<span>${l}</span>`)).join("")}</nav>
    </div>
    <dl class="gloss">${sorted.map(termHtml).join("")}</dl>
    <p class="muted small" id="gnone" hidden>No term matches.</p></div>`;

  $("#gq").addEventListener("input", (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    let shown = 0;
    $$(".gterm", app).forEach((el) => { el.hidden = q && !el.dataset.text.includes(q); if (!el.hidden) shown += 1; });
    $("#gnone").hidden = shown > 0;
  });
  focusTerm(arg);
}

export function update({ arg }) { focusTerm(arg); }
