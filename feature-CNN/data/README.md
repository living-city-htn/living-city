# Data

Nothing in here is committed except this file, `labels/labels.example.csv`, and the
`.gitkeep` in `raw/`. Photos stay out of git.

```
data/
  raw/                 images, any subfolder structure you like
  labels/labels.csv    one row per image, one column per head  (committed: yes)
  labels/labels.example.csv
```

The label CSV **is** worth committing once it has real rows in it. It is small, it
is the expensive part (someone sat and looked at every photo), and it is the only
thing that makes a checkpoint reproducible.

## Getting images

In rough order of how useful they are:

1. **The repo's own seed photos.** `python scripts/bootstrap_labels.py --from-seed`
   copies the five images in `apps/web/public/seed/` into `raw/seed/`. Tiny, but
   these are the photos that appear in the demo, so a hint being wrong on them is
   the only wrongness a judge could see.
2. **Photos the team takes around Kitchener-Waterloo.** A walk around Uptown at
   dusk with a phone is 200 images in half an hour, and they match the actual input
   distribution better than anything downloadable: phone camera, handheld, mixed
   light, the same streets the demo city is drawn from.
3. **A public scene dataset for the easy heads.** `weather` and `lighting` transfer
   fine from generic photos; `crowd` and `hazard` do not transfer from curated
   datasets, because a dataset of flood photographs is all dramatic floods and a
   real post is a puddle at a bus stop.

Whatever the source, check the licence before committing anything, and do not
commit photos of identifiable people. The same rule that governs `image_evidence`
in `docs/03` rule 7 applies to the training set: no faces, no plates, no readable
private text. Delete rather than label.

## How much is enough

Rough, from the shape of the problem rather than from a paper:

| Labelled images | What you get |
|---|---|
| under 150 | The smoke test passes and nothing else is measurable. Do not quote a number. |
| 300-500 | `weather` and `lighting` become genuinely useful with `backbone: resnet18`. The scratch net is still behind. |
| 800-1500 | `crowd` and `greenery` join them. The scratch net becomes competitive. |
| 2000+ | `hazard` starts to be worth trusting, which is the head that needs it most and gets the fewest positives. |

Label breadth before depth: 400 images labelled for two heads beats 100 images
labelled for all seven.
