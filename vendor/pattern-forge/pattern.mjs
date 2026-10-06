// pattern.mjs — the pattern-forge core (Pattern organs #5, the defensible heart).
//
// Feed it a domain's labelled cases. It PROPOSES simple patterns (decision stumps) from a TRAIN split,
// then keeps ONLY the ones that still predict a HELD-OUT split above a bar — graded by a deterministic
// rule (balanced accuracy), never an LLM judge. A pattern that merely memorised the training noise is
// rejected by the held-out split. That is the whole point: a pattern survives only if it GENERALISES.
//
// Pure, deterministic (no RNG, no clock), never throws on garbage (invalid → safe value).

/** finite number or 0 (Number.isFinite already rejects non-numbers without coercion) */
const num = (x) => (Number.isFinite(x) ? x : 0);
/** 1 for a positive label (1 or true), else 0 */
const lab = (y) => (y === 1 || y === true ? 1 : 0);

/** a case is { x: number[], y: 0|1 }. Normalise one; invalid → { x:[], y:0 } */
function okCase(c) {
  if (!c || !Array.isArray(c.x)) return { x: [], y: 0 };
  return { x: c.x.map(num), y: lab(c.y) };
}

/** deterministic split: every k-th case (k = round(1/holdoutFrac)) is held out; the rest train.
 *  No randomness, so the same data always splits the same way. Returns { train, test }. */
export function splitCases(cases, holdoutFrac = 1 / 3) {
  if (!Array.isArray(cases)) return { train: [], test: [] };
  const f = (Number.isFinite(holdoutFrac) && holdoutFrac > 0 && holdoutFrac < 1) ? holdoutFrac : 1 / 3;
  const k = Math.max(2, Math.round(1 / f));
  const train = [], test = [];
  cases.forEach((c, i) => (i % k === 0 ? test : train).push(okCase(c)));
  return { train, test };
}

/** predict with a stump { feature, threshold, dir }: dir +1 → positive when x[feature] >= threshold;
 *  dir -1 → positive when x[feature] <= threshold. */
export function predict(stump, x) {
  if (!stump || !Array.isArray(x)) return 0;
  const v = num(x[stump.feature]);
  const t = num(stump.threshold);
  return (stump.dir === -1 ? v <= t : v >= t) ? 1 : 0;
}

/** balanced accuracy of a stump on cases = mean(sensitivity, specificity), in [0,1].
 *  If a class is absent, that side is treated as perfectly handled (1) so BA stays defined. */
export function balancedAccuracy(stump, cases) {
  if (!Array.isArray(cases) || cases.length === 0) return 0;
  let tp = 0, fn = 0, tn = 0, fp = 0;
  for (const raw of cases) {
    const c = okCase(raw);
    const p = predict(stump, c.x);
    if (c.y === 1) { if (p === 1) tp++; else fn++; }
    else { if (p === 0) tn++; else fp++; }
  }
  const sens = (tp + fn) === 0 ? 1 : tp / (tp + fn);
  const spec = (tn + fp) === 0 ? 1 : tn / (tn + fp);
  return (sens + spec) / 2;
}

/** propose the best stump PER FEATURE from the train split (deterministic): for each feature, the
 *  threshold+direction maximising train balanced accuracy. Thresholds are the feature's own values. */
export function proposeStumps(train) {
  if (!Array.isArray(train) || train.length === 0) return [];
  const cases = train.map(okCase);
  const width = cases.reduce((m, c) => Math.max(m, c.x.length), 0);  // reduce, not spread (never blows the stack)
  const stumps = [];
  for (let f = 0; f < width; f++) {
    const values = [...new Set(cases.map((c) => c.x[f]))].sort((a, b) => a - b);
    let best = null;
    // values are ascending and dir order is fixed [1,-1], and we replace only on STRICTLY greater BA,
    // so the first stump to reach the max (lowest threshold, dir +1 on a tie) is kept — deterministic.
    for (const t of values) {
      for (const dir of [1, -1]) {
        const s = { feature: f, threshold: t, dir };
        const ba = balancedAccuracy(s, cases);
        if (!best || ba > best.ba) best = { ...s, ba };
      }
    }
    if (best) stumps.push({ feature: best.feature, threshold: best.threshold, dir: best.dir, trainBA: best.ba });
  }
  return stumps;
}

/** FORGE: propose on train, keep only the stumps whose HELD-OUT balanced accuracy >= bar.
 *  Returns survivors ranked by held-out score (desc), each with trainBA and testBA. The gap between
 *  trainBA and testBA exposes overfit; a survivor must earn its place on data it never saw. */
export function forge(cases, { holdoutFrac = 1 / 3, bar = 0.6 } = {}) {
  const { train, test } = splitCases(cases, holdoutFrac);
  const proposed = proposeStumps(train);
  const graded = proposed.map((s) => ({
    feature: s.feature, threshold: s.threshold, dir: s.dir,
    trainBA: s.trainBA, testBA: balancedAccuracy(s, test),
  }));
  const b = Number.isFinite(bar) ? bar : 0.6;
  const survivors = graded.filter((s) => s.testBA >= b).sort((a, b2) => b2.testBA - a.testBA);
  return { trainN: train.length, testN: test.length, bar: b, proposed: graded, survivors };
}
