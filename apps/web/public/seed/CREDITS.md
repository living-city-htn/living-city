# Seed photo credits

Photographs used by the seeded demo posts in `packages/fixtures/data/posts.seed.json`.
They are placeholders: during the demo the feed fills with real posts.

## From the Product owner

`e7-window-broken.jpg`, `e7-grad-decorations.jpg`, `e7-plaza-battery-fire.jpg`,
`cardill-false-alarm.jpg`, `environmental-reserve.jpg`, `e7-storm-cloud.jpg`,
`new-student-ceremony.jpg`, `back-to-uw.jpg` — taken by the Product owner, used
with permission. Resized to 1280px for the repo.

The three campus photographs (library, arena, storm over E7) are all main
campus, so they all sit in `kw:university-district`, which takes that block to
twelve seed posts against the six-to-ten ceiling in docs/04 section 3. Filing a
library photograph under a neighbourhood it is not in would be worse, and extra
seed posts cost nothing — unlike the caps on archetypes, assets and slots,
which exist to stop the build growing.

## From Wikimedia Commons

Resized to 1280px. Only CC0 and CC BY were taken, so the repo is not pulled into
share-alike terms. No photograph of an identifiable person is used: turning a real
named individual into a fictional resident would misrepresent them.

| File | Source | Licence | Author |
|---|---|---|---|
| `waterloo-park-aerial.jpg` | [Waterloo Park aerial view 2024.jpg](https://commons.wikimedia.org/wiki/File:Waterloo_Park_aerial_view_2024.jpg) | CC BY 4.0 | Canmenwalker |
| `uptown-public-square.jpg` | [Waterloo Public Square Station May 2017.jpg](https://commons.wikimedia.org/wiki/File:Waterloo_Public_Square_Station_May_2017.jpg) | CC0 | Radagast |

The Public Square photograph is from 2017, during ION construction, so the post
that carries it describes track work and hoarding rather than a running
service. Two Kitchener photographs were removed when the demo narrowed to the
City of Waterloo. Captions were written after opening each file: the filenames alone
would have produced posts about trains arriving on time, past platforms that do
not exist yet.

To replace one, drop a new file in `apps/web/public/seed` and update the row
in `posts.seed.json` plus this table.
