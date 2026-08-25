# Shared Vocabulary

Single source of truth for the sign/gloss vocabulary. `recognition-ml`,
`nlp-sentence-model`, `speech-pipeline`, and `avatar` should all key off
`shared/vocabulary.json` rather than hardcoding their own lists.

- **Naming convention:** `SCREAMING_SNAKE_CASE`, e.g. `THANK_YOU`, not `Thank You` or `thankyou`.
- **Recognition (direction 1)** can target the full list below (~20-30 words) — decide as a team.
- **Avatar (direction 2)** only needs animation clips for a subset (5-10 signs)
  for the MVP demo — pick the highest-value subset from the same list so the
  gloss IDs still match.

Finalize this list as a team in the first 30 minutes — it unblocks everyone.

See `shared/vocabulary.json` for the machine-readable version.
