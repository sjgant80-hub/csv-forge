// receipt.mjs — the product payload: turn a forged stump into (1) a model expressed on the user's OWN
// columns, (2) a signed, re-checkable receipt, and (3) a self-contained runnable model module to download.
// Pure, deterministic, never throws. The estate fingerprint signs the receipt (tamper-evident, not secret).

import { fingerprint } from './vendor/pattern-forge/mint.mjs';

const safeStr = (s) => (s == null ? '' : String(s));
const asObj = (x) => (Object(x) === x ? x : {});            // normalize primitives/null to {} (no && to flip)
const safeJson = (v) => { try { return JSON.stringify(v, null, 2); } catch { return '{}'; } };
const int = (x) => (Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0);
const round = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * 1000) / 1000 : 0);

/** deep key-sorted JSON so a receipt signs/verifies the same regardless of key order (survives download+reload). */
export function canonical(body) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = stable(v[k]); return o; }
    return v;
  };
  try { return JSON.stringify(stable(body)); } catch { return ''; }
}

/** interpret a forge stump against the feature NAMES into a rule on the ORIGINAL columns (human + runnable). */
export function interpretStump(stump, featureNames) {
  const idx = stump && Number.isInteger(stump.feature) ? stump.feature : -1;
  const name = (Array.isArray(featureNames) && idx >= 0 && featureNames[idx] != null) ? String(featureNames[idx]) : '';
  const dir = stump && stump.dir === -1 ? -1 : 1;
  const sep = name.indexOf(' = ');
  if (sep !== -1) {
    const column = name.slice(0, sep);
    const level = name.slice(sep + 3);
    const equals = dir === 1;                               // indicator >= 1 ⇒ the level is present
    return {
      kind: 'category', column, level, equals,
      sentence: `${column} ${equals ? 'is' : 'is not'} "${level}"`,
      test: `String(row[${JSON.stringify(column)}]) ${equals ? '===' : '!=='} ${JSON.stringify(level)}`,
    };
  }
  const threshold = stump && Number.isFinite(Number(stump.threshold)) ? Number(stump.threshold) : 0;
  const op = dir === 1 ? '>=' : '<=';
  return {
    kind: 'threshold', column: name, op, threshold,
    sentence: `${name} ${op === '>=' ? '≥' : '≤'} ${threshold}`,
    test: `Number(row[${JSON.stringify(name)}]) ${op} ${threshold}`,
  };
}

/** build the signed receipt from a forge/mint run. `at` (a timestamp string) is passed in, never generated. */
export function buildReceipt(input) {
  const i = asObj(input);
  const model = interpretStump(i.stump, i.featureNames);
  const mint = asObj(i.mint);
  const body = {
    tool: 'csv-forge',
    dataset: { name: safeStr(i.datasetName), rows: int(i.rows), fingerprint: fingerprint(safeStr(i.datasetSample)) },
    target: safeStr(i.targetName),
    predicts: safeStr(i.positiveLabel),
    otherwise: safeStr(i.negativeLabel),
    model: { kind: model.kind, column: model.column, rule: model.sentence },
    heldOutBalancedAccuracy: round(i.heldOutBA),
    baseline: 0.5,
    survivors: int(i.survivors),
    breedingImproved: i.breedingImproved === true,
    mint: { minted: mint.minted === true, bytes: int(mint.bytes), verdict: safeStr(mint.receipt && mint.receipt.verdict), fingerprint: safeStr(mint.fingerprint) },
    economics: safeStr(i.econVerdict),
    at: safeStr(i.at),
  };
  // sign the clean public body; _model is an UNSIGNED local convenience (carries the runnable test string).
  return { ...body, sig: fingerprint(canonical(body)), _model: model };
}

/** recompute the signature over the public receipt body and confirm it matches — tamper detection. */
export function verifyReceipt(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.sig !== 'string') return false;
  const body = { ...r };
  delete body.sig;
  delete body._model;                                       // unsigned convenience field, excluded from the signature
  return fingerprint(canonical(body)) === r.sig;
}

/** emit a self-contained, runnable ES module the user downloads and OWNS — predict(row) + the receipt. */
export function modelModuleSource(receipt) {
  try {
    const r = asObj(receipt);
    const model = (Object(r._model) === r._model) ? r._model : interpretStump(null, []);
    const test = typeof model.test === 'string' ? model.test : 'false';
    const pos = JSON.stringify(safeStr(r.predicts) || 'positive');
    const neg = JSON.stringify(safeStr(r.otherwise) || 'negative');
    const pub = { ...r }; delete pub._model;
    return `// owned-model.mjs — minted by csv-forge (https://sjgant80-hub.github.io/csv-forge/).
// Predicts ${pos} vs ${neg} for "${safeStr(r.target)}". Held-out balanced accuracy ${round(r.heldOutBalancedAccuracy)}.
// Rule: ${safeStr(model.sentence)}. Runs anywhere, no dependencies, no per-call cost. You own this.
export const receipt = ${safeJson(pub)};
export function predict(row) {
  row = row || {};
  return (${test}) ? ${pos} : ${neg};
}
export default predict;
`;
  } catch {
    return '// owned-model.mjs — this receipt could not be rendered.\nexport const receipt = {};\nexport function predict() { return null; }\nexport default predict;\n';
  }
}
