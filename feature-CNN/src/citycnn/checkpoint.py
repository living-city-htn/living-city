"""
Loading a checkpoint, with the one check that matters.

A `.pt` file stores the label space it was trained against. If `labels.py` has
changed since - a class inserted in the middle of a tuple, a head renamed - the
weights still load and every hint comes out confidently mislabelled. That failure
is silent and it is exactly the kind of thing that survives a rehearsal and
breaks on stage, so it is a hard error here.
"""

from __future__ import annotations

from dataclasses import fields
from pathlib import Path
from typing import Any

import torch

from .config import Config
from .labels import HEADS


def load_checkpoint(path: Path, device: torch.device) -> tuple[Any, Config, dict[str, float], dict[str, float]]:
    """Returns (model, config, temperatures, thresholds)."""
    from .model import build_model

    if not path.exists():
        raise SystemExit(f"no checkpoint at {path}; train one with `python -m citycnn.train`")

    blob = torch.load(path, map_location=device, weights_only=False)

    stored = blob.get("label_space", {})
    known = {f.name for f in fields(Config)}
    problems: list[str] = []
    for head in HEADS:
        entry = stored.get(head.name)
        if entry is None:
            problems.append(f"head {head.name} is missing from the checkpoint")
        elif tuple(entry.get("classes", ())) != head.classes:
            problems.append(
                f"head {head.name} classes differ\n"
                f"    checkpoint: {entry.get('classes')}\n"
                f"    labels.py:  {list(head.classes)}"
            )
    for name in stored:
        if name not in {h.name for h in HEADS}:
            problems.append(f"checkpoint has head {name!r}, which labels.py no longer defines")
    if problems:
        raise SystemExit(
            "checkpoint label space does not match labels.py:\n  - " + "\n  - ".join(problems)
            + "\nretrain, or check out the commit the checkpoint was trained on"
        )

    config = Config(**{k: v for k, v in blob.get("config", {}).items() if k in known})
    model = build_model(config).to(device)
    model.load_state_dict(blob["state_dict"])
    model.eval()

    temperatures = {head.name: float(blob.get("temperatures", {}).get(head.name, 1.0)) for head in HEADS}
    thresholds = {head.name: float(blob.get("thresholds", {}).get(head.name, head.threshold)) for head in HEADS}
    config.model_version = blob.get("model_version", config.model_version)
    return model, config, temperatures, thresholds
