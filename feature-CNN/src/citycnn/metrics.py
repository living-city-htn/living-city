"""
Metrics, and the temperature calibration that makes `confidence` mean something.

Accuracy is the wrong headline number here. With 80% `clear` weather, a model
that always says `clear` scores 0.8 and is useless, so the selection metric in
`train.py` is macro F1 (every class counts the same) averaged over heads that
have labels. For the ordinal heads we also report mean absolute class distance:
confusing `group` with `crowd` is a near miss, confusing `empty` with `packed` is
not, and macro F1 cannot tell those apart.

Calibration matters more than usual. `SceneHints.confidence` is read by an LLM
and thresholded per head, so an uncalibrated 0.98 that is right 70% of the time
does active harm. One temperature per head, fitted on val by minimising NLL, is
the cheapest fix that works, and it cannot change which class wins - only how
sure the model claims to be.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import torch
from torch.nn import functional as F

from .labels import HEADS, Head, IGNORE


@dataclass
class HeadReport:
    name: str
    support: int = 0
    accuracy: float = 0.0
    macro_f1: float = 0.0
    #: Ordinal heads only: mean absolute distance between predicted and true class.
    mean_distance: float | None = None
    #: Expected calibration error, 10 bins.
    ece: float = 0.0
    per_class_f1: dict[str, float] = field(default_factory=dict)
    confusion: list[list[int]] = field(default_factory=list)

    def line(self) -> str:
        distance = "" if self.mean_distance is None else f" dist={self.mean_distance:.2f}"
        return (
            f"{self.name:<11} n={self.support:<5} acc={self.accuracy:.3f} "
            f"macroF1={self.macro_f1:.3f}{distance} ece={self.ece:.3f}"
        )


def _f1_from_counts(true_positive: int, false_positive: int, false_negative: int) -> float:
    if true_positive == 0:
        return 0.0
    precision = true_positive / (true_positive + false_positive)
    recall = true_positive / (true_positive + false_negative)
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def _ece(confidences: torch.Tensor, correct: torch.Tensor, bins: int = 10) -> float:
    if confidences.numel() == 0:
        return 0.0
    edges = torch.linspace(0.0, 1.0, bins + 1)
    total = 0.0
    for i in range(bins):
        low, high = edges[i], edges[i + 1]
        mask = (confidences > low) & (confidences <= high) if i > 0 else (confidences <= high)
        if not bool(mask.any()):
            continue
        share = float(mask.float().mean())
        total += share * abs(float(correct[mask].float().mean()) - float(confidences[mask].mean()))
    return total


def single_head_report(head: Head, logits: torch.Tensor, targets: torch.Tensor) -> HeadReport:
    report = HeadReport(name=head.name)
    mask = targets != IGNORE
    report.support = int(mask.sum())
    if report.support == 0:
        return report

    logits, targets = logits[mask], targets[mask]
    probabilities = F.softmax(logits, dim=1)
    confidence, prediction = probabilities.max(dim=1)

    report.accuracy = float((prediction == targets).float().mean())
    report.ece = _ece(confidence, prediction == targets)

    n = head.n_classes
    confusion = torch.zeros(n, n, dtype=torch.long)
    for true, guess in zip(targets.tolist(), prediction.tolist()):
        confusion[true][guess] += 1
    report.confusion = confusion.tolist()

    f1s: list[float] = []
    for index, name in enumerate(head.classes):
        true_positive = int(confusion[index][index])
        false_positive = int(confusion[:, index].sum()) - true_positive
        false_negative = int(confusion[index, :].sum()) - true_positive
        if true_positive + false_negative == 0:
            continue  # class absent from this split; averaging it in would be a lie
        score = _f1_from_counts(true_positive, false_positive, false_negative)
        report.per_class_f1[name] = score
        f1s.append(score)
    report.macro_f1 = sum(f1s) / len(f1s) if f1s else 0.0

    if head.ordinal:
        report.mean_distance = float((prediction - targets).abs().float().mean())
    return report


def multilabel_report(head: Head, logits: torch.Tensor, targets: torch.Tensor) -> HeadReport:
    """Hazards: per-class F1 at the head's threshold, plus a micro accuracy."""
    report = HeadReport(name=head.name)
    mask = targets >= 0
    rows = mask.all(dim=1)
    report.support = int(rows.sum())
    if report.support == 0:
        return report

    probabilities = torch.sigmoid(logits[rows])
    truth = targets[rows]
    predicted = (probabilities >= head.threshold).float()

    report.accuracy = float((predicted == truth).float().mean())
    report.ece = _ece(probabilities.flatten(), (predicted == truth).flatten())

    f1s: list[float] = []
    for index, name in enumerate(head.classes):
        true_positive = int(((predicted[:, index] == 1) & (truth[:, index] == 1)).sum())
        false_positive = int(((predicted[:, index] == 1) & (truth[:, index] == 0)).sum())
        false_negative = int(((predicted[:, index] == 0) & (truth[:, index] == 1)).sum())
        if true_positive + false_negative == 0:
            continue
        score = _f1_from_counts(true_positive, false_positive, false_negative)
        report.per_class_f1[name] = score
        f1s.append(score)
    report.macro_f1 = sum(f1s) / len(f1s) if f1s else 0.0
    return report


def report_all(logits: dict[str, torch.Tensor], targets: dict[str, torch.Tensor]) -> dict[str, HeadReport]:
    out: dict[str, HeadReport] = {}
    for head in HEADS:
        if head.multilabel:
            out[head.name] = multilabel_report(head, logits[head.name], targets[head.name])
        else:
            out[head.name] = single_head_report(head, logits[head.name], targets[head.name])
    return out


def selection_metric(reports: dict[str, HeadReport]) -> float:
    """
    One number for early stopping: macro F1 averaged over heads that have labels,
    each scaled by the head's weight so `hazard` and `crowd` steer the choice.
    """
    total = 0.0
    divisor = 0.0
    for head in HEADS:
        report = reports[head.name]
        if report.support == 0:
            continue
        total += head.weight * report.macro_f1
        divisor += head.weight
    return total / divisor if divisor else 0.0


def fit_temperatures(
    logits: dict[str, torch.Tensor],
    targets: dict[str, torch.Tensor],
    steps: int = 200,
) -> dict[str, float]:
    """
    One temperature per head, fitted on the validation split.

    Scaling logits by 1/T cannot reorder classes, so accuracy and F1 are
    untouched and only the confidences move. A head with fewer than 20 labelled
    validation rows keeps T=1: fitting a temperature on 8 examples overfits the
    temperature, which is a funny way to lose.
    """
    out: dict[str, float] = {}
    for head in HEADS:
        prediction = logits[head.name]
        target = targets[head.name]

        if head.multilabel:
            rows = (target >= 0).all(dim=1)
            usable = int(rows.sum())
            prediction, target = prediction[rows], target[rows]
        else:
            mask = target != IGNORE
            usable = int(mask.sum())
            prediction, target = prediction[mask], target[mask]

        if usable < 20:
            out[head.name] = 1.0
            continue

        log_t = torch.zeros(1, requires_grad=True)
        optimiser = torch.optim.LBFGS([log_t], lr=0.1, max_iter=steps)

        def closure() -> torch.Tensor:
            optimiser.zero_grad()
            scaled = prediction / torch.exp(log_t)
            loss = (
                F.binary_cross_entropy_with_logits(scaled, target)
                if head.multilabel
                else F.cross_entropy(scaled, target)
            )
            loss.backward()
            return loss

        optimiser.step(closure)  # type: ignore[arg-type]
        out[head.name] = float(torch.exp(log_t.detach()).clamp(0.25, 10.0))
    return out
