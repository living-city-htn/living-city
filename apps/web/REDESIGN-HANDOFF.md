# Frontend redesign handoff

## PR 1 — visual foundation and page layouts

Implemented the approved palette, bundled Nunito Sans + license, Living City mark, 208px branded desktop rail, mobile Post action, readable screen headers and points badge. Feed, Shop and Post now own the content canvas; City/My City reserve it for the scene and inspector. The scene remains mounted but hidden/inert on page destinations. No API or scene contracts changed; drafts and pending request owners stay mounted. Ambient shell particles removed. Browser zoom is enabled and shared keyboard focus is visible.

Replaced competing layout overrides in `app/globals.css` with explicit page/scene layouts and preserved operator/QR styles. `DESIGN.md` now reflects Product's approved direction.

Validation: `pnpm --filter @living-city/web typecheck` passed. Browser verification is performed by the coordinating agent before PR publication. No production deployment was run.

Next PRs: Feed/Shop/Post content and transitions; City compact/expanded details and inventory tray. Keep `.page-screen` as the full-page layout contract. The existing `.sheet` style is retained for intermediate scene panels; upcoming scene-specific components should have their own layout classes. Shop grid uses the named `shop` CSS container. Keep the original shell layout components mounted when adding navigation callbacks.

Known dependency: the local scene export is still the flat fallback. The 3D teammate owns the real city delivery; do not replace or expand that contract during UI work. Light theme remains explicitly pinned for the demo.
