"""
End-to-end smoke test on synthetic images. No dataset required.

    python scripts/smoke_test.py

It paints ~150 crude images whose appearance actually correlates with their
labels (bright warm sky for golden hour, white speckles for snow, dark blobs for a
crowd, a blue band for flooding), then runs the real code path: label CSV ->
dataset -> train -> calibrate -> evaluate -> infer -> schema validation.

What it proves: the pipeline runs, the masked loss handles blank cells, the
checkpoint round-trips, and the emitted hints validate. What it does not prove:
anything at all about accuracy on photographs. The synthetic task is easy on
purpose, so a val metric near 1.0 here means the plumbing works and nothing more.

Run it after any change to labels.py, since that is the change that silently
breaks checkpoints.
"""

from __future__ import annotations

import csv
import random
import shutil
import sys
import tempfile
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from citycnn.labels import CSV_COLUMNS  # noqa: E402

SIZE = 128
COUNT = 150

LIGHTING_SKY = {
    "daylight": (150, 190, 235),
    "overcast": (170, 172, 175),
    "golden_hour": (235, 170, 95),
    "artificial_night": (35, 35, 60),
    "dark": (12, 12, 18),
}
CROWD_PEOPLE = {"empty": 0, "few": 2, "group": 6, "crowd": 16, "packed": 34}
GREENERY_PATCHES = {"none": 0, "trace": 1, "some": 4, "lush": 12}
BUILT_HEIGHT = {"none": 0, "low_rise": 0.18, "mid_rise": 0.40, "high_rise": 0.72}


def paint(path: Path, labels: dict[str, str], rng: random.Random) -> None:
    from PIL import Image, ImageDraw

    sky = LIGHTING_SKY[labels["lighting"]]
    image = Image.new("RGB", (SIZE, SIZE), sky)
    draw = ImageDraw.Draw(image)

    ground_shade = 60 if labels["lighting"] in {"artificial_night", "dark"} else 130
    draw.rectangle([0, int(SIZE * 0.66), SIZE, SIZE], fill=(ground_shade, ground_shade - 8, ground_shade - 14))

    height = BUILT_HEIGHT[labels["built_form"]]
    if height:
        x = 4
        while x < SIZE - 10:
            width = rng.randint(10, 24)
            top = int(SIZE * 0.66 - SIZE * height * rng.uniform(0.6, 1.0))
            shade = rng.randint(50, 110)
            draw.rectangle([x, top, x + width, int(SIZE * 0.66)], fill=(shade, shade, shade + 10))
            x += width + rng.randint(3, 9)

    for _ in range(GREENERY_PATCHES[labels["greenery"]]):
        cx, cy = rng.randint(0, SIZE), rng.randint(int(SIZE * 0.45), SIZE)
        radius = rng.randint(6, 16)
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(40 + rng.randint(0, 40), 110 + rng.randint(0, 60), 50))

    for _ in range(CROWD_PEOPLE[labels["crowd"]]):
        cx = rng.randint(2, SIZE - 4)
        cy = rng.randint(int(SIZE * 0.68), SIZE - 6)
        draw.ellipse([cx - 3, cy - 7, cx + 3, cy + 5], fill=(25, 25, 30))

    weather = labels["weather"]
    if weather == "snow":
        for _ in range(180):
            x, y = rng.randint(0, SIZE), rng.randint(0, SIZE)
            draw.point((x, y), fill=(250, 250, 255))
        draw.rectangle([0, int(SIZE * 0.72), SIZE, SIZE], fill=(225, 228, 235))
    elif weather == "rain":
        for _ in range(120):
            x, y = rng.randint(0, SIZE), rng.randint(0, SIZE)
            draw.line([x, y, x - 2, y + 7], fill=(190, 200, 215))
    elif weather == "fog":
        veil = Image.new("RGB", (SIZE, SIZE), (200, 200, 205))
        image = Image.blend(image, veil, 0.55)
        draw = ImageDraw.Draw(image)
    elif weather == "cloudy":
        for _ in range(5):
            cx, cy = rng.randint(0, SIZE), rng.randint(0, int(SIZE * 0.35))
            draw.ellipse([cx - 22, cy - 9, cx + 22, cy + 9], fill=(205, 205, 210))

    hazards = [h for h in labels["hazard"].split(";") if h and h != "none"]
    if "flooding" in hazards:
        draw.rectangle([0, int(SIZE * 0.78), SIZE, SIZE], fill=(70, 95, 140))
    if "fallen_tree" in hazards:
        draw.line([6, SIZE - 10, SIZE - 12, int(SIZE * 0.52)], fill=(85, 60, 35), width=9)
    if "road_blocked" in hazards:
        for i in range(0, SIZE, 18):
            draw.rectangle([i, int(SIZE * 0.70), i + 9, int(SIZE * 0.76)], fill=(230, 120, 30))
    if "power_outage" in hazards:
        draw.rectangle([0, 0, SIZE, int(SIZE * 0.66)], fill=(18, 18, 24))

    image.save(path, quality=88)


def build_dataset(root: Path, rng: random.Random) -> list[dict[str, str]]:
    from citycnn.labels import BUILT_FORM, CROWD, GREENERY, HAZARD, LIGHTING, SCENE, WEATHER

    images = root / "images"
    images.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, str]] = []

    for index in range(COUNT):
        hazard_count = rng.random()
        if hazard_count < 0.70:
            hazards = "none"
        elif hazard_count < 0.92:
            hazards = rng.choice(HAZARD.classes)
        else:
            hazards = ";".join(rng.sample(list(HAZARD.classes), 2))

        labels = {
            "crowd": rng.choice(CROWD.classes),
            "greenery": rng.choice(GREENERY.classes),
            "lighting": rng.choice(LIGHTING.classes),
            "weather": rng.choice(WEATHER.classes),
            "scene": rng.choice(SCENE.classes),
            "built_form": rng.choice(BUILT_FORM.classes),
            "hazard": hazards,
        }
        name = f"synth-{index:03d}.jpg"
        paint(images / name, labels, rng)

        row = {"image": f"images/{name}", "split": "", "note": "synthetic"}
        row.update(labels)
        # Blank out some cells on purpose: partial labelling is the normal case and
        # the masked loss has to survive it. `scene` is unlearnable from these
        # images anyway - it is drawn from nothing - so it is mostly blank, which
        # also exercises the "head with too few labels" warning.
        if rng.random() < 0.8:
            row["scene"] = ""
        if rng.random() < 0.25:
            row["built_form"] = ""
        if rng.random() < 0.15:
            row["hazard"] = ""
        rows.append(row)

    labels_dir = root / "labels"
    labels_dir.mkdir(parents=True, exist_ok=True)
    with (labels_dir / "labels.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(CSV_COLUMNS), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return rows


def main() -> None:
    from citycnn.config import Config
    from citycnn.infer import Predictor, prompt_block
    from citycnn.schema import validate
    from citycnn.train import train

    rng = random.Random(7)
    workspace = Path(tempfile.mkdtemp(prefix="citycnn-smoke-"))
    print(f"[smoke] workspace {workspace}")

    try:
        build_dataset(workspace, rng)
        print(f"[smoke] painted {COUNT} images")

        config = Config(
            data_root=str(workspace),
            labels_csv=str(workspace / "labels" / "labels.csv"),
            image_size=96,
            batch_size=16,
            epochs=4,
            warmup_epochs=1,
            patience=4,
            num_workers=0,
            out_dir=str(workspace / "run"),
            model_version="citycnn-smoke",
        )
        checkpoint = train(config)

        predictor = Predictor(checkpoint)
        sample = sorted((workspace / "images").glob("*.jpg"))[0]
        hints = predictor.hints(sample, image_ref="smoke/sample.jpg")

        problems = validate(hints.to_dict())
        if problems:
            raise SystemExit("[smoke] FAIL invalid hints:\n  - " + "\n  - ".join(problems))

        print("\n[smoke] hints for one image:")
        print(hints.to_json())
        print("\n[smoke] prompt block:")
        print(prompt_block(hints) or "(nothing above threshold)")
        print("\n[smoke] PASS")
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


if __name__ == "__main__":
    main()
