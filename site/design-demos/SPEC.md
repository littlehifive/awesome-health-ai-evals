# Design brief: awesome-health-ai-evals

This brief is the only shared input for three independent design directions. Read it fully before writing any HTML. Each direction produces three pages built on the same real data, so the owner can compare them side by side and pick one.

## What the site is

A public, personal (not institutional) catalog of 994 benchmarks and evaluation frameworks for health chatbots and health language models. Each entry records where its test questions come from (countries, languages, World Bank income group), who the chatbot is for, how answers are scored, and the qualities it judges ("constructs", 76 of them in 13 domains, built by matching each source's own scoring terms). The catalog's reason to exist is to show how much of this evidence comes from low- and middle-income countries, and to let people compare benchmarks that use different words for the same thing.

It was built with LLM help and says so. It is exploratory, not a systematic review. The maker is a behavioral scientist, not a clinician.

Audience: people choosing how to test a health chatbot (often for a low- or middle-income setting), researchers looking for gaps, funders deciding what evaluation work to support, and curious readers. Many are not designers or engineers. They read on laptops at work and on phones.

Register: a reference work. Calm, precise, plain English, no marketing. Think of a well-made data catalog or research site, not a SaaS landing page.

## Pages to render (three HTML files per direction)

Use the data in `data.js` (same folder, `window.DEMO`). Do not invent numbers, names, quotes, or entries. If a value is not in the data, leave it out.

### 1. Home (`<dir>-home.html`)

One message, one visual, ways in.

- Site header: wordmark "awesome health ai evals", nav: Catalog, Map, Constructs, Compare, Glossary, About, plus a GitHub link and a light/dark toggle. One line at desktop, hamburger on mobile.
- Hero: H1 "Benchmarks and evaluation frameworks for health chatbots". Subline: "994 entries, sorted by where their questions come from and what they judge." Two buttons: "Browse the catalog" (primary) and "See the map". The hero must have a real visual drawn from the data. The obvious one is a world map of `DEMO.countries` (ISO3 to entry count), drawn with d3-geo and world-atlas from the CDN exactly as the live site does (see the snippet below); it may be a faint background, a dot map, a line map, or a full-colour choropleth, as the direction dictates. No stock gradient blob, no illustration.
- A numbers row from `DEMO.counts`: entries, entries with questions written in low- and middle-income countries (`lmic`), countries, languages.
- A "three ways in" row: Catalog ("Filter by what it tests, where the questions come from, and how answers are scored"), Map ("Which countries the questions come from"), Constructs ("The 76 qualities evaluations judge, and how each source defines them").
- Footer: one line about the project (exploratory, built with LLM help, report a mistake on GitHub), data download link, "Code MIT, content CC BY 4.0".
- Nothing else. No featured rail, no pipeline, no testimonials, no "trusted by".

### 2. Entry page (`<dir>-entry.html`), using `DEMO.healthbench`

A model-card-like page. Must feel like a documentation page: breadcrumb, title block, details panel, sections with an on-page table of contents.

- Breadcrumb: Catalog / Open-ended answers and conversation / HealthBench (the middle crumb is the entry's main focus, `DEMO.labels.section[entry.section]`).
- H1: entry name. Metadata row: type ("Benchmark"), year, origin tag (`DEMO.labels.origin[entry.origin]`), "Featured".
- Lede: `entry.summary`. Action links: Paper, Dataset (Hugging Face), Code, Website, and a "Compare" button.
- Right rail (sticky on desktop; above the sections on mobile): a details panel with these rows in order: Type, Year, Size, How it's scored, Who it's for, Languages, Where the questions come from (country names, then income group and region in muted text), Health areas, Data access and license, Built by (builder type, lead-institution country). Below it, the on-page table of contents.
- Sections, in order, each with an anchor:
  1. **Purpose and who it's for**: intended users, health areas, main focus, one or two sentences.
  2. **What's in it**: size, how the questions were made (`provenance`), languages, countries with income group and region, `origin_note`, "Made for this setting?" (`localization`).
  3. **How answers are judged**: scoring methods; "Raters based in" if present; then the scoring terms: each term from `entry.terms` with its level, the quoted definition (`definition`, marked "Paraphrased" when `definition_verbatim` is false), where it appears (`location`), its `scale` if any, and chips for the constructs it was matched to (`constructs[].name`, with the match relationship: same idea / narrower / broader / overlaps). Terms with a `parent` nest under that parent label. This is the richest section; design it so 12 terms read well.
  4. **Access and license**: data access, license, Hugging Face dataset ID, code link.
  5. **Who built it**: builder types, lead institutions' countries, published as (venue), citations with the "as of" date.
  6. **Related entries**: `entry.family` (adaptations of this entry), as a short list with name, year and origin tag. Hide the section if empty.
  7. **Sources**: a plain-fact lede ("Facts on this page were taken from the documents below on {extracted}. The full text was read."), then rows: Paper (with DOI and arXiv as small identifiers), Dataset card, Code, Website; "Scoring terms copied from" with `termsSources`; catalog files `entries/healthbench.yaml` and `terms/healthbench.yaml` on GitHub; a "Report a mistake" link; and `notes` inside a collapsed disclosure "Notes from extraction". No confidence grade anywhere.

### 3. Catalog (`<dir>-catalog.html`)

- Title "Catalog", lede "Benchmarks and evaluation frameworks for health chatbots. Filter by what they test, where their questions come from, and how they score answers."
- Search box above the results, full width of the results column.
- Left rail of filters, calm and plain: Type (segmented control: All / Benchmarks / Frameworks, with counts from `DEMO.facets.kind`), then checkbox lists with right-aligned counts for Origin (`facets.origin`), Health area (`facets.health_areas`, first 6 then "Show all 22"), Who it's for (`facets.users`), How it's scored (`facets.methods`). Then a collapsed "More filters" disclosure listing: Income group, Region, Country, Language, Main focus, What it judges, Data access, Who built it. No bars behind counts, no info icons, no group headings. Facet titles may carry a dotted underline to signal a definition on hover.
- Results header: "994 entries", one active filter chip as an example (e.g. "Origin: LMIC" with an x), "Clear all", a sort select (Featured first), a cards/list view toggle, and a small "Group adaptations under their original" checkbox.
- Results: cards from `DEMO.catalog` (19 rows). Card: name, year, two tags (type, origin), summary clamped to two lines, one meta line with languages, where the questions come from, and how it's scored, and a "Compare" button. Show at least 9 cards. Also render the list view for the same rows below or as the alternate state (one row per entry: name, year, type, origin, languages, where, scored by). Either show both states on the page with a label, or make the toggle work.
- On mobile the rail becomes a "Filters" button opening a sheet; you may just show the mobile layout with the button.

## Constraints that apply to all three directions

- Pure HTML and CSS in one file per page, plus `<script src="data.js">` and a small inline script to render from `DEMO`. The map may load d3-geo, topojson-client and world-atlas from cdn.jsdelivr.net as the live site does. No frameworks, no build step.
- Open-source fonts only, loaded from Google Fonts in the mockup (the real site will self-host). Name the fonts in a comment at the top of each file.
- Light theme rendered. Define the colour tokens as CSS custom properties on `:root` and include a `@media (prefers-color-scheme: dark)` block with the dark values, even if you only check light.
- One accent colour, used consistently. One corner-radius system (state it in a comment). Shadows tinted to the background hue or none.
- Both 1440 px wide and 390 px wide must work. State the mobile collapse for each multi-column layout in CSS, not by assumption.
- Honest content only: real names, real numbers from `DEMO`, no lorem ipsum, no invented testimonials or logos.
- Copy rules (hard): no em-dashes or en-dashes anywhere (use commas, periods, or a hyphen); no small uppercase "eyebrow" labels above every section heading (at most one on the whole home page); no three-identical-cards feature rows; no decorative status dots; no scroll cues; no "trusted by"; no section numbers like "01 / Catalog"; no version labels. Middle dots as separators at most once per line.
- Accessibility: WCAG AA contrast on text and buttons, visible focus rings, buttons readable on their backgrounds, labels above inputs.
- Icons: if you need any, use Phosphor (`https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css`) or none. Do not draw icon SVGs by hand. A simple geometric logo mark is fine.
- Put a comment block at the top of each file: the direction's name and logic, the design read in one line, the fonts, the accent, the radius system, and two or three sentences on why this direction fits a public health-evaluation catalog.

## Map snippet (as used by the live site)

```html
<div id="map"></div>
<script type="module">
  const [d3, topojson, world] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm"),
    import("https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm"),
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then(r => r.json()),
  ]);
  const features = topojson.feature(world, world.objects.countries).features.filter(f => f.id !== "010");
  const byNumeric = {};
  for (const [iso3, c] of Object.entries(DEMO.countries)) if (c.numeric) byNumeric[String(Number(c.numeric))] = iso3;
  const w = 960, h = 460;
  const proj = d3.geoEqualEarth().fitSize([w, h], { type: "FeatureCollection", features });
  const path = d3.geoPath(proj);
  const n = f => { const iso = byNumeric[String(Number(f.id))]; return iso ? DEMO.countries[iso].n : 0; };
  document.getElementById("map").innerHTML = `<svg viewBox="0 0 ${w} ${h}">${features.map(f =>
    `<path d="${path(f)}" data-n="${n(f)}" class="country"></path>`).join("")}</svg>`;
</script>
```

Colour each path by `data-n` with your own scale (0, 1, 2 to 5, 6 to 15, 16 to 50, 51 or more).

## Data keys in `data.js`

`DEMO.counts` (entries, benchmarks, frameworks, lmic, lowIncome, countries, languages, terms, entriesWithTerms, constructs, domains, pipeline), `DEMO.labels` (display labels for every coded value: kind, origin, income, regions, methods, open_data, builders, users, health_areas, provenance, localization, venue, relationship, section), `DEMO.facets` (per facet: value, label, n), `DEMO.countries` (ISO3 to name, income, region, numeric, n), `DEMO.catalog` (19 entry rows), `DEMO.healthbench`, `DEMO.afrimedqa`, `DEMO.rwanda` (full entries with terms, notes, extracted dates, termsSources, family), `DEMO.domains` (13 domains with their constructs and counts), `DEMO.related`.

## Delivery

Three files named `<direction>-home.html`, `<direction>-entry.html`, `<direction>-catalog.html` in this folder, where `<direction>` is `a`, `b` or `c`. Open each in a browser before finishing and fix anything broken. Do not touch any other file in the repository.
