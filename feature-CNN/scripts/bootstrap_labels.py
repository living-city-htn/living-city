"""
Build or top up `data/labels/labels.csv`.

    python scripts/bootstrap_labels.py                 # scan data/raw
    python scripts/bootstrap_labels.py --from-seed      # also pull in the repo's seed photos
    python scripts/bootstrap_labels.py --stats          # just report what is labelled

Idempotent: rows that already exist keep every label they have. New images are
appended with blank cells. Run it again after dropping more photos in.

Labelling advice, learned the hard way on every small vision dataset:

  * Label one head across the whole set before starting the next. Switching heads
    every photo is where inconsistent labels come from, and inconsistent labels
    look exactly like a broken model.
  * `weather` and `lighting` first. They are fast, unambiguous, and they are the
    two heads that most often correct a language model, which has no reliable
    sense of whether a photo was taken at night.
  * Leave a cell blank when you are not sure. A blank costs nothing; a coin-flip
    label costs a point of accuracy and cannot be found again afterwards.
  * `hazard` gets `none` when you have looked and there is nothing. Blank means
    you did not look. The loss treats those differently and so should you.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parent
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from citycnn.labels import CSV_COLUMNS, HEADS  # noqa: E402

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

SEED_JSON = REPO_ROOT / "packages" / "fixtures" / "data" / "posts.seed.json"
SEED_IMAGES = REPO_ROOT / "apps" / "web" / "public" / "seed"


def read_existing(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return {row["image"]: row for row in csv.DictReader(handle) if (row.get("image") or "").strip()}


def copy_seed_images(data_root: Path) -> list[tuple[str, str]]:
    """
    Copy the committed seed photos into `data/raw/seed/` and return (path, note).

    These five are the demo's own photos. They are worth labelling first: if a hint
    is wrong on the scripted incident post, that is the one place it would be
    visible on stage.
    """
    if not SEED_IMAGES.exists():
        print(f"[bootstrap] no seed images at {SEED_IMAGES}, skipping --from-seed")
        return []

    notes: dict[str, str] = {}
    if SEED_JSON.exists():
        seed = json.loads(SEED_JSON.read_text(encoding="utf-8"))
        for post in seed.get("posts", []):
            url = post.get("image_url")
            if url:
                notes[Path(url).name] = f"{post['id']} {post.get('community_id', '')}".strip()

    target = data_root / "seed"
    target.mkdir(parents=True, exist_ok=True)
    out: list[tuple[str, str]] = []
    for image in sorted(SEED_IMAGES.iterdir()):
        if image.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        destination = target / image.name
        if not destination.exists():
            shutil.copy2(image, destination)
        out.append((f"seed/{image.name}", notes.get(image.name, "repo seed photo")))
    return out


def scan(data_root: Path) -> list[str]:
    if not data_root.exists():
        return []
    return sorted(
        p.relative_to(data_root).as_posix()
        for p in data_root.rglob("*")
        if p.suffix.lower() in IMAGE_SUFFIXES
    )


def print_stats(rows: dict[str, dict[str, str]]) -> None:
    total = len(rows)
    print(f"[bootstrap] {total} rows")
    for head in HEADS:
        filled = sum(1 for row in rows.values() if (row.get(head.name) or "").strip())
        bar = "#" * int(20 * filled / total) if total else ""
        print(f"  {head.name:<11} {filled:>5}/{total:<5} {bar}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or top up the label CSV")
    parser.add_argument("--data-root", type=str, default="data/raw")
    parser.add_argument("--labels", type=str, default="data/labels/labels.csv")
    parser.add_argument("--from-seed", action="store_true", help="copy in apps/web/public/seed photos")
    parser.add_argument("--stats", action="store_true", help="report coverage and exit")
    args = parser.parse_args()

    data_root = PACKAGE_ROOT / args.data_root
    labels_path = PACKAGE_ROOT / args.labels
    existing = read_existing(labels_path)

    if args.stats:
        if not existing:
            raise SystemExit(f"no rows in {labels_path}")
        print_stats(existing)
        return

    notes: dict[str, str] = {}
    if args.from_seed:
        for image, note in copy_seed_images(data_root):
            notes[image] = note

    images = scan(data_root)
    if not images:
        raise SystemExit(
            f"no images under {data_root}\n"
            f"drop photos there (subfolders are fine), or pass --from-seed"
        )

    added = 0
    for image in images:
        if image in existing:
            continue
        existing[image] = {"image": image, "split": "", "note": notes.get(image, "")}
        added += 1

    labels_path.parent.mkdir(parents=True, exist_ok=True)
    with labels_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(CSV_COLUMNS), extrasaction="ignore")
        writer.writeheader()
        for image in sorted(existing):
            row = {column: existing[image].get(column, "") or "" for column in CSV_COLUMNS}
            row["image"] = image
            writer.writerow(row)

    print(f"[bootstrap] {labels_path.relative_to(PACKAGE_ROOT)}: {len(existing)} rows ({added} new)")
    print_stats(existing)
    print("\nlabel values:")
    for head in HEADS:
        suffix = "  (semicolon-separated, or `none`)" if head.multilabel else ""
        print(f"  {head.name:<11} {', '.join(head.classes)}{suffix}")


if __name__ == "__main__":
    main()
