"""
`SceneHints`: the only thing this package is allowed to hand to the pipeline.

Shape rules, in the spirit of docs/02 section 1 ("AI ends at structured JSON"):

  * Every field is a scalar, a null, or a list of short strings. No geometry, no
    prose about intent, no tags from the Call B vocabulary.
  * A head that is not confident emits `null`, not a guess. The LLM reads a
    missing field as "no information", which is correct, and reads a wrong field
    as fact, which is expensive.
  * Confidences are calibrated probabilities (see `evaluate.py --calibrate`), so
    `confidence` here means the same kind of number as `confidence` in
    `PostAnalysis`.
  * `model_version` travels with the hints. When a hint turns out to be wrong in
    a replay, we need to know which checkpoint said it.

This is deliberately *not* added to `PostInput` in `packages/contracts`. Doing
that is a contract change and needs the Pipeline owner plus one other person
(AGENTS.md section 4). Until then, the hints are a JSON file on the side and the
prompt block in `prompt_lines` is what a human would paste in to try it.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "cnn-hints-1.0"


@dataclass
class HeadHint:
    """One head's answer: the value it chose, or null, plus how sure it is."""

    value: str | None
    confidence: int  # 0-100, integer, to match PostAnalysis.confidence
    #: Every class above 0.15, for debugging a wrong hint without rerunning.
    runners_up: dict[str, int] = field(default_factory=dict)


@dataclass
class SceneHints:
    schema_version: str
    model_version: str
    image_ref: str
    #: Null when the head was below threshold. See the module docstring.
    crowd: HeadHint | None = None
    greenery: HeadHint | None = None
    lighting: HeadHint | None = None
    weather: HeadHint | None = None
    scene: HeadHint | None = None
    built_form: HeadHint | None = None
    #: Multi-label: only hazards over their threshold, each with a confidence.
    hazards: list[HeadHint] = field(default_factory=list)
    #: Plain sentences, ready to drop into the Call A payload for one post.
    #: Empty when nothing cleared its threshold - which must stay legal, because
    #: a blurry photo of a wall should add nothing to the prompt.
    prompt_lines: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        return {k: v for k, v in out.items() if v is not None}

    def to_json(self, indent: int | None = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


def validate(payload: dict[str, Any]) -> list[str]:
    """
    Check a hints dict against the rules above. Returns a list of problems;
    empty means valid. Used by the smoke test and by `infer.py --check`.

    Hand-rolled rather than pulled from jsonschema: the rules are eight lines and
    a dependency that only runs in CI is a dependency that breaks in CI.
    """
    from .labels import HEADS_BY_NAME

    problems: list[str] = []
    if payload.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"schema_version must be {SCHEMA_VERSION!r}")
    if not payload.get("model_version"):
        problems.append("model_version is required")
    if not payload.get("image_ref"):
        problems.append("image_ref is required")

    def check_hint(where: str, hint: Any, allowed: tuple[str, ...]) -> None:
        if not isinstance(hint, dict):
            problems.append(f"{where}: expected an object")
            return
        value = hint.get("value")
        if value is not None and value not in allowed:
            problems.append(f"{where}: {value!r} is not in the label space")
        confidence = hint.get("confidence")
        if not isinstance(confidence, int) or not 0 <= confidence <= 100:
            problems.append(f"{where}: confidence must be an integer 0-100")

    for name in ("crowd", "greenery", "lighting", "weather", "scene", "built_form"):
        if name in payload:
            check_hint(name, payload[name], HEADS_BY_NAME[name].classes)

    hazards = payload.get("hazards", [])
    if not isinstance(hazards, list):
        problems.append("hazards: expected a list")
    else:
        for i, hazard in enumerate(hazards):
            check_hint(f"hazards[{i}]", hazard, HEADS_BY_NAME["hazard"].classes)

    lines = payload.get("prompt_lines", [])
    if not isinstance(lines, list) or any(not isinstance(line, str) for line in lines):
        problems.append("prompt_lines: expected a list of strings")
    elif any(len(line) > 160 for line in lines):
        problems.append("prompt_lines: a line over 160 characters is prose, not a hint")

    for key in payload:
        if key not in {
            "schema_version", "model_version", "image_ref", "crowd", "greenery",
            "lighting", "weather", "scene", "built_form", "hazards", "prompt_lines",
        }:
            problems.append(f"unknown key {key!r}")

    return problems


def write_json_schema(path: Path) -> None:
    """Emit `contract/scene-hints.schema.json` from the dataclasses above."""
    from .labels import HEADS, HEADS_BY_NAME

    hint = {
        "type": "object",
        "required": ["value", "confidence"],
        "properties": {
            "value": {"type": ["string", "null"]},
            "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
            "runners_up": {"type": "object", "additionalProperties": {"type": "integer"}},
        },
        "additionalProperties": False,
    }

    def head_hint(name: str) -> dict[str, Any]:
        node = json.loads(json.dumps(hint))
        node["properties"]["value"] = {"enum": [*HEADS_BY_NAME[name].classes, None]}
        return node

    schema: dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "SceneHints",
        "description": (
            "Deterministic per-image scene facts from the feature-CNN model, offered to "
            "Call A as extra context. Not part of packages/contracts."
        ),
        "type": "object",
        "required": ["schema_version", "model_version", "image_ref"],
        "additionalProperties": False,
        "properties": {
            "schema_version": {"const": SCHEMA_VERSION},
            "model_version": {"type": "string"},
            "image_ref": {"type": "string"},
            **{h.name: head_hint(h.name) for h in HEADS if not h.multilabel},
            "hazards": {"type": "array", "items": head_hint("hazard")},
            "prompt_lines": {"type": "array", "items": {"type": "string", "maxLength": 160}},
        },
    }
    path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
