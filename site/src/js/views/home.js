// Home: the headline, the map, and four numbers. Everything else lives in a tab.

import { D, realCountries, realLanguages, tally } from "../data.js";
import { chart, drawMap, legendHtml } from "../ui.js";
import { $, catalogHref, fmt, setTitle } from "../util.js";

export async function mount({ app }) {
  setTitle();
  const E = D.entries;
  const counts = tally(E, (e) => e.countries);
  const nCountries = new Set(E.flatMap(realCountries)).size;
  const nLangs = new Set(E.flatMap(realLanguages)).size;
  const byOrigin = tally(E, (e) => [e.origin]);
  const total = E.length;
  const n = (o) => fmt(byOrigin.get(o) || 0);

  app.innerHTML = `
  <section class="hero">
    <div class="wrap">
      <div class="hero-text">
        <h1>Benchmarks and evaluation frameworks for health chatbots</h1>
        <p class="sub">${fmt(total)} entries, sorted by where their questions come from and what they judge.</p>
        <div class="actions"><a class="btn primary" href="#/catalog">Browse the catalog</a><a class="btn" href="#/about">How it was built</a></div>
      </div>
      ${chart({
        title: "Where the questions come from",
        body: `<div class="mapbox" id="home-map"><div class="skeleton"><div style="height:300px"></div></div></div>`,
        legend: legendHtml(),
        note: `Click a country for its entries. <a href="${catalogHref({ origin: "unstated" }, { from: "map" })}">${n("unstated")} entries</a> don't say where their questions come from, and <a href="${catalogHref({ origin: "global" }, { from: "map" })}">${n("global")}</a> aren't tied to a country.`,
      })}
    </div>
  </section>

  <section class="numbers" aria-label="Catalog in numbers">
    <div class="wrap">
      <a class="stat" href="#/catalog"><strong class="num">${fmt(total)}</strong><span>entries</span></a>
      <a class="stat" href="${catalogHref({ origin: "lmic" }, { from: "home" })}"><strong class="num">${n("lmic")}</strong><span>with questions from low- and middle-income countries</span></a>
      <a class="stat" href="${catalogHref({}, { open: "countries" })}"><strong class="num">${nCountries}</strong><span>countries</span></a>
      <a class="stat" href="${catalogHref({}, { open: "languages" })}"><strong class="num">${nLangs}</strong><span>languages</span></a>
    </div>
  </section>`;

  drawMap($("#home-map"), { counts, href: (iso) => catalogHref({ countries: iso }, { from: "map" }) });
}
