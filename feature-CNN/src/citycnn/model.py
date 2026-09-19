"""
`CitySceneNet`: a small multi-head CNN, written from scratch.

Shape of the problem: a few hundred to a few thousand phone photos, seven labels
per image, and it has to run inference on a laptop in well under a second so it
could sit in front of Call A without eating the latency budget in docs/04
section 8 (Call A inline under 3 seconds).

Design, and why each part is there:

  * Four stages at 32 / 64 / 128 / 256 channels on a 160px input. ~2.3M
    parameters. Small enough to train on CPU in minutes, deep enough that stage 4
    sees most of the frame, which the `crowd` and `built_form` heads need.
  * Pre-activation residual blocks. Not for depth - it is a shallow net - but
    because they make the thing trainable without a learning-rate search, and
    there is no time for a learning-rate search.
  * Squeeze-excitation after each stage. This is the one non-obvious choice and
    it is here for `lighting` and `weather`: both are global, low-frequency
    properties of the image, and channel attention is a cheap way to let a head
    read "the whole frame is warm and dim" instead of hunting for it in local
    features.
  * Concatenated average *and* max pooling into the trunk. Average pooling
    answers "how much of the frame is greenery"; max pooling answers "is there a
    fallen tree anywhere in the frame". The heads need both, and the hazard head
    needs max in particular.
  * Independent linear heads off a shared trunk. No head talks to another. If
    `weather` is wrong, `crowd` is still usable, which matters because a hint
    block is allowed to be partial.

`backbone="resnet18"` swaps the whole feature extractor for a pretrained
torchvision one and keeps the same trunk and heads. On a small hand-labelled set
it will win by a wide margin. Both are here on purpose: the scratch net is the
thing being built, the pretrained one is the honest baseline it has to beat
before anyone quotes its numbers.
"""

from __future__ import annotations

import torch
from torch import nn

from .config import Config
from .labels import HEADS


class SqueezeExcite(nn.Module):
    """Channel attention. See the module docstring for why this is not optional."""

    def __init__(self, channels: int, reduction: int = 8):
        super().__init__()
        hidden = max(8, channels // reduction)
        self.fc1 = nn.Conv2d(channels, hidden, kernel_size=1)
        self.fc2 = nn.Conv2d(hidden, channels, kernel_size=1)
        self.act = nn.SiLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        weights = x.mean(dim=(2, 3), keepdim=True)
        weights = self.fc2(self.act(self.fc1(weights)))
        return x * torch.sigmoid(weights)


class ResBlock(nn.Module):
    """Pre-activation residual block, 3x3 twice, optional stride on the first."""

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1):
        super().__init__()
        self.norm1 = nn.BatchNorm2d(in_channels)
        self.conv1 = nn.Conv2d(in_channels, out_channels, 3, stride=stride, padding=1, bias=False)
        self.norm2 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False)
        self.act = nn.SiLU(inplace=True)
        self.skip: nn.Module = nn.Identity()
        if stride != 1 or in_channels != out_channels:
            self.skip = nn.Conv2d(in_channels, out_channels, 1, stride=stride, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.conv1(self.act(self.norm1(x)))
        out = self.conv2(self.act(self.norm2(out)))
        return out + self.skip(x)


class ScratchBackbone(nn.Module):
    """The custom feature extractor. Returns a (B, C) vector."""

    def __init__(self, width: int = 32):
        super().__init__()
        c1, c2, c3, c4 = width, width * 2, width * 4, width * 8
        self.stem = nn.Sequential(
            nn.Conv2d(3, c1, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(c1),
            nn.SiLU(inplace=True),
        )
        self.stage1 = nn.Sequential(ResBlock(c1, c1), SqueezeExcite(c1))
        self.stage2 = nn.Sequential(ResBlock(c1, c2, stride=2), ResBlock(c2, c2), SqueezeExcite(c2))
        self.stage3 = nn.Sequential(ResBlock(c2, c3, stride=2), ResBlock(c3, c3), SqueezeExcite(c3))
        self.stage4 = nn.Sequential(ResBlock(c3, c4, stride=2), ResBlock(c4, c4), SqueezeExcite(c4))
        self.out_norm = nn.BatchNorm2d(c4)
        self.act = nn.SiLU(inplace=True)
        #: Average and max concatenated, hence twice the channels.
        self.out_features = c4 * 2

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.stage1(x)
        x = self.stage2(x)
        x = self.stage3(x)
        x = self.act(self.out_norm(self.stage4(x)))
        avg = x.mean(dim=(2, 3))
        peak = x.amax(dim=(2, 3))
        return torch.cat([avg, peak], dim=1)


class ResnetBackbone(nn.Module):
    """Pretrained torchvision ResNet-18, trunk removed. The baseline to beat."""

    def __init__(self):
        super().__init__()
        from torchvision.models import ResNet18_Weights, resnet18

        net = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
        self.body = nn.Sequential(*list(net.children())[:-2])
        self.out_features = 512 * 2

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.body(x)
        return torch.cat([x.mean(dim=(2, 3)), x.amax(dim=(2, 3))], dim=1)


class CitySceneNet(nn.Module):
    """Backbone, shared trunk, one independent linear head per label head."""

    def __init__(self, config: Config):
        super().__init__()
        if config.backbone == "scratch":
            self.backbone: nn.Module = ScratchBackbone(width=config.width)
        elif config.backbone == "resnet18":
            self.backbone = ResnetBackbone()
        else:
            raise SystemExit(f"unknown backbone {config.backbone!r}; use scratch or resnet18")

        features = self.backbone.out_features  # type: ignore[union-attr]
        self.trunk = nn.Sequential(
            nn.Linear(features, 256),
            nn.BatchNorm1d(256),
            nn.SiLU(inplace=True),
            nn.Dropout(config.dropout),
        )
        self.heads = nn.ModuleDict({head.name: nn.Linear(256, head.n_classes) for head in HEADS})

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        trunk = self.trunk(self.backbone(x))
        return {name: head(trunk) for name, head in self.heads.items()}

    def parameter_count(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


def build_model(config: Config) -> CitySceneNet:
    torch.manual_seed(config.seed)
    return CitySceneNet(config)
