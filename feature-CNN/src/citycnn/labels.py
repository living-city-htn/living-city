"""
The label space: what the CNN is allowed to say about an image.

This is the whole point of the package, so read it before anything else. Every
head here exists because it produces a *scene fact* that docs/03 rule 6 says the
image carries ("crowd size, greenery, lighting, weather, storefront type") but
that Call A currently returns only as up to four free-text nouns in
`image_evidence`. A noun list cannot be thresholded, averaged, or calibrated. A
softmax can.

Each head's values are chosen to land on a vocabulary that already exists in
`packages/contracts/src/enums.ts`, so a hint can be checked against an analysis
instead of being a second, parallel universe of words. The mapping is recorded
in `MAPS_TO` per head and is documentation, not code: nothing here imports from
the TypeScript side and nothing here is a contract change.

Ordinal heads (`crowd`, `greenery`, `built_form`) are trained as plain softmax
classifiers, not as regression. With a few hundred hand-labelled hackathon
photos, ordinal regression buys accuracy we cannot measure and costs a loss
function we would have to debug at 3am.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: Sentinel for "this image was not labelled for this head". Rows are partially
#: labelled on purpose - labelling weather on 400 photos is fast, labelling
#: scene type on 400 photos is not - and the loss masks these out.
IGNORE = -1


@dataclass(frozen=True)
class Head:
    """One prediction head: a name, its classes, and how it is scored."""

    name: str
    classes: tuple[str, ...]
    multilabel: bool = False
    #: Below this confidence the hint is emitted as null rather than guessed.
    #: Tuned per head in `evaluate.py --calibrate`; these are starting points.
    threshold: float = 0.55
    #: Which contracts vocabulary the value corroborates. Prose, for humans.
    maps_to: str = ""
    #: Loss weight. Heads that feed moment 4 (crowd, lighting) matter more than
    #: heads that only add flavour (built_form).
    weight: float = 1.0
    #: Ordinal heads are listed low to high, so a confusion of neighbours is a
    #: near miss and `evaluate.py` reports mean absolute distance for them.
    ordinal: bool = False

    @property
    def n_classes(self) -> int:
        return len(self.classes)

    def index(self, value: str) -> int:
        """Class index for a label string; IGNORE for blank or unknown."""
        value = (value or "").strip().lower()
        if not value:
            return IGNORE
        try:
            return self.classes.index(value)
        except ValueError:
            return IGNORE


CROWD = Head(
    name="crowd",
    classes=("empty", "few", "group", "crowd", "packed"),
    ordinal=True,
    threshold=0.50,
    weight=1.5,
    maps_to="event_scale, the social and energy dimensions, activity_type=attending_event",
)

GREENERY = Head(
    name="greenery",
    classes=("none", "trace", "some", "lush"),
    ordinal=True,
    threshold=0.55,
    weight=1.0,
    maps_to="the nature dimension, vegetation.level and vegetation.types",
)

LIGHTING = Head(
    name="lighting",
    classes=("daylight", "overcast", "golden_hour", "artificial_night", "dark"),
    threshold=0.55,
    weight=1.5,
    maps_to="lighting_accent, and a cross-check on time_context.time_bucket",
)

WEATHER = Head(
    name="weather",
    classes=("clear", "cloudy", "rain", "snow", "fog"),
    threshold=0.60,
    weight=1.2,
    maps_to="the weather effects rain / snow / fog, and corroboration for flooding and snow_ice incidents",
)

SCENE = Head(
    name="scene",
    classes=(
        "park",
        "street",
        "plaza",
        "waterfront",
        "cafe_restaurant",
        "bar",
        "shop",
        "market",
        "transit",
        "venue",
        "indoor_other",
    ),
    threshold=0.60,
    weight=1.0,
    maps_to="place_type (same words, minus the ones a photo cannot show: home, office, school, gym)",
)

BUILT_FORM = Head(
    name="built_form",
    classes=("none", "low_rise", "mid_rise", "high_rise"),
    ordinal=True,
    threshold=0.60,
    weight=0.6,
    maps_to="height_profile and density, as evidence for Call B rather than Call A",
)

#: Multi-label, because a storm photo is flooding *and* a fallen tree, and
#: because "nothing wrong here" must be representable as all-zeros rather than
#: as a competing class. Restricted to the four types docs/04 section 3 gives a
#: distinct label; everything else stays the model's business to ignore and
#: Call A's business to name.
HAZARD = Head(
    name="hazard",
    classes=("flooding", "fallen_tree", "road_blocked", "power_outage"),
    multilabel=True,
    threshold=0.65,
    weight=2.0,
    maps_to="incident.type, as corroboration only - Call A still decides",
)

HEADS: tuple[Head, ...] = (CROWD, GREENERY, LIGHTING, WEATHER, SCENE, BUILT_FORM, HAZARD)
HEADS_BY_NAME: dict[str, Head] = {h.name: h for h in HEADS}

#: CSV column order for `data/labels/*.csv`. `image` is a path relative to the
#: dataset root; `split` is train / val / test or blank for an automatic split.
CSV_COLUMNS: tuple[str, ...] = ("image", *(h.name for h in HEADS), "split", "note")


def parse_multilabel(value: str, head: Head) -> list[int] | None:
    """
    Parse a hazard cell into a multi-hot vector.

    Three cases, and the difference between the last two is the whole reason
    this function exists:

      "flooding;road_blocked" -> [1, 0, 1, 0]
      "none"                  -> [0, 0, 0, 0]   an explicit "I looked, nothing"
      ""                      -> None            nobody labelled this row
    """
    text = (value or "").strip().lower()
    if not text:
        return None
    vector = [0] * head.n_classes
    if text in {"none", "-"}:
        return vector
    for token in (t.strip() for t in text.replace(",", ";").split(";")):
        if not token or token in {"none", "-"}:
            continue
        index = head.index(token)
        if index == IGNORE:
            raise ValueError(f"unknown {head.name} label {token!r}; allowed: {', '.join(head.classes)}")
        vector[index] = 1
    return vector


@dataclass
class LabelSpaceSummary:
    """What `train.py` prints before it starts, so a bad CSV is obvious."""

    counts: dict[str, dict[str, int]] = field(default_factory=dict)
    #: Rows that carry a label for this head. For `hazard` a row labelled `none`
    #: counts here and contributes nothing to `counts`, which is exactly the
    #: distinction that matters when deciding whether a head has enough data.
    labelled: dict[str, int] = field(default_factory=dict)
    unlabelled: dict[str, int] = field(default_factory=dict)

    def lines(self) -> list[str]:
        out: list[str] = []
        for head in HEADS:
            counts = self.counts.get(head.name, {})
            total = self.labelled.get(head.name, sum(counts.values()))
            missing = self.unlabelled.get(head.name, 0)
            body = "  ".join(f"{name}={counts.get(name, 0)}" for name in head.classes)
            out.append(f"{head.name:<11} labelled={total:<5} unlabelled={missing:<5} {body}")
        return out
