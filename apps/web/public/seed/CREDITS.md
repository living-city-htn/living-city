# Seed photo credits

Photographs used by the seeded demo posts in `packages/fixtures/data/posts.seed.json`.
They are placeholders: during the demo the feed fills with real posts.

## From the Product owner

`e7-window-broken.jpg`, `e7-grad-decorations.jpg`, `e7-plaza-battery-fire.jpg`,
`cardill-false-alarm.jpg`, `environmental-reserve.jpg` — taken by the Product owner,
used with permission. Resized to 1280px for the repo.

## From Wikimedia Commons

Resized to 1280px. Only CC0 and CC BY were taken, so the repo is not pulled into
share-alike terms. No photograph of an identifiable person is used: turning a real
named individual into a fictional resident would misrepresent them.

| File | Source | Licence | Author |
|---|---|---|---|
| `kitchener-city-hall.jpg` | [Kitchener City Hall Station Feb 2017.jpg](https://commons.wikimedia.org/wiki/File:Kitchener_City_Hall_Station_Feb_2017.jpg) | CC0 | Radagast |
| `ion-victoria-park.jpg` | [Victoria Park Station Kitchener Jan 2017.jpg](https://commons.wikimedia.org/wiki/File:Victoria_Park_Station_Kitchener_Jan_2017.jpg) | CC0 | Radagast |
| `waterloo-park-aerial.jpg` | [Waterloo Park aerial view 2024.jpg](https://commons.wikimedia.org/wiki/File:Waterloo_Park_aerial_view_2024.jpg) | CC BY 4.0 | Canmenwalker |
| `uptown-public-square.jpg` | [Waterloo Public Square Station May 2017.jpg](https://commons.wikimedia.org/wiki/File:Waterloo_Public_Square_Station_May_2017.jpg) | CC0 | Radagast |

The three ION station photographs are from 2017, during construction, so the
posts that carry them describe track work and barriers rather than a running
service. Captions were written after opening each file: the filenames alone
would have produced posts about trains arriving on time, past platforms that do
not exist yet.

To replace one, drop a new file in `apps/web/public/seed` and update the row
in `posts.seed.json` plus this table.
