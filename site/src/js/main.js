// awesome health ai evals: a single-page app over data/entries.json.
// Routes (hash): #/ home, #/catalog?filters, #/e/<id>, #/constructs[?view=matrix], #/c/<id>,
// #/compare?ids=a,b,c, #/glossary[/<id>], #/about. Filters live in the URL so views can link to them.
// A second hash names a section: #/e/healthbench#judged scrolls to it after the page mounts.

import { loadEntries } from "./data.js";
import { clearPops, hidePop, initCompare, initCopy, initPop, renderTray } from "./ui.js";
import { $, $$, esc } from "./util.js";

const app = $("#app");
const VIEWS = {
  home: () => import("./views/home.js"),
  catalog: () => import("./views/catalog.js"),
  entry: () => import("./views/entry.js"),
  constructs: () => import("./views/constructs.js"),
  construct: () => import("./views/construct.js"),
  compare: () => import("./views/compare.js"),
  glossary: () => import("./views/glossary.js"),
  about: () => import("./views/about.js"),
};
// view -> nav tab it belongs to
const NAV = { catalog: "catalog", entry: "catalog", constructs: "constructs",
  construct: "constructs", compare: "compare", glossary: "glossary", about: "about" };

// Old links: #/?country=… was the catalog, #/heatmap and #/coverage are now the constructs
// matrix, #/map was its own page (the map lives on the home page now), and the origin filter
// used the build's grounding labels.
const OLD_ORIGIN = { "native LMIC": ["lmic"], adapted: ["adapted"], "translated only": ["translated"],
  "high-income only": ["high"], "global or unknown": ["global", "unstated"] };
function legacy(path, q) {
  if (path === "heatmap" || path === "coverage") { q.set("view", "matrix"); return `#/constructs?${q}`; }
  if (path === "map") return "#/";
  if (!path && [...q.keys()].length) {
    const n = new URLSearchParams();
    q.forEach((v, k) => (k === "grounding" ? (OLD_ORIGIN[v] || []).forEach((o) => n.append("origin", o)) : n.append(k, v)));
    return `#/catalog?${n}`;
  }
  return null;
}

function parse() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [h, anchor = ""] = raw.split("#");
  const [path, qs = ""] = h.split("?");
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(qs), anchor };
}

function scrollToAnchor(anchor) {
  if (!anchor) return;
  const el = $(`#${CSS.escape(anchor)}`, app);
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

let current = { name: null, mod: null, arg: null };

// Vercel Web Analytics only counts a page view when the pathname changes, and this site routes by
// hash, so each view reports itself when it mounts (not on in-place filter changes). The path is
// the hash route without its query, so filters and search text stay out of the analytics; the
// route groups entry, construct and glossary pages the way Vercel's dashboard expects.
const PATHS = { home: "/", catalog: "/catalog", entry: "/e", constructs: "/constructs", construct: "/c",
  compare: "/compare", glossary: "/glossary", about: "/about" };
function trackView(name, arg) {
  if (typeof window.va !== "function") return;
  const base = PATHS[name] || "/";
  const withId = Boolean(arg) && (name === "entry" || name === "construct" || name === "glossary");
  window.va("pageview", { path: withId ? `${base}/${arg}` : base, route: withId ? `${base}/[id]` : base });
}

async function route() {
  const { parts, query, anchor } = parse();
  const [first, arg] = parts;
  const to = legacy(first, query);
  if (to) { location.replace(to); return; }
  const name = !first ? "home" : first === "e" ? "entry" : first === "c" ? "construct" : first in VIEWS ? first : "home";
  const ctx = { app, parts, query, arg, anchor };
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === NAV[name]));
  $("#nav").classList.remove("open");
  $("#menu-btn").setAttribute("aria-expanded", "false");
  hidePop();

  // Same view, new filters or anchor: let the view update in place (keeps focus and scroll).
  if (current.name === name && current.arg === arg && current.mod) {
    if (current.mod.update) current.mod.update(ctx);
    scrollToAnchor(anchor);
    return;
  }
  trackView(name, arg);
  try {
    const mod = await VIEWS[name]();
    if (current.mod && current.mod.unmount) current.mod.unmount();
    clearPops();
    current = { name, mod, arg };
    app.innerHTML = "";
    window.scrollTo(0, 0);
    await mod.mount(ctx);
    renderTray();
    scrollToAnchor(anchor);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="wrap"><div class="page-head"><h1>Something went wrong</h1><p class="lede">This page couldn't load: ${esc(err.message)}. Try reloading, or <a href="#/">go home</a>.</p></div></div>`;
  }
}

function initChrome() {
  // ?theme=dark or ?theme=light before the hash forces a theme for this load (handy for sharing).
  const forced = new URLSearchParams(location.search).get("theme");
  if (forced === "dark" || forced === "light") document.documentElement.dataset.theme = forced;
  const toggle = $("#theme-toggle");
  const isDark = () => (document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches);
  const icon = () => (toggle.innerHTML = `<i class="ph ph-${isDark() ? "sun" : "moon"}" aria-hidden="true"></i>`);
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
}

initChrome();
initPop();
initCompare();
initCopy();
loadEntries().then((D) => {
  const built = new Date(`${D.meta.built}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  $("#foot-built").textContent = `Last built ${built}.`;
  addEventListener("hashchange", route);
  route();
}).catch((err) => {
  console.error(err);
  app.innerHTML = `<div class="wrap"><div class="page-head"><h1>The catalog didn't load</h1><p class="lede">Check your connection and reload the page.</p></div></div>`;
});
