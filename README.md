# csv-forge

**▶ Live: https://sjgant80-hub.github.io/csv-forge/**

**Bring your own CSV, own a verified model.** A free tool that runs **entirely in your browser** — drop a
spreadsheet with a yes/no column (churned, converted, defaulted, passed…), and the forge finds the patterns
that actually predict it on **held-out rows it never saw**, then mints the winner as a tiny model you
**download and own**: a runnable `owned-model.mjs` plus a signed, re-checkable `receipt.json`. Your data
never leaves the page. It is the sovereign alternative to renting an LLM (RAG) to read your data.

## What it does

1. **Infers** every column (numeric / categorical / id / constant) and auto-picks a binary target (you can change it).
2. **Encodes** generically — numerics pass through (quantile-binned so it's instant on any size), categoricals become 0/1 indicators, IDs are dropped.
3. **Forges** — proposes simple patterns on a training split, keeps only those that clear a held-out balanced-accuracy bar (never an LLM judge), breeds compound rules.
4. **Mints** the best classifier as an owned model, gated by [fallforgemint](https://sjgant80-hub.github.io/fallforgemint/)'s rule — it mints only on a certified beats-the-base receipt, and **refuses** when there's no signal.
5. **Hands you** `owned-model.mjs` (runs anywhere, `predict(row)`, no per-call bill) and a signed `receipt.json` anyone can re-verify.

## Proven on real data (sealed before measurement)

On the bundled IBM Telco Customer Churn set (7,043 real customers), with **zero hand-coding**:

| # | Claim | Result |
|---|-------|--------|
| P1 | The generic tool recovers the real driver on held-out rows | **month-to-month contract**, held-out BA **0.726** |
| P2 | It parsed & auto-encoded the raw file itself | 7,043 rows → **46 features**, target auto-picked |
| P3 | Many patterns clear the held-out bar | **19** survivors |
| P4 | **The product works** — the downloaded model imports & predicts, its receipt verifies, a tampered one is rejected | ✓ |
| P5 | The model mints tiny & owned; owning beats renting | **21 bytes**, `OWN_WINS` |

## Proof-of-play

- `csv.mjs` + `receipt.mjs` — csv-forge's own kernels: **mutation-witnessed (score 1.0)** + fuzzed never-throw.
- `samples/telco-churn.csv` — frozen + **sha256-sealed**; CI verifies the exact bytes.
- `ci-verify.mjs` — drives the **whole product** on the real sample on GitHub's runner: it writes the
  downloadable `owned-model.mjs`, **imports it back, runs `predict()`**, and checks every sealed claim.
- Forge/breed/mint kernels **vendored + pinned** from pattern-forge and fallforgemint — see [VENDOR.md](VENDOR.md).

```bash
node --test                                                   # unit tests (csv + receipt)
node tools/witness.mjs mutate csv.mjs --test node --test csv.test.mjs      # own kernels CLEAN
node tools/witness.mjs mutate receipt.mjs --test node --test receipt.test.mjs
node ci-verify.mjs                                            # drive the product on the real sample
```

Built by **Kar · AI-Native Solutions**. Kernels credited to AI-Native Solutions / Simon Gant; sample data to IBM.
