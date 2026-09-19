"""
Augmentation.

One rule drives every number here: an augmentation must not change any label.
That is easy to forget with photos, because the usual defaults break two of our
heads.

  * No vertical flip and no large rotation. Sky at the top is what separates
    `daylight` from `artificial_night` in half the images.
  * Mild colour jitter only (see `Config`). `lighting` and `weather` are read off
    colour temperature and contrast; a strong jitter relabels them for us.
  * Random resized crop is kept, but not below ~0.7 of the frame. A tight crop of
    a crowd photo can contain one person, and `crowd` is then wrong.
"""

from __future__ import annotations

from .config import Config

#: ImageNet statistics. Correct for `backbone="resnet18"`, and harmless for the
#: scratch net, which only needs inputs roughly centred on zero.
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def build_transforms(config: Config, train: bool):
    from torchvision import transforms

    if not train:
        return transforms.Compose([
            transforms.Resize(int(config.image_size * 1.14)),
            transforms.CenterCrop(config.image_size),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ])

    return transforms.Compose([
        transforms.RandomResizedCrop(
            config.image_size,
            scale=(config.random_crop_scale_min, 1.0),
            ratio=(0.8, 1.25),
        ),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(config.rotation_degrees),
        transforms.ColorJitter(
            brightness=config.jitter_brightness,
            contrast=config.jitter_contrast,
            saturation=config.jitter_saturation,
            hue=config.jitter_hue,
        ),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
        # Erasing a patch is the one augmentation that clearly helps the hazard
        # head: it stops the model keying on one corner of the frame.
        transforms.RandomErasing(p=0.25, scale=(0.02, 0.12)),
    ])
