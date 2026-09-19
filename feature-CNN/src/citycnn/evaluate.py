"""
Evaluate a checkpoint, and optionally refit its temperatures and thresholds.

    python -m citycnn.evaluate --checkpoint runs/latest/best.pt --split val
    python -m citycnn.evaluate --checkpoint runs/latest/best.pt --calibrate

What to read in the output, in order of how often it is the actual problem:

  1. `n` per head. A head with n=4 has no measured accuracy, whatever the number
     next to it says. Label more before believing anything else on that row.
  2. macro F1, not accuracy. See metrics.py.
  3. The confusion matrix. Neighbouring confusions on an ordinal head are fine.
     `empty` read as `crowd`, or `daylight` read as `dark`, means the labels
     disagree with each other and two people labelled the same thing differently.
  4. ECE. Over ~0.1 the confidences are not usable as thresholds, so recalibrate
     before touching the architecture.

`--calibrate` refits per-head temperatures on the chosen split and sweeps a
threshold per head, then writes both back into the checkpoint. Run it on `val`.
Running it on `test` spends the only split that could still tell you the truth.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torch.nn import functional as F

from .checkpoint import load_checkpoint
from .config import PACKAGE_ROOT, Config
from .dataset import SceneDataset, read_rows, split_rows
from .engine import collect_logits, pick_device
from .labels import HEADS, IGNORE
from .metrics import fit_temperatures, report_all, selection_metric

#: Candidate thresholds for the sweep. Never below 0.30: a head that needs a
#: threshold that low is guessing, and the honest fix is more labels.
THRESHOLD_GRID = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85]


def build_split_loader(config: Config, split: str):
    from torch.utils.data import DataLoader

    rows = read_rows(config.resolve(config.labels_csv))
    buckets = split_rows(rows, config)
    if not buckets.get(split):
        raise SystemExit(f"split {split!r} is empty; available: " + ", ".join(k for k, v in buckets.items() if v))
    dataset = SceneDataset(buckets[split], config, train=False)
    return DataLoader(dataset, batch_size=config.batch_size, shuffle=False, num_workers=config.num_workers)


def sweep_thresholds(
    logits: dict[str, torch.Tensor],
    targets: dict[str, torch.Tensor],
    temperatures: dict[str, float],
) -> dict[str, float]:
    """
    Pick a per-head threshold that maximises usefulness, not F1.

    For single-label heads the threshold only decides whether a hint is emitted at
    all, so the objective is: among predictions we would emit, what fraction are
    right (precision), subject to still emitting at least half the time. A hint
    that is right 95% of the time but fires on one photo in twenty adds nothing to
    a prompt; one that fires always and is right 60% of the time actively misleads.

    For hazards the objective is plain F1: a missed flood and a false flood are
    both bad, and the civic layer sees the consequence either way.
    """
    out: dict[str, float] = {}
    for head in HEADS:
        prediction = logits[head.name].float() / temperatures[head.name]
        target = targets[head.name]

        if head.multilabel:
            rows = (target >= 0).all(dim=1)
            if int(rows.sum()) == 0:
                out[head.name] = head.threshold
                continue
            probabilities = torch.sigmoid(prediction[rows])
            truth = target[rows]
            best, best_score = head.threshold, -1.0
            for candidate in THRESHOLD_GRID:
                guess = (probabilities >= candidate).float()
                true_positive = float((guess * truth).sum())
                false_positive = float((guess * (1 - truth)).sum())
                false_negative = float(((1 - guess) * truth).sum())
                if true_positive == 0:
                    continue
                precision = true_positive / (true_positive + false_positive)
                recall = true_positive / (true_positive + false_negative)
                score = 2 * precision * recall / (precision + recall)
                if score > best_score:
                    best, best_score = candidate, score
            out[head.name] = best
            continue

        mask = target != IGNORE
        if int(mask.sum()) < 20:
            out[head.name] = head.threshold
            continue
        probabilities = F.softmax(prediction[mask], dim=1)
        confidence, guess = probabilities.max(dim=1)
        correct = guess == target[mask]

        best, best_score = head.threshold, -1.0
        for candidate in THRESHOLD_GRID:
            fires = confidence >= candidate
            coverage = float(fires.float().mean())
            if coverage < 0.5:
                continue
            precision = float(correct[fires].float().mean()) if bool(fires.any()) else 0.0
            if precision > best_score:
                best, best_score = candidate, precision
        out[head.name] = best
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Report a checkpoint against a split")
    parser.add_argument("--checkpoint", type=str, default="runs/latest/best.pt")
    parser.add_argument("--split", type=str, default="val", choices=["train", "val", "test"])
    parser.add_argument("--calibrate", action="store_true", help="refit temperatures and thresholds, then save")
    parser.add_argument("--confusion", action="store_true", help="print confusion matrices")
    parser.add_argument("--out", type=str, default=None, help="also write the report as JSON")
    parser.add_argument("--device", type=str, default=None)
    args = parser.parse_args()

    def resolve(value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else PACKAGE_ROOT / path

    checkpoint_path = resolve(args.checkpoint)
    device = pick_device(args.device)
    model, config, temperatures, thresholds = load_checkpoint(checkpoint_path, device)

    loader = build_split_loader(config, args.split)
    logits, targets = collect_logits(model, loader, device)

    if args.calibrate:
        if args.split == "test":
            print("[warn] calibrating on test; that split is no longer a held-out measurement")
        temperatures = fit_temperatures(logits, targets)
        thresholds = sweep_thresholds(logits, targets, temperatures)

    scaled = {name: logits[name].float() / temperatures[name] for name in logits}
    reports = report_all(scaled, targets)

    print(f"[eval] {checkpoint_path.name} on {args.split} ({config.backbone}, {config.model_version})")
    for head in HEADS:
        report = reports[head.name]
        print(
            "  " + report.line()
            + f"  T={temperatures[head.name]:.2f} thr={thresholds[head.name]:.2f}"
        )
        if report.per_class_f1:
            print("      " + "  ".join(f"{k}={v:.2f}" for k, v in report.per_class_f1.items()))
    print(f"[eval] selection metric {selection_metric(reports):.4f}")

    if args.confusion:
        for head in HEADS:
            report = reports[head.name]
            if head.multilabel or not report.confusion:
                continue
            print(f"\n{head.name} (rows = truth, columns = prediction)")
            width = max(len(name) for name in head.classes) + 1
            print(" " * width + " ".join(f"{name[:6]:>7}" for name in head.classes))
            for name, row in zip(head.classes, report.confusion):
                print(f"{name:<{width}}" + " ".join(f"{value:>7}" for value in row))

    if args.calibrate:
        blob = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        blob["temperatures"] = temperatures
        blob["thresholds"] = thresholds
        torch.save(blob, checkpoint_path)
        print(f"[eval] wrote temperatures and thresholds back into {checkpoint_path.name}")

    if args.out:
        from dataclasses import asdict

        out_path = resolve(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(
                {
                    "checkpoint": checkpoint_path.name,
                    "split": args.split,
                    "temperatures": temperatures,
                    "thresholds": thresholds,
                    "heads": {name: asdict(report) for name, report in reports.items()},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"[eval] wrote {out_path}")


if __name__ == "__main__":
    main()
