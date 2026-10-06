// ci-verify.mjs — on GitHub's runner, drive the WHOLE product on the bundled real sample exactly as a user
// would: infer the CSV generically, forge, mint, build the receipt, WRITE the downloadable owned-model module,
// IMPORT it back, and run its predict(). Then check every number against the sealed predictions.json.
// The sample is frozen + sha-pinned; the kernels are vendored; nothing here is typed — it all comes from the run.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepare } from './csv.mjs';
import { forge } from './vendor/pattern-forge/pattern.mjs';
import { breed } from './vendor/pattern-forge/breed.mjs';
import { mint, economics } from './vendor/pattern-forge/mint.mjs';
import { buildReceipt, verifyReceipt, modelModuleSource } from './receipt.mjs';

const r3 = (x) => Math.round(x * 1000) / 1000;

export async function derive() {
  const csv = readFileSync(new URL('./samples/telco-churn.csv', import.meta.url), 'utf8');
  const p = prepare(csv);                                           // generic: infer + auto-encode, no hand-coding
  const r = forge(p.cases, { holdoutFrac: 1 / 3, bar: 0.6 });
  const best = r.proposed.slice().sort((a, b) => b.testBA - a.testBA)[0];
  const b = breed(p.cases, { generations: 3, keep: 8, maxTerms: 3 });
  const mm = mint({ kind: 'stump', feature: best.feature, threshold: best.threshold, dir: best.dir }, best.testBA, 0.5);
  const econ = economics({ callsPerMonth: 100000, tokensPerCall: 60, rentPerMillion: 3, setupCost: 0, runPerMonth: 0 });
  const negative = (p.classes || []).find((c) => c !== p.positiveLabel) || '';

  const receipt = buildReceipt({
    datasetName: 'telco-churn.csv', datasetSample: csv.slice(0, 200), rows: p.nrows,
    targetName: p.targetName, positiveLabel: p.positiveLabel, negativeLabel: negative,
    stump: best, featureNames: p.featureNames, heldOutBA: best.testBA, survivors: r.survivors.length,
    breedingImproved: b.improvedHeldOut, mint: mm, econVerdict: econ.verdict, at: '2026-10-06T00:00:00Z',
  });

  // WRITE the owned model the user would download, IMPORT it back, and run it — the real product path.
  const file = join(tmpdir(), 'csvforge-ci-owned-model.mjs');
  writeFileSync(file, modelModuleSource(receipt));
  const mod = await import(pathToFileURL(file).href);

  return {
    nrows: p.nrows,
    features: p.featureNames.length,
    target: p.targetName,
    positive: p.positiveLabel,
    negative,
    bestFeatureName: p.featureNames[best.feature],
    bestTestBA: r3(best.testBA),
    survivors: r.survivors.length,
    breedImproved: b.improvedHeldOut,
    mintMinted: mm.minted === true,
    mintBytes: mm.bytes,
    econVerdict: econ.verdict,
    receiptVerifies: verifyReceipt(receipt),
    tamperRejected: verifyReceipt({ ...receipt, predicts: 'No' }) === false,
    modelPredictsMonthToMonth: mod.predict({ Contract: 'Month-to-month' }),
    modelPredictsTwoYear: mod.predict({ Contract: 'Two year' }),
    modelReceiptVerifies: verifyReceipt(mod.receipt),
  };
}

if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('ci-verify.mjs')) {
  const preds = JSON.parse(readFileSync(new URL('./predictions.json', import.meta.url), 'utf8'));
  const m = await derive();
  let fail = 0;
  for (const [k, v] of Object.entries(preds.expected)) if (m[k] !== v) { console.error(`MISMATCH ${k}: expected ${v}, got ${m[k]}`); fail++; }
  const holds = (e) => { const { nrows, features, target, positive, negative, bestFeatureName, bestTestBA, survivors, breedImproved, mintMinted, mintBytes, econVerdict, receiptVerifies, tamperRejected, modelPredictsMonthToMonth, modelPredictsTwoYear, modelReceiptVerifies } = m; try { return !!eval(e); } catch { return false; } };
  for (const c of preds.claims) if (!holds(c.check)) { console.error(`CLAIM FAIL ${c.id}: ${c.check}`); fail++; }
  if (fail) { console.error(`\n${fail} mismatch(es).`); process.exit(1); }
  console.log('✓ drove the whole product on the real sample; all', preds.claims.length, 'claims hold.');
  console.log(JSON.stringify(m));
}
