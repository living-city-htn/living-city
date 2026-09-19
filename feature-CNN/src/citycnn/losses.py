"""
Masked multi-head loss.

Two things make this different from a stock multi-task loss:

  * **Partial labels.** Any cell in the CSV may be blank. A blank single-label
    cell is `IGNORE` and cross-entropy skips it for free; a blank hazard row is
    all -1 and needs an explicit mask, because BCE has no ignore_index.
  * **Skewed classes.** Real labels will be roughly 80% `clear` weather and 95%
    no hazard. Without weighting, the model learns the prior, scores 95%, and
    tells Call A nothing. Class weights come from inverse frequency, damped by
    `class_weight_strength` and clamped, because full inverse frequency on a class
    with three examples makes those three examples the entire gradient.
"""

from __future__ import annotations

import torch
from torch import nn
from torch.nn import functional as F

from .config import Config
from .dataset import Row
from .labels import HEADS, HEADS_BY_NAME, IGNORE

#: A class cannot be worth more than this many times the average class.
MAX_CLASS_WEIGHT = 8.0


def class_weights(rows: list[Row], config: Config) -> dict[str, torch.Tensor]:
    """
    Per-head weights from the training rows.

    Single-label heads get a `weight` vector for cross-entropy. The hazard head
    gets a `pos_weight` vector for BCE: negatives outnumber positives about
    twenty to one, so without it the model simply never fires.
    """
    out: dict[str, torch.Tensor] = {}
    strength = max(0.0, min(1.0, config.class_weight_strength))

    for head in HEADS:
        if head.multilabel:
            positives = torch.zeros(head.n_classes)
            labelled = 0
            for row in rows:
                vector = row.multi[head.name]
                if vector is None:
                    continue
                labelled += 1
                positives += torch.tensor([float(v) for v in vector])
            negatives = torch.clamp(torch.tensor(float(labelled)) - positives, min=1.0)
            raw = negatives / torch.clamp(positives, min=1.0)
            out[head.name] = torch.clamp(raw.pow(strength), max=MAX_CLASS_WEIGHT)
            continue

        counts = torch.zeros(head.n_classes)
        for row in rows:
            index = row.single[head.name]
            if index != IGNORE:
                counts[index] += 1
        present = counts > 0
        if not bool(present.any()):
            #: Head is entirely unlabelled. Uniform weights; the loss will be
            #: zero for it anyway, and train.py prints a warning.
            out[head.name] = torch.ones(head.n_classes)
            continue
        mean = counts[present].mean()
        raw = torch.where(present, mean / torch.clamp(counts, min=1.0), torch.ones_like(counts))
        out[head.name] = torch.clamp(raw.pow(strength), max=MAX_CLASS_WEIGHT)
    return out


class MultiHeadLoss(nn.Module):
    """Sum of per-head losses, each scaled by the head's `weight` in labels.py."""

    def __init__(self, config: Config, weights: dict[str, torch.Tensor]):
        super().__init__()
        self.smoothing = config.label_smoothing
        for name, tensor in weights.items():
            self.register_buffer(f"w_{name}", tensor)

    def _weight(self, name: str) -> torch.Tensor:
        return getattr(self, f"w_{name}")

    def forward(
        self,
        logits: dict[str, torch.Tensor],
        targets: dict[str, torch.Tensor],
    ) -> tuple[torch.Tensor, dict[str, float]]:
        total = logits[HEADS[0].name].new_zeros(())
        parts: dict[str, float] = {}

        for head in HEADS:
            prediction = logits[head.name]
            target = targets[head.name]

            if head.multilabel:
                mask = target >= 0
                if not bool(mask.any()):
                    continue
                loss = F.binary_cross_entropy_with_logits(
                    prediction[mask],
                    target[mask],
                    pos_weight=self._weight(head.name).to(prediction.device).expand_as(target)[mask],
                    reduction="mean",
                )
            else:
                if not bool((target != IGNORE).any()):
                    continue
                loss = F.cross_entropy(
                    prediction,
                    target,
                    weight=self._weight(head.name).to(prediction.device),
                    ignore_index=IGNORE,
                    label_smoothing=self.smoothing,
                )

            parts[head.name] = float(loss.detach())
            total = total + HEADS_BY_NAME[head.name].weight * loss

        return total, parts
