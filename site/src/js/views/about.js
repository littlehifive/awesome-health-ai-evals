// About: the same story as the README, from data/about.yaml, with the pipeline drawn as a strip.

import { D } from "../data.js";
import { bindToc, docPage } from "../ui.js";
import { REPO, esc, fmt, md, setTitle } from "../util.js";

export function mount({ app }) {
  setTitle("About");
  const A = D.meta.about, C = D.meta.counts, R = D.meta.related;
  const featured = D.entries.filter((e) => e.featured).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  const reading = (items) => `<ul class="reading">${items.map((it) => `<li><a href="${esc(it.url)}">${esc(it.title)}</a>${it.year ? ` (${it.year})` : ""}${it.by ? `. ${esc(it.by)}` : ""}.</li>`).join("")}</ul>`;

  const sections = [
    { id: "what", title: "What this is", body: `
      <ul class="plain">${A.what.map((w) => `<li>${md(w)}</li>`).join("")}</ul>
      <p style="margin-top:14px">${md(A.why)}</p><p>${md(A.audience)}</p><p class="callout">${md(A.caveat)}</p>` },
    { id: "built", title: "How it was built", body: `
      <p>${md(A.built.intro)}</p>
      <div class="pipeline">${A.built.steps.map((s, i) => `<div class="step"><div class="k">${i + 1}. ${esc(s.title)}</div><strong class="num">${esc(s.figure)}</strong><span>${esc(s.figure_label)}</span></div>`).join("")}</div>
      <ol class="plain">${A.built.steps.map((s) => `<li><b>${esc(s.title)}.</b> ${md(s.text)}</li>`).join("")}</ol>
      <p style="margin-top:14px">${md(A.built.outro)}</p>` },
    { id: "start", title: "Start here", body: `
      <p>Widely used benchmarks and ones built in low- and middle-income countries. Everything else is in the <a href="#/catalog">catalog</a>.</p>
      <ul class="start">${featured.map((e) => `<li><a href="#/e/${e.id}">${esc(e.name)}</a><span class="yr num">${e.year}</span>. ${esc(e.summary)}</li>`).join("")}</ul>` },
    { id: "use", title: "Use it", body: `
      <ul class="plain">${A.use.map((u) => `<li><b>${esc(u.title)}.</b> ${md(u.text)}${u.code ? `<div class="code"><span id="code-${esc(u.title).replace(/\W+/g, "-")}">${u.code.map(esc).join("\n")}</span><button class="icon-btn copy" type="button" data-copy="#code-${esc(u.title).replace(/\W+/g, "-")}" aria-label="Copy"><i class="ph ph-copy" aria-hidden="true"></i><span class="vh">Copy</span></button></div>` : ""}</li>`).join("")}</ul>` },
    { id: "layout", title: "Repository layout", body: `
      <table class="tbl"><thead><tr><th>Path</th><th>What's there</th></tr></thead><tbody>${A.layout.map((r) => `<tr><td><a href="${REPO}/tree/main/${esc(r.path)}"><code>${esc(r.path)}</code></a></td><td>${md(r.text)}</td></tr>`).join("")}</tbody></table>` },
    { id: "notfor", title: "How not to use it", body: `<ul class="plain">${A.not_for.map((x) => `<li><b>${esc(x.title)}</b> ${md(x.text)}</li>`).join("")}</ul>` },
    { id: "gaps", title: "Known gaps", body: `<ul class="plain">${A.gaps.map((g) => `<li>${md(g)}</li>`).join("")}</ul>` },
    { id: "next", title: "What's next", body: `<ul class="plain">${A.next.map((g) => `<li>${md(g)}</li>`).join("")}</ul>` },
    { id: "reading", title: "Further reading", body: `
      <p>Guidance documents and surveys that turned up in the search. They don't define how to judge a model's answers, so they aren't entries. The most cited of each kind are below; the full lists (${fmt(R.counts.guidance || 0)} and ${fmt(R.counts.surveys || 0)}) are in <a href="${REPO}/blob/main/data/related.yaml"><code>data/related.yaml</code></a>.</p>
      <h3>Guidance and reporting standards</h3>${reading(R.guidance)}<h3>Surveys and reviews</h3>${reading(R.surveys)}` },
    { id: "credit", title: "Contributing, license and credit", body: `
      <p>${md(A.contributing)}</p><p>${md(A.license)}</p><p>${md(A.credit)} The whole catalog is <a href="data/catalog.json" download>one JSON file</a>.</p>` },
  ];

  app.innerHTML = `<div class="wrap">${docPage({
    crumbs: null,
    titleBlock: `<h1>About</h1><p class="lede">${esc(A.tagline)}</p><p class="meta"><span class="num">${fmt(C.entries)} entries</span><span>built ${esc(D.meta.built)}</span><a href="${REPO}">Source on GitHub</a></p>`,
    details: "",
    sections,
  })}</div>`;
  bindToc(app);
}
