// awesome health ai evals: a single-page app over data/entries.json.
// Routes (hash): #/ home, #/catalog?filters, #/e/<id>, #/map, #/coverage, #/constructs, #/c/<id>,
// #/compare?ids=a,b,c, #/glossary[/<id>], #/about. Filters live in the URL so views can link to them.

import { loadEntries } from "./data.js";
import { clearPops, hidePop, initCompare, initCopy, initPop, renderTray } from "./ui.js";
import { $, $$, esc } from "./util.js";

const app = $("#app");
const VIEWS = {
  home: () => import("./views/home.js"),
  catalog: () => import("./views/catalog.js"),
  entry: () => import("./views/entry.js"),
  map: () => import("./views/map.js"),
  coverage: () => import("./views/coverage.js"),
  constructs: () => import("./views/constructs.js"),
  construct: () => import("./views/construct.js"),
  compare: () => import("./views/compare.js"),
  glossary: () => import("./views/glossary.js"),
  about: () => import("./views/about.js"),
};
// view -> nav tab it belongs to
const NAV = { catalog: "catalog", entry: "catalog", map: "map", coverage: "coverage", constructs: "constructs",
  construct: "constructs", compare: "compare", glossary: "glossary", about: "about" };

// Old links: #/?country=… was the catalog, #/heatmap is now #/coverage, and the origin
// filter used the build's grounding labels.
const OLD_ORIGIN = { "native LMIC": ["lmic"], adapted: ["adapted"], "translated only": ["translated"],
  "high-income only": ["high"], "global or unknown": ["global", "unstated"] };
function legacy(path, q) {
  if (path === "heatmap") return `#/coverage${q.toString() ? `?${q}` : ""}`;
  if (!path && [...q.keys()].length) {
    const n = new URLSearchParams();
    q.forEach((v, k) => (k === "grounding" ? (OLD_ORIGIN[v] || []).forEach((o) => n.append("origin", o)) : n.append(k, v)));
    return `#/catalog?${n}`;
  }
  return null;
}

function parse() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = h.split("?");
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(qs) };
}

let current = { name: null, mod: null };

async function route() {
  const { parts, query } = parse();
  const [first, arg] = parts;
  const to = legacy(first, query);
  if (to) { location.replace(to); return; }
  const name = !first ? "home" : first === "e" ? "entry" : first === "c" ? "construct" : first in VIEWS ? first : "home";
  const ctx = { app, parts, query, arg };
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === NAV[name]));
  $("#nav").classList.remove("open");
  $("#menu-btn").setAttribute("aria-expanded", "false");
  hidePop();

  // Same view, new filters: let the view update in place (keeps focus and scroll).
  if (current.name === name && current.mod && current.mod.update && current.arg === arg) {
    current.mod.update(ctx);
    return;
  }
  try {
    const mod = await VIEWS[name]();
    if (current.mod && current.mod.unmount) current.mod.unmount();
    clearPops();
    current = { name, mod, arg };
    app.innerHTML = "";
    window.scrollTo(0, 0);
    await mod.mount(ctx);
    renderTray();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="page-head"><h1>Something went wrong</h1><p class="lede">This page couldn't load: ${esc(err.message)}. Try reloading, or <a href="#/">go home</a>.</p></div>`;
  }
}

function initChrome() {
  const toggle = $("#theme-toggle");
  const isDark = () => (document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches);
  const icon = () => (toggle.innerHTML = `<i class="ph ph-${isDark() ? "sun" : "moon"}"></i>`);
  icon();
  toggle.addEventListener("click", () => {
    document.documentElement.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (e) { /* not saved */ }
    icon();
  });
  const menu = $("#menu-btn");
  menu.addEventListener("click", () => {
    const open = $("#nav").classList.toggle("open");
    menu.setAttribute("aria-expanded", open);
  });
  $("#foot-brand").innerHTML = $(".site-header .brand").innerHTML;
}

initChrome();
initPop();
initCompare();
initCopy();
loadEntries().then((D) => {
  $("#foot-built").textContent = `${D.entries.length.toLocaleString("en-US")} entries, updated ${new Date(`${D.meta.built}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  addEventListener("hashchange", route);
  route();
}).catch((err) => {
  console.error(err);
  app.innerHTML = `<div class="page-head"><h1>The catalog didn't load</h1><p class="lede">Check your connection and reload the page.</p></div>`;
});
