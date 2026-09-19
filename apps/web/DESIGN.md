# Living City design

Product direction, 2026-09-19: simple, clean, Apple-like app chrome. This supersedes the playful city-game styling. Product owns chrome and the fallback map; the 3D teammate owns the renderer.

## Identity

White canvas, system typography, near-black text, quiet gray secondary text and separators. Blue is reserved for actions and selected navigation. No illustrated brand mark, yellow score badges, game-like shadows, slogans, or oversized rounded cards. Corners are 12–16px where useful. Keep content and the city prominent.

City opens as a contained model with white space around its outline. Show only “Explore your city”, a short tap instruction, a small top-right points count and bottom navigation. There is no header band or initial community dropdown on City. Pinching zooms into the city; no zoom buttons. The fallback additionally supports wheel, dragging and keyboard +/-/0/arrows. Pinch/drag must not select a block or place an item accidentally; location picking must remain accurate after zooming.

Ambient particles are sparse, tiny gray dots at low opacity behind the scene, with no pointer interaction and no rendering for reduced motion. They are not public plan effects. The real renderer owns its own camera when it replaces the fallback; the interface remains unchanged.

## Layouts

- **Feed, Shop, Post are full pages**, occupying the entire content canvas below the header and above mobile navigation. Text can have a readable maximum width without reviving the narrow map-side panel.
- **City and My City are scene destinations.** Their controls must leave the map usable. City uses a compact mobile preview with expanded details and a right inspector on desktop. My City uses an inventory tray.
- Desktop and mobile use the same restrained five-destination bottom navigation; desktop content keeps readable maximum widths.
- Pages use a compact screen title and plain points count. City uses an unboxed introduction. Post has the same visual weight as the other navigation items.
- The scene stays mounted across navigation to preserve its camera. On page destinations it is hidden and inert, so keyboard and assistive technology cannot reach invisible controls. Post map-picking temporarily reveals it.
- Keep component state mounted where drafts or pending requests depend on it. Do not reset a draft, purchase lock or placement operation merely to switch layouts.

## Navigation and demo loop

| Destination | Purpose |
|---|---|
| Feed | Photo-led citywide posts; community chips lead to the corresponding City block |
| City | Shared city plans, block stories and updates |
| Post | Photo or text, explicit location, submit and confirmed rewards |
| Shop | Readable catalogue, authoritative balance and owned quantities; purchase leads to decorating |
| My City | Private inventory and placements; empty inventory leads to Shop |

Posts influence the shared city through the existing pipeline. Points purchase personal decorations; placements never change public plans or block geometry. Preserve these separate layers and the existing scene/API contracts.

## Interaction standards

Show real loading, empty, retry, pending and success states. Do not present an unconfirmed city rebuild as complete. Keep visible Back/Close controls where a subflow needs them; no gesture-only navigation. Controls must have clear accessible names, visible keyboard focus and at least 44px touch targets. Permit browser zoom. No clipped content, horizontal document overflow or hidden focus targets.

Verify at 320, 390, 768, 1024 and 1440px; include long community names, image posts, empty inventory, failed purchases, denied location access and the complete post → points → purchase → placement journey.

## Delivery and ownership

Develop and check locally; Product merges PRs and Vercel production follows the merge. Never deploy production directly as part of this work. Leave a concrete handoff for Claude after every PR and preserve parallel teammate sessions.

The real 3D city is a separate delivery dependency. Do not invent unsupported map controls or a replacement renderer. This redesign adds no social graph, comments, profiles, catalog items or backend systems.
