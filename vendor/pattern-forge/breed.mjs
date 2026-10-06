// breed.mjs — the "improves itself" half of Pattern organs #5.
//
// pattern.mjs finds the best SINGLE-feature pattern. Some domains have no single-feature signal — the
// truth is a CONJUNCTION ("x0 high AND x1 high"). Breeding evolves single stumps into compound patterns:
// each generation ANDs promising patterns with another feature's stump, SELECTS on the TRAIN split, and
// the champion is judged on the HELD-OUT split. Selection never peeks at held-out, so a win there is real.
//
// Pure, deterministic (no RNG — offspring are enumerated), never throws on garbage.

import { splitCases, proposeStumps, predict } from './pattern.mjs';

const round = (x) => Math.round(x * 1e4) / 1e4;

/** a compound pattern = { stumps:[...] }; predicts 1 iff EVERY stump fires (logical AND). Empty → 0. */
export function predictCompound(compound, x) {
  if (!compound || !Array.isArray(compound.stumps) || compound.stumps.length === 0) return 0;
  return compound.stumps.every((s) => predict(s, x) === 1) ? 1 : 0;
}

/** balanced accuracy of a compound on cases, in [0,1]. */
export function baCompound(compound, cases) {
  if (!Array.isArray(cases) || cases.length === 0) return 0;
  let tp = 0, fn = 0, tn = 0, fp = 0;
  for (const c of cases) {
    const x = (c && Array.isArray(c.x)) ? c.x : [];
    const y = (c && (c.y === 1 || c.y === true)) ? 1 : 0;
    const p = predictCompound(compound, x);
    if (y === 1) { if (p === 1) tp++; else fn++; } else { if (p === 0) tn++; else fp++; }
  }
  const sens = (tp + fn) === 0 ? 1 : tp / (tp + fn);
  const spec = (tn + fp) === 0 ? 1 : tn / (tn + fp);
  return (sens + spec) / 2;
}

const sig = (c) => c.stumps.map((t) => `${t.feature}:${t.threshold}:${t.dir}`).sort().join('|');

/** BREED: evolve single stumps into compound patterns. Selection is on TRAIN; the champion (best TRAIN
 *  balanced accuracy across all generations, fewest terms on a tie) is reported with its HELD-OUT score.
 *  Also reports the best SINGLE-stump held-out score, so the improvement from breeding is explicit. */
export function breed(cases, { generations = 3, keep = 6, holdoutFrac = 1 / 3, maxTerms = 3 } = {}) {
  const { train, test } = splitCases(cases, holdoutFrac);
  const singles = proposeStumps(train).map((s) => ({ feature: s.feature, threshold: s.threshold, dir: s.dir }));
  const singleBestTestBA = singles.reduce((m, s) => Math.max(m, baCompound({ stumps: [s] }, test)), 0);

  if (singles.length === 0) {
    return { trainN: train.length, testN: test.length, singleBestTestBA: round(singleBestTestBA), champion: null, improvedHeldOut: false, history: [] };
  }

  const g = Math.max(1, Math.min(10, Number.isFinite(generations) ? generations : 3));
  const k = Math.max(1, Math.min(50, Number.isFinite(keep) ? keep : 6));
  const mt = Math.max(1, Math.min(6, Number.isFinite(maxTerms) ? maxTerms : 3));

  let pop = singles.map((s) => ({ stumps: [s] }));
  const history = [];
  let champion = null; // best-by-train across all generations

  for (let gen = 0; gen < g; gen++) {
    // sort by train BA, highest first. pop is built in a deterministic order and the sort is stable, so
    // equal-BA compounds keep their order and the champion is reproducible — no fragile multi-key compare.
    const scored = pop
      .map((c) => ({ c, ba: baCompound(c, train) }))
      .sort((a, b) => b.ba - a.ba);
    const top = scored[0];
    if (!champion || top.ba > champion.trainBA) {
      champion = { stumps: top.c.stumps, trainBA: top.ba, testBA: baCompound(top.c, test) };
    }
    history.push({ gen, bestTrainBA: round(top.ba), bestTestBA: round(baCompound(top.c, test)), terms: top.c.stumps.length });

    // next generation: AND each of the top-keep parents with another feature's single stump
    const parents = scored.slice(0, k).map((x) => x.c);
    const offspring = [];
    for (const p of parents) {
      offspring.push(p);
      if (p.stumps.length < mt) {
        for (const s of singles) {
          if (!p.stumps.some((t) => t.feature === s.feature)) offspring.push({ stumps: [...p.stumps, s] });
        }
      }
    }
    const seen = new Set();
    pop = [];
    for (const c of offspring) { const s = sig(c); if (!seen.has(s)) { seen.add(s); pop.push(c); } }
  }

  return {
    trainN: train.length,
    testN: test.length,
    singleBestTestBA: round(singleBestTestBA),
    champion: champion
      ? { stumps: champion.stumps, trainBA: round(champion.trainBA), testBA: round(champion.testBA), terms: champion.stumps.length }
      : null,
    improvedHeldOut: champion ? round(champion.testBA) > round(singleBestTestBA) : false,
    history,
  };
}
