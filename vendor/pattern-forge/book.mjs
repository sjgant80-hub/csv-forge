// book.mjs — the pattern book (Pattern organs #5, the deliverable). It COMPILES a human-readable catalog
// of the patterns that survived across the organ's domains: each in plain English, with its held-out
// evidence and where it came from. Every line is GENERATED from the kernel results, never typed.
//
// Pure, deterministic, never throws on garbage.

const num = (x) => (Number.isFinite(x) ? x : 0);

/** render ONE rule to plain English. Handles stump / compare / range, and a compound (array of stumps). */
export function renderRule(rule) {
  if (Array.isArray(rule)) {
    const parts = rule.map(renderRule).filter((s) => s !== '?');
    return parts.length ? parts.join(' AND ') : '?';
  }
  if (!rule || typeof rule !== 'object') return '?';
  if (rule.kind === 'compare') return `x${num(rule.a)} ${rule.op === '<' ? '<' : '>'} x${num(rule.b)}`;
  if (rule.kind === 'range') return `${num(rule.lo)} ≤ x${num(rule.feature)} ≤ ${num(rule.hi)}`;
  if (rule.kind === 'stump' || (rule.feature !== undefined && rule.threshold !== undefined)) {
    return `x${num(rule.feature)} ${rule.dir === -1 ? '≤' : '≥'} ${num(rule.threshold)}`;
  }
  return '?';
}

/** compile the book from per-domain entries. Each entry: { domain, rule, trainBA, testBA, bar, source }.
 *  Only GENERALISING patterns (testBA >= bar) make the book; each is rendered + evidence-stamped. */
export function compileBook(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const r3 = (x) => Math.round(num(x) * 1000) / 1000;
  return list
    .filter((e) => e && num(e.testBA) >= (Number.isFinite(e?.bar) ? e.bar : 0.75))
    .map((e) => ({
      domain: typeof e.domain === 'string' ? e.domain : '(unnamed)',
      pattern: renderRule(e.rule),
      heldOut: r3(e.testBA),
      train: r3(e.trainBA),
      bar: Number.isFinite(e?.bar) ? e.bar : 0.75,
      source: typeof e.source === 'string' ? e.source : '(unknown)',
    }));
}

/** the book as portable Markdown — a shippable artifact. */
export function bookToMarkdown(book) {
  const rows = (Array.isArray(book) ? book : [])
    .map((b) => `| ${b.domain} | \`${b.pattern}\` | ${b.heldOut} | ${b.source} |`)
    .join('\n');
  return ['# Pattern book', '', '| domain | pattern | held-out BA | found by |', '|---|---|---|---|', rows].join('\n');
}
