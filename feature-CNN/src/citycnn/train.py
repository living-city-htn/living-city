"""
Train the scene head.

    python -m citycnn.train --config configs/default.yaml

Writes to `runs/<name>/`:

    best.pt        weights, config, label space, thresholds, fitted temperatures
    metrics.json   the val report for the selected epoch
    history.csv    per-epoch losses and val metric, for a quick sanity plot

The checkpoint carries its own label space and config. A checkpoint that outlives
a change to `labels.py` would otherwise emit hints with the right shape and the
wrong meaning, and `infer.py` refuses to load a mismatched one.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from dataclasses import asdict
from pathlib import Path

import torch

from .config import Config, add_arguments, from_args
from .dataset import build_loaders, summarise
from .engine import build_scheduler, collect_logits, pick_device, train_one_epoch
from .labels import HEADS
from .losses import MultiHeadLoss, class_weights
from .metrics import fit_temperatures, report_all, selection_metric
from .model import build_model


def seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def label_space_snapshot() -> dict[str, object]:
    return {
        head.name: {
            "classes": list(head.classes),
            "multilabel": head.multilabel,
            "ordinal": head.ordinal,
            "threshold": head.threshold,
        }
        for head in HEADS
    }


def train(config: Config, device_name: str | None = None, quiet: bool = False) -> Path:
    seed_everything(config.seed)
    device = pick_device(device_name)
    out_dir = config.resolve(config.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    loaders, buckets = build_loaders(config)
    summary = summarise(buckets["train"])

    def say(*args: object) -> None:
        if not quiet:
            print(*args)

    say(f"[train] device={device} backbone={config.backbone} image={config.image_size}px")
    say(f"[train] rows train={len(buckets['train'])} val={len(buckets.get('val', []))} test={len(buckets.get('test', []))}")
    for line in summary.lines():
        say("  " + line)
    for head in HEADS:
        if summary.labelled[head.name] == 0:
            say(f"[warn] {head.name} has no labels in train; its head will not learn and its hints will be noise")
        elif head.multilabel and sum(summary.counts[head.name].values()) == 0:
            say(f"[warn] {head.name} has rows but no positive examples; it can only learn to say nothing")
        elif not head.multilabel and len(summary.counts[head.name]) < 2:
            say(f"[warn] {head.name} has only one class present; it cannot discriminate")

    validation = loaders.get("val")
    if validation is None:
        say("[warn] no validation split; selecting on training data, which will overfit the choice")
        validation = loaders["train"]

    model = build_model(config).to(device)
    say(f"[train] parameters={model.parameter_count():,}")

    criterion = MultiHeadLoss(config, class_weights(buckets["train"], config)).to(device)
    optimiser = torch.optim.AdamW(model.parameters(), lr=config.lr, weight_decay=config.weight_decay)
    scheduler = build_scheduler(optimiser, config)

    history_path = out_dir / "history.csv"
    history = history_path.open("w", newline="", encoding="utf-8")
    writer = csv.writer(history)
    writer.writerow(["epoch", "lr", "train_loss", "val_metric", *(f"loss_{h.name}" for h in HEADS)])

    best_metric = -1.0
    best_epoch = -1
    best_state: dict[str, torch.Tensor] | None = None
    checkpoint_path = out_dir / "best.pt"

    try:
        for epoch in range(config.epochs):
            losses = train_one_epoch(model, loaders["train"], criterion, optimiser, device)
            logits, targets = collect_logits(model, validation, device)
            reports = report_all(logits, targets)
            metric = selection_metric(reports)

            writer.writerow([
                epoch,
                f"{optimiser.param_groups[0]['lr']:.2e}",
                f"{losses.get('total', 0.0):.4f}",
                f"{metric:.4f}",
                *(f"{losses.get(h.name, 0.0):.4f}" for h in HEADS),
            ])
            history.flush()

            marker = ""
            if metric > best_metric:
                best_metric, best_epoch = metric, epoch
                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
                marker = "  <- best"
            say(f"[{epoch:>3}] loss={losses.get('total', 0.0):.4f} val={metric:.4f}{marker}")

            scheduler.step()
            if epoch - best_epoch >= config.patience:
                say(f"[train] no improvement for {config.patience} epochs, stopping at {epoch}")
                break
    finally:
        history.close()

    if best_state is None:
        raise SystemExit("training produced no checkpoint")

    # Calibrate with the selected weights, not the last ones, or the temperatures
    # belong to a model nobody is going to ship.
    model.load_state_dict(best_state)
    logits, targets = collect_logits(model, validation, device)
    reports = report_all(logits, targets)
    temperatures = fit_temperatures(logits, targets)

    say(f"[train] best epoch {best_epoch}, val metric {best_metric:.4f}")
    for head in HEADS:
        say("  " + reports[head.name].line() + f"  T={temperatures[head.name]:.2f}")

    torch.save(
        {
            "format": 1,
            "model_version": config.model_version,
            "config": asdict(config),
            "label_space": label_space_snapshot(),
            "state_dict": best_state,
            "temperatures": temperatures,
            "thresholds": {head.name: head.threshold for head in HEADS},
            "val_metric": best_metric,
            "best_epoch": best_epoch,
        },
        checkpoint_path,
    )

    (out_dir / "metrics.json").write_text(
        json.dumps(
            {
                "model_version": config.model_version,
                "best_epoch": best_epoch,
                "selection_metric": best_metric,
                "temperatures": temperatures,
                "heads": {name: asdict(report) for name, report in reports.items()},
                "rows": {name: len(rows) for name, rows in buckets.items()},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    say(f"[train] wrote {checkpoint_path}")
    return checkpoint_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the scene-hint CNN")
    add_arguments(parser)
    parser.add_argument("--device", type=str, default=None, help="cpu, cuda, or leave unset to pick")
    args = parser.parse_args()
    train(from_args(args), device_name=args.device)


if __name__ == "__main__":
    main()
