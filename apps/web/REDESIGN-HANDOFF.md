## Current visual direction — clean interface

Product rejected the playful art direction after the interaction work merged. The approved replacement is system typography, white/gray surfaces, subtle separators, no logo art/coins/slogans, and quiet bottom navigation on all widths. City shows an explore prompt and top-right points without a header band, a contained outline with white surroundings, and pinch zoom without buttons. Existing posting, rewards, shop, and placement logic remains. The fallback now implements bounded gestures; real3D owns its own camera at the existing seam. See DESIGN.md for the current source of truth. Do not restore the playful styling described in historical entries below.

# Frontend redesign handoff

## PR 1 — visual foundation and page layouts

Implemented the approved palette, bundled Nunito Sans + license, Living City mark, 208px branded desktop rail, mobile Post action, readable screen headers and points badge. Feed, Shop and Post now own the content canvas; City/My City reserve it for the scene and inspector. The scene remains mounted but hidden/inert on page destinations. No API or scene contracts changed; drafts and pending request owners stay mounted. Ambient shell particles removed. Browser zoom is enabled and shared keyboard focus is visible.

Replaced competing layout overrides in `app/globals.css` with explicit page/scene layouts and preserved operator/QR styles. `DESIGN.md` now reflects Product's approved direction.

Validation: `pnpm --filter @living-city/web typecheck` passed. Browser verification is performed by the coordinating agent before PR publication. No production deployment was run.

Next PRs: Feed/Shop/Post content and transitions; City compact/expanded details and inventory tray. Keep `.page-screen` as the full-page layout contract. The existing `.sheet` style is retained for intermediate scene panels; upcoming scene-specific components should have their own layout classes. Shop grid uses the named `shop` CSS container. Keep the original shell layout components mounted when adding navigation callbacks.

Known dependency: the local scene export is still the flat fallback. The 3D teammate owns the real city delivery; do not replace or expand that contract during UI work. Light theme remains explicitly pinned for the demo.

## Part 2 — Feed, Shop, Post journey
Full-page Feed keeps its cards mounted across refresh/navigation so pending likes retain their guard. Community buttons open City. Shop shows balance and a confirmed-purchase Decorate action. Composer keeps drafts, adds Close/Back and keyboard-accessible file controls. Post receipts distinguish saving from city replanning and use only confirmed points. No API route/schema changes.

Next: scene selectors, compact inspectors/inventory, and final responsive/demo checks. Merge foundation first, then journey. Production deployment remains merge-driven.

## Part 3 — City controls and final verification

City has a community selector plus a compact mobile inspector with explicit expansion and a desktop right inspector. My City has a compact inventory tray, Shop CTA, selected-community slot buttons, progress/errors, and keyboard interaction. Empty slots show only for the selected community; placed items remain visible throughout the personal view. Public mode exposes no personal markers. The existing CityScene contract and apps/web/scene are unchanged.

Review fixes: feed rows reconcile fresh likes while preserving pending mutations; map picking can confirm a previously selected community; action blue is slightly darker than the brand lake blue for readable white text; short desktop navigation scrolls.

Validation: all three committed PR versions build independently; final web suite50/50. Browser checks at320,390,768,1024,1440px found no horizontal overflow in Feed/Shop/Post. Tested text and photo posting against local fixture data, draft retention, permission-denied fallback, community selection, confirmed rewards, purchase→preselected item→placement, public/private visibility, Feed retry and purchase failure. Keyboard block selection, collapsed/expanded inspector, reduced motion, and accessibility audit checked. Automated browser checks are Chromium; actual iOS camera/system permissions and the real3D integration still require team rehearsal.

No production data was modified. Local test server uses fixtures and no database URL. Production deploys only after Bryan merges. Merge the three PRs in order; later PRs target the preceding branch until it is merged. Never archive Claude's session. Continue from the latest merged main, keeping the Product/3D boundary intact.

Clean-interface validation: tested real two-finger touch events against the fallback (viewBox shrank from1240 to477 units, no selected block after release), keyboard reset, and desktop inspector preserving828px canvas height at1440×1000. Gesture math has four regression cases. Camera remains confined to Product fallback; no apps/web/scene or contract change. Removed unused bundled font assets. Develop locally and open a PR; Bryan merges.
