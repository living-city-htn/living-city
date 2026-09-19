# Product design notes

Status: draft, Stage 0
Last updated: 2026-09-19
Decides: the art direction for the app chrome, the tab structure, and how the
game loop maps onto the frozen demo script.

Source: `design/app-sketch-v1.png`, drawn by the Product owner at the event.
Owner: Product. 3D owns everything inside the city viewport; this document
covers everything around it.

## Assumptions

1. "Apple style" is read as the design language, not as copying any Apple product.
   Nothing here imitates Apple's own apps, icons or marks.

## Decisions

1. **The fifth tab is Feed, not Settings.** The sketch drew a gear as filler. A
   settings screen appears nowhere in the frozen script and everything it would
   contain is on the not-built list in docs/04 section 6. Feed earns the slot:
   moment 8 has judges post from their own phones and then look for their post,
   and it is what makes the product read as social rather than as a map viewer.
   Five slots stay, because a centred camera button needs two tabs either side.

## The one art rule

**The chrome is quiet. The city is the colour.**

The UI around the viewport is near-monochrome, generously spaced and almost
invisible. Every saturated colour in the frame comes from the city itself: the
plan's palette, its lighting, its effects. This is what lets "simple and clean"
and "cartoon miniature" (docs/01 section 8.11) live in the same screen instead of
fighting. It also protects moment 4 — when a block lights up, nothing in the
interface competes with it.

If a UI element needs colour to be understood, it is doing too much.

## Art direction

| | Rule |
|---|---|
| Type | System stack (`-apple-system`, `SF Pro` on Apple devices). Two weights: regular for body, semibold for titles. No third font. |
| Spacing | 8pt grid. When unsure, use more space, not less. |
| Colour | Neutral greys plus one accent used only for the primary action. Backgrounds are near-white in light mode, near-black in dark. |
| Depth | Subtle shadow and background blur only. No gradients, no borders where space will do, no skeuomorphism. |
| Corners | Large radii: 12px on cards, 20px+ on sheets. |
| Tab bar | Translucent, `backdrop-filter: blur()`, hairline top border, floats over the map. |
| Motion | Short and springy, 200-300ms. Every state change animates; nothing teleports. |
| Dark mode | Required, not optional. The city has a night lighting mode and the chrome follows it. |
| Panels | Bottom sheets that slide over the map, not full-screen pushes. The city stays visible. |

The map is full-bleed behind everything. The chrome floats; it never boxes the
city in.

## Screen structure

One screen, five tabs, the map always underneath.

| Tab | Icon | What it is | Demo moment | Route |
|---|---|---|---|---|
| Feed | list | Citywide post feed, analyzed and unhidden only | 8, supports 2 | `GET /api/posts` |
| City | house | The 3D map. Tap a block for its panel. Default tab. | 1, 2 | `GET /api/city`, `/api/communities/:id/state` |
| Post | camera | Centre, visually emphasised. Camera, caption, location, submit. | 3, 8 | `POST /api/posts` |
| Shop | coin | Six items, balance, buy | 5 | `GET /api/shop`, `POST /api/shop/buy` |
| My City | person | Personal view: own placements in the three slots per block | 5 | `GET/POST /api/me/placements` |

Post sits in the centre and is the only element allowed the accent colour. It is
the one action the whole demo depends on a stranger performing without
instruction (moment 8).

Public and personal are two **tabs**, not a toggle buried in a menu: City is the
shared truth, My City is yours. That separation is the architecture's rule
(docs/02 section 4.5) made visible, and moment 5 depends on a judge seeing their
decoration vanish when they switch back to City.

## The loop

```
     post (text or photo, geo attached)
                  |
        +---------+---------+
        |                   |
    points               geo info
        |                   |
      shop            AI: Call A -> aggregate -> Call B -> validator
        |                   |
  buy an item         the SHARED city block rebuilds
        |
  place it in a slot
        |
  YOUR city only
```

Two currencies of change, and they never touch:

- **Posts change the shared city.** Everyone sees it. AI decides intent, the
  engine builds it.
- **Points change your city.** Only you see it. No model is involved, and a
  placement can never alter a public plan or a block's geometry.

That separation is not a UI choice; it is the architectural rule in `AGENTS.md`.
The interface has to make it obvious, because "why did the whole city change
when I bought a bench" would break the demo's story.

## Not in this document

Onboarding beyond the greeting line, profile screens, settings, notifications,
comment threads, ledger history, a separate inventory screen. Several appear
naturally in a five-tab app and every one of them is on the not-built list in
docs/04 section 6. The sketch's greeting ("Hello, welcome to…") is a header on
the City tab, not an onboarding flow.
