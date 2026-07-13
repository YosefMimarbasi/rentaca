# Rentaca — Neumorphic Design System

A soft-UI (neumorphic) re-skin of the Rentaca Ithaca-rental site: one
continuous material surface (`#EEEEEE` light / `#1C1C1C` dark), elements
pushed in or out of it with dual soft shadows instead of borders, **Cornell
Red as the sole accent color**. Applied directly to the production static
site — the running pages are the deliverable, no separate build step.

---

## 1. Page → template mapping

| Template | Page | Notes |
|---|---|---|
| **Homepage** | `index.html` | 3D hero (Three.js McGraw Tower), feature rows, sticky filter toolbar, Leaflet map, card grid, CTA, footer |
| **Article** | `about.html` | Editorial prose: red kicker, headline, stat grid, body, callout note |
| **Program page** | `building.html` | Gallery, units table, reviews, sticky contact/price/map side panel |

---

## 2. Design tokens

Source of truth: **`assets/css/tokens.css`**, imported first by `app.css`.

| Token | Value | Role |
|---|---|---|
| `--red` | `#B31B1B` | The one accent — CTAs, links, active state, price/rating, focus ring |
| `--red-hi` / `--red-lo` | `#D8433F` / `#7A1010` | Highlight/shadow sides of the red neumorphic shadow pair |
| `--ink` | `#1A1A1A` | Primary text |
| `--base` | `#EEEEEE` (light) / `#1C1C1C` (dark) | The single material surface — used for background, cards, panels, inputs alike (no separate "surface" color) |
| `--muted` / `--muted-2` | `--gray-50` / `--gray-30` | Secondary text / icon-tier text |
| `--line` | `transparent` | Edges are drawn with shadow, not borders |

**Neumorphic shadow pairs** (`--ne-out-sm/--ne-out/--ne-out-lg` raised,
`--ne-in-sm/--ne-in` pressed, `--ne-red-out/--ne-red-in` for red elements)
are the core visual mechanic — every raised control (buttons, chips, cards)
and every pressed control (inputs, active chips, toggled buttons) is built
from one of these pairs, never a flat fill + border.

Typography is a single family (`Plus Jakarta Sans`) for both body and
display; headings render lowercase (`text-transform: lowercase` in
`app.css`) as a deliberate stylistic choice. Radius is soft throughout
(`--r-sm` 14px up to `--r-xl` 36px) — no sharp corners anywhere.

---

## 3. Accessibility

- Skip link to main content on every page (`#main` / `#root`).
- Semantic landmarks: `<nav aria-label="Primary">`, `<main>`, `<footer>`,
  map `<section aria-label>`, `aria-current="page"` on the active nav item.
- `:focus-visible` = 2px Cornell-red outline, 2px offset, everywhere.
- `--gray-50` was deliberately darkened to `#5C5C5C` (see `tokens.css`) after
  the original `#6E6E6E` measured 4.39:1 on the base surface and failed
  WCAG AA for text — `--gray-30` stays lighter and is reserved for
  decorative/icon use, not body text.
- Keyboard: native controls; Escape closes the filter sheet and the
  lightbox; lightbox arrow keys navigate.
- `prefers-reduced-motion` zeroes animation/transition durations sitewide
  and disables the hero's 3D scene (falls back to a static CSS silhouette).
- Dark mode is opt-in via the theme toggle (not tied to system preference),
  same shadow mechanic on a near-black material.

---

## 4. Performance

| Item | Status |
|---|---|
| CSS | `tokens.css` + `app.css` only, no build step |
| Fonts | Single family (Plus Jakarta Sans), `display=swap`, preconnected |
| Images | `loading="lazy"` + a shared `.ph` placeholder on load failure |
| Card list | 48/page batched + `IntersectionObserver` infinite scroll |
| Map | Leaflet deferred to end of body; scroll-zoom off |
| Dependencies | Shoelace (web components, used throughout) + Leaflet (map) + Three.js (hero only, `index.html`) via CDN. Tailwind's CDN script was previously loaded on every page but never actually used anywhere in the markup — removed. |

---

## 5. Component notes (class contract preserved)

Restyled, never renamed — `home.js` / `building.js` render against these:
`.nav .btn .card .hero .searchbar .toolbar .chip .sheet .field .seg .units
.gallery .rating-big .catbar .panel .footer .lp-row .prose .statcard`.

### Primary button (actual code)
```css
.btn--primary { background: var(--red); color: #fff; box-shadow: var(--ne-red-out); }
.btn--primary:hover { background: var(--red-hi, #C4302C); transform: translateY(-1px); }
.btn--primary:active { transform: translateY(0); box-shadow: var(--ne-red-in); }
```

---

## 6. Dev guide

```bash
cd rentaca && python -m http.server 8000   # http://localhost:8000
```
Edit colors/spacing/shadows in `assets/css/tokens.css` only. Class names are
a JS contract — restyle freely, don't rename. JS-level colors live in
`home.js` `ppColor()` + Leaflet markers and `building.js` `initMap()`, hand-
mapped to the red/gray scale (not driven by CSS custom properties, since
Leaflet renders outside the DOM's cascade).

---

## 7. Acceptance checklist

- [x] Neumorphic soft-UI base with Cornell Red as the sole accent.
- [x] Responsive desktop/tablet/mobile (fluid clamp + 1024/900/760/640/380 breakpoints).
- [x] `tokens.css` drives every component via CSS custom properties.
- [x] A11y: skip links, landmarks, focus rings, keyboard, reduced-motion.
- [x] No unused dependencies shipped — Tailwind CDN removed.
