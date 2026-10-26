// Small helpers shared by every view.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => Number(n || 0).toLocaleString("en-US");
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
export const pretty = (s) => String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// "A, B and C" for a few items, otherwise "7 countries".
export function listText(items, max, noun) {
  if (!items.length) return "";
  if (items.length > max) return `${items.length} ${noun}`;
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function setTitle(...parts) {
  document.title = [...parts.filter(Boolean), "awesome health ai evals"].join(" | ");
}

// Build a catalog link from facet values: catalogHref({countries: "BRA"}, {from: "map"}).
export function catalogHref(filters = {}, extra = {}) {
  const q = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => [].concat(v).forEach((x) => q.append(k, x)));
  Object.entries(extra).forEach(([k, v]) => v != null && q.set(k, v));
  const s = q.toString();
  return `#/catalog${s ? `?${s}` : ""}`;
}
