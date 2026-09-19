"""
Configuration: one YAML file, every key overridable from the command line.

`python -m citycnn.train --config configs/default.yaml --epochs 40 --lr 1e-3`

YAML is optional. If PyYAML is not installed the defaults below still work, so a
teammate can run the smoke test without a full environment.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Config:
    # ---- data ----
    #: Directory that `image` paths in the label CSV are relative to.
    data_root: str = "data/raw"
    labels_csv: str = "data/labels/labels.csv"
    image_size: int = 160
    #: Used only for rows whose `split` column is blank.
    val_fraction: float = 0.2
    test_fraction: float = 0.0
    #: Same seed everywhere: split, init, and the sampler. One number to change
    #: when a result looks too good.
    seed: int = 20260919

    # ---- model ----
    #: "scratch" is the custom net in model.py and the default, because a custom
    #: CNN is the point. "resnet18" swaps in a pretrained torchvision backbone
    #: and will beat it on any dataset under a couple of thousand images - use it
    #: when you need the hints to actually be right, and say which one produced
    #: a number before quoting it.
    backbone: str = "scratch"
    width: int = 32  # channels in the first stage; stages double from here
    dropout: float = 0.2

    # ---- optimisation ----
    epochs: int = 30
    batch_size: int = 32
    lr: float = 3e-4
    weight_decay: float = 0.01
    warmup_epochs: int = 2
    label_smoothing: float = 0.05
    #: Stop when the selection metric has not improved for this many epochs.
    patience: int = 8
    #: Inverse-frequency class weights, clamped so one rare class cannot own the
    #: gradient. 1.0 = full inverse frequency, 0.0 = no weighting.
    class_weight_strength: float = 0.7
    num_workers: int = 0  # 0 on Windows; the dataset is small enough not to care

    # ---- augmentation ----
    #: Deliberately mild on colour. The lighting and weather heads read colour
    #: temperature and contrast directly, so a strong ColorJitter teaches the
    #: model that golden hour and overcast are the same thing.
    jitter_brightness: float = 0.15
    jitter_contrast: float = 0.15
    jitter_saturation: float = 0.10
    jitter_hue: float = 0.02
    rotation_degrees: float = 6.0
    random_crop_scale_min: float = 0.7

    # ---- output ----
    out_dir: str = "runs/latest"
    model_version: str = "citycnn-0.1.0"

    def resolve(self, value: str) -> Path:
        """Resolve a config path against the package root, not the shell's cwd."""
        path = Path(value)
        return path if path.is_absolute() else (PACKAGE_ROOT / path)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore[import-not-found]
    except ModuleNotFoundError:
        print(f"[config] PyYAML missing, ignoring {path.name} and using defaults")
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def add_arguments(parser: argparse.ArgumentParser) -> None:
    """Every config field becomes `--field-name`, typed from its default."""
    parser.add_argument("--config", type=str, default=None, help="path to a YAML config")
    for f in fields(Config):
        flag = "--" + f.name.replace("_", "-")
        if f.type is bool or isinstance(f.default, bool):
            parser.add_argument(flag, dest=f.name, action="store_true", default=None)
        else:
            kind = {int: int, float: float, str: str}[type(f.default)]
            parser.add_argument(flag, dest=f.name, type=kind, default=None)


def from_args(args: argparse.Namespace) -> Config:
    data: dict[str, Any] = {}
    if getattr(args, "config", None):
        data.update(load_yaml(Path(args.config)))
    for f in fields(Config):
        value = getattr(args, f.name, None)
        if value is not None:
            data[f.name] = value
    known = {f.name for f in fields(Config)}
    unknown = set(data) - known
    if unknown:
        raise SystemExit(f"unknown config keys: {', '.join(sorted(unknown))}")
    return Config(**data)
