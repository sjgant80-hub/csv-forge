# Vendored — provenance & credit

- `vendor/pattern-forge/*.mjs` — the sovereign pattern-forge kernels (`pattern.mjs`, `breed.mjs`,
  `book.mjs`, `mint.mjs`) of **pattern-forge** (https://sjgant80-hub.github.io/pattern-forge/,
  AI-Native Solutions / Simon Gant), copied **unchanged**, pinned at `0f6efb1`. Their mutation (witness
  score 1.0) and fuzz proofs live in that repo; here they are vendored, credited, pinned, and re-fuzzed in
  CI. csv-forge's **own** new code is `csv.mjs` (the generic CSV reader/encoder) and `receipt.mjs` (the
  owned-model + signed-receipt builder) — those are the kernels this repo mutation-witnesses.

- `vendor/pattern-forge/vendor/fallforgemint/kernel.mjs` — the mint kernel of **FallForge Mint**
  (https://sjgant80-hub.github.io/fallforgemint/, AI-Native Solutions / Simon Gant), copied **unchanged**,
  pinned at `2db5257bd79562679a908573f4489d2ccc580aa8`. `mint.mjs` uses its real `mintVerdict` (mints only
  on a certified BEATS receipt) and `ownVsRent` economics. Not modified by this repo.

- `samples/telco-churn.csv` — IBM's public sample **Telco Customer Churn** dataset (7,043 real customers,
  21 columns), bundled **frozen and unchanged** as the demo/CI fixture, sealed by sha256
  `16320c9c1ec72448db59aa0a26a0b95401046bef5d02fd3aeb906448e3055e91` (CI verifies the bytes). A widely
  mirrored public teaching dataset; credit to IBM for the sample. The tool itself uploads nothing and runs
  entirely in the user's browser on whatever CSV they choose.
