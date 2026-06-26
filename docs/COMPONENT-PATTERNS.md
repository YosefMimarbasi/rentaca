# Component Patterns — scraped reference

Patterns adopted from leading component libraries and re-implemented in Rentaca's
no-build static stack (HTML + Tailwind CDN + Shoelace web components), tokenized
to the Cornell-red minimalist system. We adopt the **anatomy** of these
components (proven structure, states, hierarchy), not their raw utility classes —
their classes depend on each library's own Tailwind theme and would render
unstyled here.

## Sources
- **21st.dev** — community registry of React + Tailwind + Radix components
  (build-step JSX). Used for design direction; not droppable into a no-build site.
- **shadcn/ui** — copy-paste React/Radix. Card + button anatomy reference.
- **Preline UI** — HTML-first Tailwind. Button taxonomy reference.
- **Flowbite** — HTML-first Tailwind. Form-field + input anatomy reference.
- **HyperUI** — pure Tailwind HTML, MIT. Card/list patterns.
- **Shoelace** — framework-agnostic web components. Used directly (already loaded).

## Button taxonomy (from Preline — 6 styles)
| Style | Emphasis | Use |
|---|---|---|
| Solid | High | primary actions (Search, Apply) |
| Outline | Medium | bounded secondary actions |
| Soft | Medium-low | tinted, color without weight |
| Ghost | Low | subtle actions on structured surfaces |
| White | — | actions on dark/photo backgrounds |
| Link | Lowest | inline text actions |

Common base: `inline-flex items-center gap-2 font-medium rounded-lg
disabled:opacity-50 disabled:pointer-events-none` + hover/focus states.
→ Implemented as `.btn` + `.btn--primary/--outline/--soft/--ghost/--white/--link`.

## Form field (from Flowbite)
Anatomy: `label (block, mb, text-sm, font-medium)` + `input (border, rounded,
shadow-xs, focus:ring + focus:border-brand, w-full, px-3 py-2.5)`.
→ Implemented in `.field` with a soft Cornell-red focus ring.

## Card (from shadcn / HyperUI)
Anatomy: bordered surface, optional media, header (title + description), content,
footer; single soft hover elevation. → already `.card` / `.lp-feature` / `.panel`.

## Shoelace (used directly)
`sl-button`, `sl-input`, `sl-select`, `sl-badge`, `sl-icon`, `sl-tooltip`,
`sl-switch`, `sl-dialog` — themed via `--sl-color-primary-*` to Cornell red.
