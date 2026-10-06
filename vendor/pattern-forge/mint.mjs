// mint.mjs — mint pattern-forge's validated classifier as an OWNED small model (Pattern organs #5,
// the deliverable). A validated pattern IS a tiny deterministic classifier; minting packages it as an
// owned, runnable model body, gates the mint with fallforgemint's OWN rule (a node is minted only on a
// certified BEATS receipt), fingerprints it for tamper-detection, and shows fallforgemint's own
// own-vs-rent economics. fallforgemint (AI-Native Solutions) is a self-contained product; its mint
// kernel is VENDORED here unchanged (pinned 2db5257), never modified. Pure, deterministic, never throws.

import { mintVerdict, ownVsRent } from './vendor/fallforgemint/kernel.mjs';

const num = (x) => (Number.isFinite(x) ? x : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeStr = (s) => { try { return String(s); } catch { return ''; } };   // a toxic toString can't crash us
const byteLen = (s) => new TextEncoder().encode(safeStr(s)).length;

/** a deterministic content fingerprint (fnv-1a 32-bit) — tamper changes it; browser- and node-safe. */
export function fingerprint(s) {
  let h = 0x811c9dc5 >>> 0;
  const str = safeStr(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** render a rule to a canonical, runnable model body. */
export function modelBody(rule) {
  if (!rule || typeof rule !== 'object') return '?';
  if (rule.kind === 'compare') return `predict 1 if x${num(rule.a)} ${rule.op === '<' ? '<' : '>'} x${num(rule.b)}`;
  if (rule.kind === 'range') return `predict 1 if ${num(rule.lo)} <= x${num(rule.feature)} <= ${num(rule.hi)}`;
  return `predict 1 if x${num(rule.feature)} ${rule.dir === -1 ? '<=' : '>='} ${num(rule.threshold)}`;
}

/** a fallforge-gate receipt built from pattern-forge's OWN held-out comparison: the classifier vs its
 *  base (the best single threshold). BEATS when it wins held-out; certified when the margin is clear. */
export function receiptFor(candidateBA, baseBA, margin = 0.1) {
  const c = num(candidateBA), b = num(baseBA);
  return {
    kind: 'fallforge-gate-receipt',
    base: b, candidate: c,
    verdict: c > b ? 'BEATS' : (c === b ? 'TIES' : 'LOSES'),
    certified: (c - b) >= num(margin),
  };
}

/** mint the classifier: the owned model body + size, the mint verdict (fallforgemint's rule on the
 *  real held-out receipt), and a content fingerprint. `minted` is true only on a certified BEATS. */
export function mint(rule, candidateBA, baseBA) {
  const body = modelBody(rule);
  const receipt = receiptFor(candidateBA, baseBA);
  const v = mintVerdict(receipt);
  return {
    body, bytes: byteLen(body),
    heldOut: num(candidateBA), base: num(baseBA),
    receipt, minted: v.ok === true && v.minted === true, why: v.why,
    fingerprint: fingerprint(body),
  };
}

/** verify a minted model's fingerprint matches its body (tamper detection). */
export function verifyMint(m) {
  return isObj(m) && typeof m.body === 'string' && typeof m.fingerprint === 'string' && fingerprint(m.body) === m.fingerprint;
}

/** the honest economics for a classification workload, via fallforgemint's own calculator. */
export function economics(input) { return ownVsRent(input); }
