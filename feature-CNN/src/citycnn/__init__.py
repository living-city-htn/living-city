"""
citycnn: a small image classifier that hands Call A the scene facts a caption
misses, as structured JSON.

It is a side car, not a stage in the pipeline. Nothing in `packages/` imports it,
it adds no model call to the two in docs/03, and it never emits geometry, a plan
word, or an intent. See ../README.md for why it is here and what it would take to
wire it in.
"""

from .labels import HEADS, HEADS_BY_NAME, Head
from .schema import SCHEMA_VERSION, SceneHints

__all__ = ["HEADS", "HEADS_BY_NAME", "Head", "SceneHints", "SCHEMA_VERSION", "__version__"]

__version__ = "0.1.0"
