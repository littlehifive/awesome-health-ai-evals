// Home: the headline and the map. Everything else lives in a tab.

import { D, tally } from "../data.js";
import { chart, drawMap, legendHtml } from "../ui.js";
import { $, catalogHref, fmt, setTitle } from "../util.js";

export async function mount({ app }) {
  setTitle();
  const C = D.meta.counts;
  const counts = tally(D.entries, (e) => e.countries);

  app.innerHTML = `
  <section class="hero">
    <div class="wrap">
      <div class="hero-text">
        <h1>Benchmarks and frameworks for evaluating health AI</h1>
        <p class="sub">${fmt(C.benchmarks)} benchmarks and ${fmt(C.frameworks)} frameworks for evaluating health AI across ${fmt(C.countries)} countries and ${fmt(C.languages)} languages.</p>
        <div class="actions"><a class="btn primary" href="#/catalog">Browse the catalog</a><a class="btn" href="#/about">How it was built</a></div>
      </div>
      ${chart({
        title: "A global map of benchmarks and frameworks",
        body: `<div class="mapbox" id="home-map"><div class="skeleton"><div style="height:300px"></div></div></div>`,
        legend: legendHtml(),
        note: "Click a country to see its entries.",
      })}
    </div>
  </section>`;

  drawMap($("#home-map"), { counts, href: (iso) => catalogHref({ countries: iso }, { from: "map" }) });
}
