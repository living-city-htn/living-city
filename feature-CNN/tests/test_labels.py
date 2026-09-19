"""
Tests for the parts that do not need torch: the label space, the CSV reader, the
deterministic split, and the hints schema.

    python -m pytest tests -q

These run in under a second and are the ones worth running on every change. The
model itself is covered by `scripts/smoke_test.py`, which needs torch installed.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from citycnn.config import Config  # noqa: E402
from citycnn.dataset import read_rows, split_rows, summarise  # noqa: E402
from citycnn.labels import CSV_COLUMNS, HAZARD, HEADS, IGNORE, parse_multilabel  # noqa: E402
from citycnn.schema import SCHEMA_VERSION, HeadHint, SceneHints, validate  # noqa: E402


def write_csv(path: Path, rows: list[dict[str, str]]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(CSV_COLUMNS), extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in CSV_COLUMNS})
    return path


def test_head_names_are_unique_and_non_empty():
    names = [head.name for head in HEADS]
    assert len(names) == len(set(names))
    for head in HEADS:
        assert head.n_classes >= 2
        assert len(set(head.classes)) == head.n_classes


def test_blank_and_none_are_different_for_hazards():
    """The distinction the whole masked loss depends on."""
    assert parse_multilabel("", HAZARD) is None
    assert parse_multilabel("none", HAZARD) == [0, 0, 0, 0]


def test_multilabel_accepts_semicolons_and_commas():
    assert parse_multilabel("flooding;road_blocked", HAZARD) == [1, 0, 1, 0]
    assert parse_multilabel("flooding, road_blocked", HAZARD) == [1, 0, 1, 0]


def test_multilabel_rejects_an_unknown_class():
    with pytest.raises(ValueError):
        parse_multilabel("earthquake", HAZARD)


def test_unknown_single_label_is_a_hard_error(tmp_path: Path):
    path = write_csv(tmp_path / "labels.csv", [{"image": "a.jpg", "weather": "drizzle"}])
    with pytest.raises(SystemExit) as error:
        read_rows(path)
    assert "weather" in str(error.value)


def test_blank_cells_become_ignore(tmp_path: Path):
    path = write_csv(tmp_path / "labels.csv", [{"image": "a.jpg", "weather": "rain"}])
    rows = read_rows(path)
    assert rows[0].single["weather"] != IGNORE
    assert rows[0].single["crowd"] == IGNORE
    assert rows[0].multi["hazard"] is None


def test_split_is_stable_when_rows_are_inserted(tmp_path: Path):
    """
    Adding a row must not move an existing image between splits. If it did, every
    validation number after a labelling session would be measured against images
    the model had already trained on.
    """
    config = Config(val_fraction=0.3, test_fraction=0.0)
    first = [{"image": f"{i}.jpg", "weather": "clear"} for i in range(40)]
    rows_before = read_rows(write_csv(tmp_path / "a.csv", first))
    before = {
        row.image: name
        for name, bucket in split_rows(rows_before, config).items()
        for row in bucket
    }

    second = first[:20] + [{"image": "inserted.jpg", "weather": "rain"}] + first[20:]
    rows_after = read_rows(write_csv(tmp_path / "b.csv", second))
    after = {
        row.image: name
        for name, bucket in split_rows(rows_after, config).items()
        for row in bucket
    }

    for image, bucket in before.items():
        assert after[image] == bucket


def test_explicit_split_column_wins(tmp_path: Path):
    rows = read_rows(
        write_csv(
            tmp_path / "labels.csv",
            [{"image": "a.jpg", "weather": "clear", "split": "test"}],
        )
    )
    buckets = split_rows(rows, Config())
    assert [row.image for row in buckets["test"]] == ["a.jpg"]


def test_summary_counts_labelled_and_unlabelled(tmp_path: Path):
    rows = read_rows(
        write_csv(
            tmp_path / "labels.csv",
            [
                {"image": "a.jpg", "weather": "rain", "hazard": "flooding"},
                {"image": "b.jpg", "weather": "rain", "hazard": "none"},
                {"image": "c.jpg"},
            ],
        )
    )
    summary = summarise(rows)
    assert summary.counts["weather"]["rain"] == 2
    assert summary.labelled["weather"] == 2
    assert summary.unlabelled["weather"] == 1
    # `none` is a label, so two rows are labelled for hazard even though only one
    # of them contributes a positive.
    assert summary.counts["hazard"]["flooding"] == 1
    assert summary.labelled["hazard"] == 2
    assert summary.unlabelled["hazard"] == 1


def test_hints_validate():
    hints = SceneHints(
        schema_version=SCHEMA_VERSION,
        model_version="citycnn-test",
        image_ref="a.jpg",
        weather=HeadHint(value="rain", confidence=80),
        hazards=[HeadHint(value="flooding", confidence=70)],
    )
    hints.prompt_lines = ["weather: rain or wet ground (80% confident)"]
    assert validate(hints.to_dict()) == []


def test_hints_reject_a_value_outside_the_label_space():
    payload = {
        "schema_version": SCHEMA_VERSION,
        "model_version": "citycnn-test",
        "image_ref": "a.jpg",
        "weather": {"value": "drizzle", "confidence": 80},
    }
    assert any("label space" in problem for problem in validate(payload))


def test_hints_reject_prose_in_prompt_lines():
    payload = {
        "schema_version": SCHEMA_VERSION,
        "model_version": "citycnn-test",
        "image_ref": "a.jpg",
        "prompt_lines": ["x" * 200],
    }
    assert any("prompt_lines" in problem for problem in validate(payload))


def test_a_null_value_is_legal():
    """Below threshold means null, and null must pass validation."""
    payload = {
        "schema_version": SCHEMA_VERSION,
        "model_version": "citycnn-test",
        "image_ref": "a.jpg",
        "scene": {"value": None, "confidence": 40, "runners_up": {"street": 40}},
    }
    assert validate(payload) == []
