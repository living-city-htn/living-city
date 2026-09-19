# Living City design

Approved by Product, 2026-09-19. This replaces the earlier monochrome, map-behind-every-panel design. Product owns app chrome and the fallback map; the 3D teammate owns the scene renderer.

## Identity

Living City is a playful city game built from everyday moments. Use rounded, bold Nunito Sans headings, readable body text, generous spacing, and consistent illustrated controls. The font is bundled locally under the SIL Open Font License in `public/fonts/OFL.txt`.

| Token | Value | Purpose |
|---|---|---|
| Cloud | `#F5F8FC` | Page canvas |
| Ink | `#18324B` | Text |
| Lake blue | `#2878D0` | Primary actions |
| Leaf green | `#347855` | City identity and active navigation |
| Sunshine | `#F4C95D` | Rewards and points |
| White | `#FFFFFF` | Cards and controls |

Use 18px card corners, 24px inspector corners, tactile but restrained shadows, and an 8px spacing rhythm. Colour communicates navigation, actions and rewards. Decorative continuous particle motion is removed from the app shell. Scene effects retain their own meaning and ownership. Reduced-motion users receive no interface animations. Light mode remains the explicit demo default.

## Layouts

- **Feed, Shop, Post are full pages**, occupying the entire content canvas below the header and above mobile navigation. Text can have a readable maximum width without reviving the narrow map-side panel.
- **City and My City are scene destinations.** Their controls must leave the map usable. City uses a compact mobile preview with expanded details and a right inspector on desktop. My City uses an inventory tray.
- Desktop, from 900px: a branded **208px rail**, header across the remaining width, readable content in the page canvas.
- Mobile: compact identity/header, clear screen title, points balance, and five bottom destinations with a prominent central Post action.
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

Three PRs: foundation/layout, Feed–Shop–Post journey, then City/My City controls and demo verification. Develop and check locally; Product merges PRs and Vercel production follows the merge. Never deploy production directly as part of this work. Leave a concrete handoff for Claude after every PR and preserve parallel teammate sessions.

The real 3D city is a separate delivery dependency. Do not invent unsupported map controls or a replacement renderer. This redesign adds no social graph, comments, profiles, catalog items or backend systems.
