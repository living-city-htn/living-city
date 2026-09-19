"""
The dataset: a CSV of partially labelled images.

`data/labels/labels.csv` has one row per image and one column per head. A blank
cell means "not labelled", which is different from a cell reading `none`, and the
difference survives all the way into the loss. See `labels.parse_multilabel`.

Why a CSV and not a folder-per-class tree: an image has seven labels at once, so
a tree would need seven copies of every photo. A CSV also lets two people label
different columns of the same row in different sittings, which is how this will
actually get labelled.
"""

from __future__ import annotations

import csv
import hashlib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .labels import CSV_COLUMNS, HEADS, IGNORE, LabelSpaceSummary, parse_multilabel


@dataclass
class Row:
    image: str
    #: head name -> class index, or IGNORE
    single: dict[str, int]
    #: hazard -> multi-hot list, or None when unlabelled
    multi: dict[str, list[int] | None]
    split: str


def read_rows(csv_path: Path) -> list[Row]:
    if not csv_path.exists():
        raise SystemExit(
            f"no label file at {csv_path}\n"
            "run `python scripts/bootstrap_labels.py` to generate a skeleton, "
            "or copy data/labels/labels.example.csv"
        )

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        missing = [c for c in ("image", *(h.name for h in HEADS)) if c not in header]
        if missing:
            raise SystemExit(
                f"{csv_path.name} is missing columns: {', '.join(missing)}\n"
                f"expected header: {','.join(CSV_COLUMNS)}"
            )
        rows: list[Row] = []
        for line_number, record in enumerate(reader, start=2):
            image = (record.get("image") or "").strip()
            if not image or image.startswith("#"):
                continue
            single: dict[str, int] = {}
            multi: dict[str, list[int] | None] = {}
            for head in HEADS:
                cell = (record.get(head.name) or "").strip()
                if head.multilabel:
                    try:
                        multi[head.name] = parse_multilabel(cell, head)
                    except ValueError as error:
                        raise SystemExit(f"{csv_path.name}:{line_number}: {error}") from error
                else:
                    index = head.index(cell)
                    if index == IGNORE and cell:
                        raise SystemExit(
                            f"{csv_path.name}:{line_number}: {cell!r} is not a {head.name} label; "
                            f"allowed: {', '.join(head.classes)}"
                        )
                    single[head.name] = index
            split = (record.get("split") or "").strip().lower()
            rows.append(Row(image=image, single=single, multi=multi, split=split))

    if not rows:
        raise SystemExit(f"{csv_path.name} has a header but no rows")
    return rows


def summarise(rows: list[Row]) -> LabelSpaceSummary:
    """Per-head label counts. `train.py` prints this so a bad CSV is obvious."""
    summary = LabelSpaceSummary()
    for head in HEADS:
        counts: Counter[str] = Counter()
        labelled = 0
        unlabelled = 0
        for row in rows:
            if head.multilabel:
                vector = row.multi[head.name]
                if vector is None:
                    unlabelled += 1
                    continue
                labelled += 1
                for i, bit in enumerate(vector):
                    if bit:
                        counts[head.classes[i]] += 1
            else:
                index = row.single[head.name]
                if index == IGNORE:
                    unlabelled += 1
                else:
                    labelled += 1
                    counts[head.classes[index]] += 1
        summary.counts[head.name] = dict(counts)
        summary.labelled[head.name] = labelled
        summary.unlabelled[head.name] = unlabelled
    return summary


def split_rows(rows: list[Row], config: Config) -> dict[str, list[Row]]:
    """
    Honour an explicit `split` column; assign the rest deterministically.

    Deterministic per *image path*, not per position in the file, so adding rows
    in the middle of the CSV does not silently move an old image from train to
    val and inflate the next validation score.
    """
    buckets: dict[str, list[Row]] = {"train": [], "val": [], "test": []}
    val_cut = config.val_fraction
    test_cut = val_cut + config.test_fraction

    for row in rows:
        if row.split in buckets:
            buckets[row.split].append(row)
            continue
        digest = hashlib.sha1(f"{config.seed}:{row.image}".encode()).digest()
        position = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
        if position < val_cut:
            buckets["val"].append(row)
        elif position < test_cut:
            buckets["test"].append(row)
        else:
            buckets["train"].append(row)
    return buckets


class SceneDataset:
    """
    Torch `Dataset` over `Row`s.

    Yields `(image_tensor, targets)` where targets holds one entry per head: a
    long scalar for the single-label heads (IGNORE when unlabelled) and a float
    vector for hazards (all -1 when unlabelled, which the masked BCE reads as
    "skip this row").
    """

    def __init__(self, rows: list[Row], config: Config, train: bool):
        from .transforms import build_transforms

        self.rows = rows
        self.root = config.resolve(config.data_root)
        self.transform = build_transforms(config, train)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int):
        import torch
        from PIL import Image

        row = self.rows[index]
        with Image.open(self.root / row.image) as handle:
            image = handle.convert("RGB")
        tensor = self.transform(image)

        targets = {}
        for head in HEADS:
            if head.multilabel:
                vector = row.multi[head.name]
                values = [-1.0] * head.n_classes if vector is None else [float(v) for v in vector]
                targets[head.name] = torch.tensor(values, dtype=torch.float32)
            else:
                targets[head.name] = torch.tensor(row.single[head.name], dtype=torch.long)
        return tensor, targets


def build_loaders(config: Config):
    """Loaders and row buckets for every non-empty split."""
    from torch.utils.data import DataLoader

    rows = read_rows(config.resolve(config.labels_csv))
    buckets = split_rows(rows, config)
    loaders = {}
    for name, split in buckets.items():
        if not split:
            continue
        dataset = SceneDataset(split, config, train=(name == "train"))
        loaders[name] = DataLoader(
            dataset,
            batch_size=config.batch_size,
            shuffle=(name == "train"),
            num_workers=config.num_workers,
            drop_last=(name == "train" and len(split) > config.batch_size),
        )
    if "train" not in loaders:
        raise SystemExit("every row landed outside the train split; check val_fraction and the split column")
    return loaders, buckets
