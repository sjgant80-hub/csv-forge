import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { interpretStump, buildReceipt, verifyReceipt, canonical, modelModuleSource } from './receipt.mjs';

// ---------------- interpretStump ----------------
test('interpretStump: a present categorical indicator → "column is level"', () => {
  const r = interpretStump({ feature: 0, dir: 1, threshold: 1 }, ['Contract = Month-to-month']);
  assert.equal(r.kind, 'category');
  assert.equal(r.column, 'Contract');
  assert.equal(r.level, 'Month-to-month');
  assert.equal(r.equals, true);
  assert.match(r.test, /=== "Month-to-month"/);
});

test('interpretStump: an absent indicator (dir -1) → "column is not level"', () => {
  const r = interpretStump({ feature: 0, dir: -1, threshold: 0 }, ['Contract = Two year']);
  assert.equal(r.equals, false);
  assert.match(r.sentence, /is not/);
  assert.match(r.test, /!== "Two year"/);
});

test('interpretStump: numeric column, dir +1 → >=, dir -1 → <=', () => {
  const up = interpretStump({ feature: 0, dir: 1, threshold: 68.5 }, ['MonthlyCharges']);
  assert.equal(up.kind, 'threshold');
  assert.equal(up.op, '>=');
  assert.match(up.test, /Number\(row\["MonthlyCharges"\]\) >= 68\.5/);
  const down = interpretStump({ feature: 0, dir: -1, threshold: 22 }, ['tenure']);
  assert.equal(down.op, '<=');
  assert.match(down.sentence, /tenure ≤ 22/);
});

test('interpretStump: garbage never throws', () => {
  assert.doesNotThrow(() => interpretStump(null, null));
  assert.doesNotThrow(() => interpretStump({ feature: 9 }, []));
  assert.doesNotThrow(() => interpretStump({ feature: 0, dir: 1 }, null));   // valid index, null names
  assert.equal(interpretStump(null, null).kind, 'threshold');
  assert.equal(interpretStump({ feature: 9 }, []).column, '');               // out-of-range index → empty name, not "undefined"
});

test('interpretStump: a name beginning with " = " (empty column) is still categorical', () => {
  assert.equal(interpretStump({ feature: 0, dir: 1, threshold: 1 }, [' = Yes']).kind, 'category');
});

// ---------------- buildReceipt + verifyReceipt ----------------
const SAMPLE_INPUT = {
  datasetName: 'telco-churn.csv', datasetSample: 'customerID,Churn\n1,No\n2,Yes', rows: 7043,
  targetName: 'Churn', positiveLabel: 'Yes', negativeLabel: 'No',
  stump: { feature: 0, dir: 1, threshold: 1 }, featureNames: ['Contract = Month-to-month'],
  heldOutBA: 0.7255, survivors: 19, breedingImproved: false,
  mint: { minted: true, bytes: 20, receipt: { verdict: 'BEATS' }, fingerprint: '3a930a72' },
  econVerdict: 'OWN_WINS', at: '2026-10-06T00:00:00Z',
};

test('buildReceipt: produces a signed receipt that verifies', () => {
  const r = buildReceipt(SAMPLE_INPUT);
  assert.equal(r.tool, 'csv-forge');
  assert.equal(r.target, 'Churn');
  assert.equal(r.predicts, 'Yes');
  assert.equal(r.model.rule, 'Contract is "Month-to-month"');
  assert.equal(r.mint.minted, true);
  assert.equal(r.mint.bytes, 20);
  assert.equal(r.mint.verdict, 'BEATS');     // mint.receipt && mint.receipt.verdict must read the field, not the object
  assert.equal(r.breedingImproved, false);
  assert.equal(r.economics, 'OWN_WINS');
  assert.equal(typeof r.sig, 'string');
  assert.equal(verifyReceipt(r), true);
});

test('verifyReceipt: any tampered field fails the signature', () => {
  const r = buildReceipt(SAMPLE_INPUT);
  assert.equal(verifyReceipt({ ...r, heldOutBalancedAccuracy: 0.99 }), false);
  assert.equal(verifyReceipt({ ...r, predicts: 'No' }), false);
  assert.equal(verifyReceipt({ ...r, sig: 'deadbeef' }), false);
});

test('verifyReceipt: signature is independent of key order (survives download + reload)', () => {
  const r = buildReceipt(SAMPLE_INPUT);
  const reordered = {};
  for (const k of Object.keys(r).reverse()) reordered[k] = r[k];  // reverse top-level order, keep nested intact
  assert.equal(verifyReceipt(reordered), true);
});

test('verifyReceipt: garbage → false, never throws', () => {
  for (const g of [null, undefined, 42, {}, { sig: 1 }]) assert.equal(verifyReceipt(g), false);
});

test('canonical: garbage → "" (never throws)', () => {
  const circular = {}; circular.self = circular;
  assert.equal(canonical(circular), '');
});

// ---------------- the downloadable owned model REALLY runs ----------------
test('modelModuleSource: the emitted module imports and predicts correctly (categorical)', async () => {
  const r = buildReceipt(SAMPLE_INPUT);
  const src = modelModuleSource(r);
  const file = join(tmpdir(), 'csvforge-owned-model-cat.mjs');
  writeFileSync(file, src);
  const mod = await import(pathToFileURL(file).href);
  assert.equal(typeof mod.predict, 'function');
  assert.equal(mod.predict({ Contract: 'Month-to-month' }), 'Yes');  // the churn rule fires
  assert.equal(mod.predict({ Contract: 'Two year' }), 'No');
  assert.equal(verifyReceipt(mod.receipt), true);                    // the embedded receipt still verifies
});

test('modelModuleSource: numeric rule module imports and predicts correctly', async () => {
  const r = buildReceipt({ ...SAMPLE_INPUT, stump: { feature: 0, dir: -1, threshold: 22 }, featureNames: ['tenure'] });
  const file = join(tmpdir(), 'csvforge-owned-model-num.mjs');
  writeFileSync(file, modelModuleSource(r));
  const mod = await import(pathToFileURL(file).href);
  assert.equal(mod.predict({ tenure: '5' }), 'Yes');    // 5 <= 22 → churn
  assert.equal(mod.predict({ tenure: '40' }), 'No');    // 40 > 22 → stays
});

test('modelModuleSource: garbage receipt → a string, never throws', () => {
  for (const g of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => modelModuleSource(g));
    assert.equal(typeof modelModuleSource(g), 'string');
  }
});
