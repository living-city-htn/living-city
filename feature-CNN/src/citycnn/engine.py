"""
Train and evaluate loops, shared by `train.py`, `evaluate.py` and the smoke test.

Nothing clever lives here. It is separate so that the one place that decides
"what does a forward pass over a split look like" is the same place for training,
for calibration, and for the final report - a mismatch between those is the
classic way to publish a validation number that does not exist.
"""

from __future__ import annotations

import torch
from torch import nn

from .labels import HEADS


def pick_device(requested: str | None = None) -> torch.device:
    if requested:
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def train_one_epoch(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    optimiser: torch.optim.Optimizer,
    device: torch.device,
    grad_clip: float = 5.0,
) -> dict[str, float]:
    model.train()
    totals: dict[str, float] = {}
    batches = 0

    for images, targets in loader:
        # BatchNorm1d in the trunk needs at least two rows. A trailing batch of
        # one happens on small label sets and is not worth a code path.
        if images.size(0) < 2:
            continue
        images = images.to(device, non_blocking=True)
        targets = {name: value.to(device, non_blocking=True) for name, value in targets.items()}

        optimiser.zero_grad(set_to_none=True)
        logits = model(images)
        loss, parts = criterion(logits, targets)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
        optimiser.step()

        batches += 1
        totals["total"] = totals.get("total", 0.0) + float(loss.detach())
        for name, value in parts.items():
            totals[name] = totals.get(name, 0.0) + value

    if batches == 0:
        raise SystemExit("no usable training batches; the split is smaller than two images")
    return {name: value / batches for name, value in totals.items()}


@torch.no_grad()
def collect_logits(
    model: nn.Module,
    loader,
    device: torch.device,
) -> tuple[dict[str, torch.Tensor], dict[str, torch.Tensor]]:
    """Raw (uncalibrated) logits and targets for a whole split, on the CPU."""
    model.eval()
    logit_parts: dict[str, list[torch.Tensor]] = {head.name: [] for head in HEADS}
    target_parts: dict[str, list[torch.Tensor]] = {head.name: [] for head in HEADS}

    for images, targets in loader:
        logits = model(images.to(device))
        for head in HEADS:
            logit_parts[head.name].append(logits[head.name].detach().cpu())
            target_parts[head.name].append(targets[head.name].detach().cpu())

    return (
        {name: torch.cat(parts) for name, parts in logit_parts.items()},
        {name: torch.cat(parts) for name, parts in target_parts.items()},
    )


def build_scheduler(optimiser: torch.optim.Optimizer, config) -> torch.optim.lr_scheduler.LRScheduler:
    """Linear warmup then cosine decay, expressed per epoch."""
    warmup = max(0, config.warmup_epochs)
    total = max(1, config.epochs)

    def factor(epoch: int) -> float:
        if epoch < warmup:
            return (epoch + 1) / (warmup + 1)
        import math

        progress = (epoch - warmup) / max(1, total - warmup)
        return 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))

    return torch.optim.lr_scheduler.LambdaLR(optimiser, factor)
