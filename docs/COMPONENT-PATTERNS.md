# Component Patterns — reference

Patterns adopted from leading component libraries and re-implemented in
Rentaca's no-build static stack (HTML + Shoelace web components + custom
neumorphic CSS), tokenized to the Cornell-red soft-UI system. We adopt the
**anatomy** of these components (proven structure, states, hierarchy), not
their raw utility classes — those depend on each library's own theme and
render unstyled here.

## Sources
- **21st.dev** — community registry of React + Tailwind + Radix components
  (build-step JSX). Used for design direction only; not droppable into a no-build site.
- **shadcn/ui** — copy-paste React/Radix. Card + button anatomy reference.
- **Preline UI** — HTML-first Tailwind. Button taxonomy reference.
- **Flowbite** — HTML-first Tailwind. Form-field + input anatomy reference.
- **HyperUI** — pure Tailwind HTML, MIT. Card/list patterns.
- **Shoelace** — framework-agnostic web components. Used directly for `sl-button` and `sl-icon` (the only two Shoelace tags actually in the markup — everything else, including all filter inputs and the sort `<select>`, is plain HTML styled via `.field`/`.select-wrap`).

## Button taxonomy (from Preline — 6 styles)
| Style | Emphasis | Use |
|---|---|---|
| Solid | High | primary actions (Search, Apply) |
| Outline | Medium | bounded secondary actions |
| Soft | Medium-low | tinted, color without weight |
| Ghost | Low | subtle actions on structured surfaces |
| White | — | actions on dark/photo backgrounds |
| Link | Lowest | inline text actions |

→ Implemented as `.btn` + `.btn--primary/--outline/--soft/--ghost/--white/--link`, each a neumorphic raised shadow (`--ne-out-sm`) that presses inward (`--ne-in-sm`) on `:active` — see `app.css`.

## Form field (from Flowbite)
Anatomy: `label` + `input`. → Implemented in `.field`: the input sits
*pressed into* the surface (`box-shadow: var(--ne-in-sm)`, no border) rather
than the flat bordered-box anatomy Flowbite uses, with a soft Cornell-red
focus ring (`--ne-focus`) added on `:focus`.

## Card (from shadcn / HyperUI)
Anatomy: surface, optional media, header (title + description), content,
footer; single soft hover elevation. → `.card` / `.lp-row` / `.panel`, all
borderless — depth comes entirely from the `--ne-out`/`--ne-out-lg` shadow
pair, not a border or flat fill.

## Shoelace (used directly)
`sl-button` and `sl-icon` only — themed via `--sl-color-primary-*` to
Cornell red, and restyled in `app.css` to match the same raised/pressed
neumorphic language as `.btn`.
