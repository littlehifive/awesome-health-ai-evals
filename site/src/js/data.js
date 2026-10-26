// Loads the site data. entries.json comes first and holds everything most views need;
// details.json (terms and extraction notes) loads only when a view asks for it.

export const D = {
  meta: null, entries: [], byId: new Map(), constructs: new Map(), domains: new Map(),
  countries: {}, families: {}, details: null,
};

export async function loadEntries() {
  const res = await fetch("data/entries.json");
  if (!res.ok) throw new Error(`entries.json: ${res.status}`);
  const d = await res.json();
  D.meta = d;
  D.entries = d.entries;
  D.countries = d.countries;
  D.families = d.families || {};
  d.entries.forEach((e) => D.byId.set(e.id, e));
  d.domains.forEach((x) => D.domains.set(x.id, x));
  d.constructs.forEach((x) => D.constructs.set(x.id, x));
  return D;
}

let detailsPromise;
export function loadDetails() {
  detailsPromise ||= fetch("data/details.json").then((r) => {
    if (!r.ok) throw new Error(`details.json: ${r.status}`);
    return r.json();
  }).then((d) => (D.details = d));
  return detailsPromise;
}

export const termsOf = (id) => (D.details && D.details[id] ? D.details[id].terms : []);

export function countryName(code) {
  if (code === "GLOBAL") return "No specific country";
  if (code === "UNKNOWN") return "Not stated";
  return (D.countries[code] && D.countries[code].name) || code;
}

// Languages with a known name (drops UNKNOWN), and how to show a language value.
export const realLanguages = (e) => e.languages.filter((l) => l !== "UNKNOWN");
export const languageName = (l) => (l === "UNKNOWN" ? "Not stated" : l);

// Real ISO3 codes only (drops GLOBAL and UNKNOWN).
export const realCountries = (e) => e.countries.filter((c) => c.length === 3 && c !== "UNKNOWN");

export const constructName = (id) => (D.constructs.get(id) || { name: id }).name;
export const domainOf = (constructId) => D.domains.get((D.constructs.get(constructId) || {}).domain);

// Entries counted per value of a getter, each entry once per value.
export function tally(entries, get) {
  const m = new Map();
  entries.forEach((e) => new Set(get(e)).forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
  return m;
}
