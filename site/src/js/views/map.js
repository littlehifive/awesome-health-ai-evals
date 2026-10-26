// Map: where entries' questions come from, with a ranked list so small countries are easy to reach.

import { D, countryName, realCountries, tally } from "../data.js";
import { LABELS, info } from "../labels.js";
import { drawMap } from "../ui.js";
import { $, catalogHref, esc, fmt, setTitle } from "../util.js";

const TOP = 15;
const href = (iso) => catalogHref({ countries: iso }, { from: "map" });

function rankRows(list, max) {
  return list.map(([c, n]) => {
    const inc = D.countries[c] ? D.countries[c].income : "";
    return `<a href="${href(c)}"><span class="rn">${esc(countryName(c))}<span class="ri">${esc(LABELS.income[inc] || "")}</span></span>
      <span class="rc">${fmt(n)}</span><span class="rb" style="width:${Math.max(2, (100 * n) / max)}%"></span></a>`;
  }).join("");
}

export function mount({ app }) {
  setTitle("Map");
  const E = D.entries;
  const counts = tally(E, (e) => e.countries);
  const ranked = [...tally(E, realCountries).entries()].sort((a, b) => b[1] - a[1]);
  const max = ranked.length ? ranked[0][1] : 1;
  const global = E.filter((e) => e.origin === "global").length;
  const unstated = E.filter((e) => e.origin === "unstated").length;

  app.innerHTML = `
    <div class="page-head"><h1>Where the questions come from</h1>
      <p class="lede">Each entry is counted in every country its questions, cases or conversations come from${info("country")}. Click a country to see its entries.</p></div>
    <div class="map-layout">
      <div>
        <div class="mapbox" id="map"><div class="skeleton"><div style="height:320px"></div></div></div>
        <p class="lede" style="margin-top:28px;font-size:16px">Not every entry has a country.
          <a href="${catalogHref({ origin: "global" }, { from: "map" })}">${fmt(global)} entries</a> were written to be general, with no specific country,
          and <a href="${catalogHref({ origin: "unstated" }, { from: "map" })}">${fmt(unstated)}</a> don't say where their questions come from.</p>
        <p class="muted" style="font-size:14px">Country names and income groups follow the World Bank classification${info("lmic")}. The <a href="#/coverage?cols=income">coverage table</a> breaks entries down by income group and region.</p>
      </div>
      <div>
        <div class="rank-head"><h2>${ranked.length} countries</h2><span class="muted" style="font-size:13px">Entries</span></div>
        <div class="rank" id="rank">${rankRows(ranked.slice(0, TOP), max)}</div>
        ${ranked.length > TOP ? `<button type="button" class="more-opts" id="rank-more" style="margin-top:6px">Show all ${ranked.length}</button>` : ""}
      </div>
    </div>`;

  drawMap($("#map"), { counts, href });
  const more = $("#rank-more");
  if (more) more.addEventListener("click", () => { $("#rank").innerHTML = rankRows(ranked, max); more.remove(); });
}
