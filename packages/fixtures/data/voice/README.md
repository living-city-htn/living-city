# Voice fixtures

What they are for: running the whole voice path with no OMNI key, no GPTZero
key and no network. docs/08 section 9.

| File | What it is |
|---|---|
| `voice-analysis.mock.json` | Canned OMNI answers, one per scenario. |
| `clean.wav` | One second of tone, no background. The happy path. |
| `noisy.wav` | The same tone under broadband hiss and a room rumble. Stands in for a venue. |
| `synthetic-text.sample.txt` | Marketing copy written to read as generated. Makes the authenticity gate fire. |

The WAV files are synthesised rather than recorded, for two reasons: nobody's
voice is in the repository, and a generated file is the same bytes on every
machine, so a test that depends on one cannot pass locally and fail in CI.

`audio/wav` is in the supported-format list precisely so these files can be fed
through the real code path rather than a parallel one.

Set `VOICE_FIXTURES=1` to use the canned answers. It is read only when no
`OMNI_API_KEY` is set, so it can never shadow a real call by accident.
