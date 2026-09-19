# feature-CNN

A small image classifier, trained from scratch, that turns a post's photo into
structured scene facts and hands them to Call A as extra context.

It lives outside `packages/` and outside the pnpm workspace on purpose. Nothing in
the app imports it, nothing in the demo path depends on it, and it cannot break a
gate.

## Read this before using it

Two rules in `AGENTS.md` and `docs/04` bear on this folder. Neither is a reason not
to build it. Both are reasons not to quietly wire it in.

1. **It is not in the demo script.** `docs/04` section 1 asks whether a judge will
   see it on stage or touch it on the phone. A judge will not see this. It was built
   at the repo owner's explicit direction, as a standalone folder, and it should not
   take priority over any unfinished item in `docs/roles/pipeline.md` before Gate 3.

2. **It is a third model.** `AGENTS.md` says: do not add a model call anywhere
   except the two defined in the prompt spec. A local CNN is a model call, even
   though it runs on the machine and costs nothing. Putting it in front of Call A is
   therefore not just a `packages/contracts` change needing the Pipeline owner plus
   one other person - it is an amendment to the architectural rule, and that is a
   four-person decision. Until that decision happens, this folder produces JSON
   files on the side and a block of prompt text a human can paste in to see whether
   it helps.

What it does **not** do, in any configuration: emit geometry, emit a word from the
Call B vocabulary, decide an archetype, touch a plan, or write to the database. It
describes what is in a photograph. `docs/02` section 1 stays intact: AI ends at
structured JSON.

## Why a CNN adds anything at all

Call A already sends the photo to a vision model. So the honest question is what a
160px convnet knows that Gemini Flash does not, and the answer is not "more about
the image" - it is "the same thing, in a form the pipeline can use".

| What Call A gives today | What this gives |
|---|---|
| `image_evidence: ["crowd", "string lights"]` - up to four free-text nouns | `crowd: {value: "crowd", confidence: 82}` - a fixed class from a fixed set |
| No confidence per observation; one `confidence` for the whole analysis | A calibrated probability per head, so a hint can be thresholded |
| Non-deterministic: the same photo can produce different nouns | Deterministic: same weights, same photo, same output, every time |
| Nothing to compare against | A second opinion that can be diffed against the analysis, which is how you find out a prompt has drifted |

Concretely, three things it buys:

- **A numeric handle for the aggregator.** `crowd` as one of five ordered values can
  be averaged over a block's recent posts. A noun list cannot.
- **A disagreement signal.** When the CNN says `artificial_night` and
  `time_context.time_bucket` says `morning`, something is wrong with the post - a
  reposted photo, a wrong clock, a joke. That is cheap to detect and impossible to
  detect from prose.
- **Hazard corroboration.** The four demo incident types in `docs/04` section 3 are
  visually distinctive. A photo classifier that independently says `flooding` at 90%
  is exactly the kind of evidence the civic layer wants before a `verified` status,
  and it is evidence that does not come from the same model that wrote the
  incident record.

It does not replace anything. Call A still decides. The hints are evidence with a
number attached.

## What it predicts

Seven heads, one forward pass. Every class is chosen to land on a vocabulary that
already exists in `packages/contracts/src/enums.ts`, so a hint can be checked
against an analysis instead of inventing a parallel set of words.

| Head | Classes | Corroborates |
|---|---|---|
| `crowd` | empty, few, group, crowd, packed | `event_scale`, the social and energy dimensions |
| `greenery` | none, trace, some, lush | the nature dimension, `vegetation.level` |
| `lighting` | daylight, overcast, golden_hour, artificial_night, dark | `lighting_accent`, and a cross-check on `time_bucket` |
| `weather` | clear, cloudy, rain, snow, fog | the rain / snow / fog effects, flooding and snow_ice incidents |
| `scene` | park, street, plaza, waterfront, cafe_restaurant, bar, shop, market, transit, venue, indoor_other | `place_type` |
| `built_form` | none, low_rise, mid_rise, high_rise | `height_profile`, density (evidence for Call B, not Call A) |
| `hazard` | flooding, fallen_tree, road_blocked, power_outage (multi-label) | `incident.type` |

`hazard` is multi-label because a storm photo is a fallen tree *and* a blocked road,
and because "nothing wrong here" has to be representable as all zeros rather than
as a competing class.

The label space is defined once, in `src/citycnn/labels.py`, and it is the file to
read first.

## Quickstart

```bash
cd feature-CNN
python -m venv .venv && .venv/Scripts/activate      # Windows; use bin/activate elsewhere
pip install -r requirements.txt

# Prove the whole pipeline runs, on synthetic images, no dataset needed (~1 min CPU)
python scripts/smoke_test.py

# Fast tests: label space, CSV reader, split stability, hint schema. No torch needed.
python -m pytest tests -q
```

Then, with real photos:

```bash
python scripts/bootstrap_labels.py --from-seed     # creates data/labels/labels.csv
# ... label the CSV in a spreadsheet; see data/README.md for how to do it well ...
python scripts/bootstrap_labels.py --stats         # coverage per head

python -m citycnn.train --config configs/default.yaml
python -m citycnn.evaluate --checkpoint runs/latest/best.pt --calibrate --confusion
python -m citycnn.infer --checkpoint runs/latest/best.pt \
    --image data/raw/seed/e7-window-broken.jpg --prompt-block
```

## The output

`SceneHints`, defined in `src/citycnn/schema.py`, generated into
`contract/scene-hints.schema.json` with an example in `contract/example.json`.

```json
{
  "schema_version": "cnn-hints-1.0",
  "model_version": "citycnn-0.1.0",
  "image_ref": "/seed/e7-window-broken.jpg",
  "crowd":    { "value": "empty",    "confidence": 88 },
  "weather":  { "value": "rain",     "confidence": 79 },
  "scene":    { "value": null,       "confidence": 44, "runners_up": { "street": 44, "park": 31 } },
  "hazards":  [ { "value": "fallen_tree", "confidence": 91 } ],
  "prompt_lines": ["crowd: no people visible (88% confident)", "..."]
}
```

Three properties of that shape are deliberate and should survive any later change:

- **A head below its threshold emits `null`, not a guess.** `docs/03` rule 6 tells
  Call A to trust the image over the text for scene facts, so a confident wrong hint
  is worse than no hint. `scene` above is null at 44% and that is the correct
  output, not a failure.
- **Confidences are calibrated**, per head, by temperature scaling on the validation
  split (`evaluate.py --calibrate`). A raw softmax on a small dataset reads 0.98 and
  is right 70% of the time, which would make every threshold meaningless.
- **`prompt_lines` is short, factual, and labelled as evidence.** The block that
  would go into a prompt says where it came from and that it may be wrong. An
  unlabelled list of assertions in a prompt is indistinguishable from an
  instruction, and `instruction_like` is a content flag for a reason.

## If the team ever decides to wire it in

The smallest honest version, in order:

1. Run it over the whole seed set and diff the hints against the stored
   `PostAnalysis` rows. If the hints agree with Gemini everywhere, the CNN is adding
   nothing and this folder is a learning exercise - say so and stop. The
   disagreements are the entire value, and they have to be checked by hand.
2. Take the four-person decision on the architectural rule (point 2 at the top).
3. Add one optional field to `PostInput` in `packages/contracts` - a list of short
   strings, nothing more structured - behind the Pipeline owner plus one reviewer.
4. Serve inference from a separate process, not from the Next.js handler. Call A is
   inline with a 3-second budget (`docs/04` section 8); a cold PyTorch import inside
   that handler would spend the whole budget before the photo is read.
5. Keep it optional and fail open. No hints is a normal outcome, exactly like
   `image_missing`.

Skip any of those and this becomes a second source of truth about photographs with
no owner, which is worse than not having it.

## Layout

```
feature-CNN/
  README.md
  requirements.txt
  configs/default.yaml        every knob, commented
  contract/                   generated: SceneHints JSON schema + example
  data/                       see data/README.md; photos are not committed
  scripts/
    bootstrap_labels.py       create or top up the label CSV
    smoke_test.py             end-to-end on synthetic images, no dataset
    make_schema.py            regenerate contract/
  src/citycnn/
    labels.py                 the label space. read this first
    schema.py                 SceneHints, the only thing that leaves this folder
    config.py                 dataclass config, YAML + CLI overrides
    dataset.py                partially labelled CSV -> tensors
    transforms.py             augmentation, and why it is mild on colour
    model.py                  CitySceneNet: the custom CNN, plus a resnet18 baseline
    losses.py                 masked multi-head loss, class weights
    metrics.py                macro F1, ordinal distance, ECE, temperature fitting
    engine.py                 train and eval loops
    train.py                  entry point
    evaluate.py               report, confusion matrices, calibration
    checkpoint.py             loading, with the label-space compatibility check
    infer.py                  image -> SceneHints, and the prompt block
  tests/                      fast tests, no torch required
```

## Known limits

- **The scratch net needs data.** `backbone: scratch` is the point of the exercise
  and it will lose to `backbone: resnet18` on anything under roughly a thousand
  labelled images. Both are in `model.py` and the honest way to report a result is
  to give both numbers.
- **`hazard` is the head that matters and the head with the fewest positives.** Most
  photos contain no hazard. Expect it to be the last head to become trustworthy, and
  do not lower its threshold to make it fire more.
- **`scene` may never work.** Distinguishing a plaza from a wide street from a photo
  is genuinely hard and Gemini is better at it. If it stays weak, drop the head
  rather than shipping a coin flip.
- **No test split by default.** `test_fraction` is 0 until there are enough images
  for a third split to mean anything. Until then every number is a validation
  number, which is also the number the thresholds were tuned on - so treat it as
  optimistic.
