import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, inferColumns, suggestTarget, choosePositive, encode, prepare, quantizer } from './csv.mjs';

// ---------------- quantizer ----------------
test('quantizer: ≤16 distinct values are left exactly as-is (identity)', () => {
  const q = quantizer([20, 30, 40, 50]);
  for (const v of [20, 30, 40, 50]) assert.equal(q(v), v);
});

test('quantizer: a high-cardinality column collapses to ≤16 distinct edges, snapping to the largest edge ≤ v', () => {
  const vals = [];
  for (let i = 0; i < 1000; i++) vals.push(i);          // 1000 distinct
  const q = quantizer(vals);
  const outputs = new Set(vals.map(q));
  assert.ok(outputs.size > 1 && outputs.size <= 16, `got ${outputs.size} distinct, want 2..16`);
  assert.equal(q(0), 0);                                 // smallest edge
  assert.equal(q(999), 937);                             // largest edge = sorted[floor(15*1000/16)] — pins the quantile math
  assert.equal(q(950), 937);                             // snaps down to the largest edge ≤ v
  assert.equal(q(-5), 0);                                // below the minimum → the smallest edge
});

test('quantizer: garbage → identity function, never throws', () => {
  assert.doesNotThrow(() => quantizer(null));
  assert.equal(typeof quantizer(null), 'function');
  assert.equal(quantizer(null)(42), 42);
  assert.doesNotThrow(() => quantizer([1, 2, 3])(null));
});

// ---------------- parseCsv ----------------
test('parseCsv: header + rows, trailing newline makes no phantom row', () => {
  const { header, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6\n');
  assert.deepEqual(header, ['a', 'b', 'c']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['1', '2', '3']);
});

test('parseCsv: no trailing newline still flushes the last row', () => {
  const { rows } = parseCsv('a,b\n1,2\n3,4');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['3', '4']);
});

test('parseCsv: quoted field with an embedded comma stays one field', () => {
  const { rows } = parseCsv('a,b\n"x,y",z');
  assert.deepEqual(rows[0], ['x,y', 'z']);
});

test('parseCsv: escaped double-quote inside a quoted field', () => {
  const { rows } = parseCsv('a\n"she said ""hi"""');
  assert.deepEqual(rows[0], ['she said "hi"']);
});

test('parseCsv: CRLF line endings are handled, \\r stripped', () => {
  const { header, rows } = parseCsv('a,b\r\n1,2\r\n');
  assert.deepEqual(header, ['a', 'b']);
  assert.deepEqual(rows[0], ['1', '2']);
});

test('parseCsv: blank lines are dropped, not parsed as rows', () => {
  const { rows } = parseCsv('a,b\n1,2\n\n3,4\n');
  assert.equal(rows.length, 2);
});

test('parseCsv: non-string / empty input → empty', () => {
  for (const g of [null, undefined, 42, '', {}]) {
    const r = parseCsv(g);
    assert.deepEqual(r.header, []);
    assert.deepEqual(r.rows, []);
  }
});

// ---------------- inferColumns ----------------
const TABLE = parseCsv([
  'id,age,plan,flag,blank,const',
  'A1,20,basic,yes,,x',
  'A2,30,pro,no,,x',
  'A3,40,basic,yes,,x',
  'A4,25,pro,no,,x',
].join('\n'));

test('inferColumns: numeric detected by value share and >2 distinct', () => {
  const cols = inferColumns(TABLE.header, TABLE.rows);
  const age = cols.find((c) => c.name === 'age');
  assert.equal(age.kind, 'numeric');
  assert.equal(age.numericShare, 1);
});

test('inferColumns: low-cardinality strings → categorical with sorted levels', () => {
  const cols = inferColumns(TABLE.header, TABLE.rows);
  const plan = cols.find((c) => c.name === 'plan');
  assert.equal(plan.kind, 'categorical');
  assert.deepEqual(plan.levels, ['basic', 'pro']);
});

test('inferColumns: a unique-per-row column is an id (excluded later)', () => {
  const cols = inferColumns(TABLE.header, TABLE.rows);
  assert.equal(cols.find((c) => c.name === 'id').kind, 'id');
});

test('inferColumns: all-blank → empty; single-value → constant', () => {
  const cols = inferColumns(TABLE.header, TABLE.rows);
  assert.equal(cols.find((c) => c.name === 'blank').kind, 'empty');
  assert.equal(cols.find((c) => c.name === 'const').kind, 'constant');
});

test('inferColumns: binary column is categorical (distinct===2), not numeric', () => {
  const cols = inferColumns(TABLE.header, TABLE.rows);
  const flag = cols.find((c) => c.name === 'flag');
  assert.equal(flag.kind, 'categorical');
  assert.equal(flag.distinct, 2);
});

test('inferColumns: garbage args → []', () => {
  assert.deepEqual(inferColumns(null, []), []);
  assert.deepEqual(inferColumns(['a'], null), []);
});

test('inferColumns: a binary NUMERIC column (0/1) is categorical, not numeric', () => {
  // distinct === 2 must stay categorical so it can be a target; the numeric>2 rule must not grab it.
  const cols = inferColumns(['flag'], [['0'], ['1'], ['0'], ['1']]);
  assert.equal(cols[0].kind, 'categorical');
});

test('inferColumns: numericShare exactly 0.95 with >2 distinct → numeric (>= boundary)', () => {
  const rows = [];
  for (let i = 1; i <= 19; i++) rows.push([String(i)]);  // 19 numeric, 19 distinct
  rows.push(['x']);                                       // 1 non-numeric → share = 19/20 = 0.95
  const col = inferColumns(['v'], rows)[0];
  assert.equal(col.numericShare, 0.95);
  assert.equal(col.kind, 'numeric');
});

test('inferColumns: distinct exactly 0.9*n → id (>= boundary), one below → categorical', () => {
  // 10 rows, 9 distinct string values (one repeat) → 9 >= 0.9*10 → id
  const nine = [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h'], ['i'], ['a']];
  assert.equal(inferColumns(['v'], nine)[0].kind, 'id');
  // 10 rows, 8 distinct (two repeats) → 8 < 9 → categorical
  const eight = [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h'], ['a'], ['b']];
  assert.equal(inferColumns(['v'], eight)[0].kind, 'categorical');
});

test('inferColumns: exactly CATEGORICAL_CAP (50) distinct, n large → categorical (not id)', () => {
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push(['v' + i]);      // 50 distinct
  for (let i = 0; i < 10; i++) rows.push(['v' + i]);      // repeats → n=60, 50 < 0.9*60=54
  const col = inferColumns(['v'], rows)[0];
  assert.equal(col.distinct, 50);
  assert.equal(col.kind, 'categorical');
});

test('inferColumns/cell: a short row reads missing trailing cells as empty, never "undefined"', () => {
  const { header, rows } = parseCsv('a,b,c\n1,2\n3,4');  // column c is always missing
  const c = inferColumns(header, rows).find((x) => x.name === 'c');
  assert.equal(c.kind, 'empty');   // missing cells → '' → no values, not the string "undefined"
});

test('inferColumns/cell: a non-array row never throws', () => {
  assert.doesNotThrow(() => inferColumns(['a', 'b'], [null, 5, ['x', 'y'], undefined]));
});

// ---------------- suggestTarget ----------------
test('suggestTarget: name-hint column wins over a plain binary', () => {
  const header = ['gender', 'churn'];
  const rows = [['M', 'yes'], ['F', 'no'], ['M', 'no']];
  const cols = inferColumns(header, rows);
  assert.equal(suggestTarget(cols, rows), 1);  // "churn" hint beats "gender"
});

test('suggestTarget: no hint → the LAST binary column', () => {
  const header = ['a', 'b'];
  const rows = [['p', 'x'], ['q', 'y'], ['p', 'x']];
  const cols = inferColumns(header, rows);
  assert.equal(suggestTarget(cols, rows), 1);
});

test('suggestTarget: nothing binary → -1', () => {
  const header = ['age'];
  const rows = [['1'], ['2'], ['3'], ['4']];
  assert.equal(suggestTarget(inferColumns(header, rows), rows), -1);
  assert.equal(suggestTarget(null, []), -1);
});

// ---------------- choosePositive ----------------
test('choosePositive: a hint value is positive regardless of frequency', () => {
  const counts = new Map([['yes', 100], ['no', 3]]);
  assert.equal(choosePositive(['yes', 'no'], counts), 'yes');
});

test('choosePositive: no hint → the rarer value is positive (both directions)', () => {
  assert.equal(choosePositive(['big', 'small'], new Map([['big', 90], ['small', 10]])), 'small');   // rarer is vals[1]
  assert.equal(choosePositive(['rare', 'common'], new Map([['rare', 5], ['common', 80]])), 'rare');  // rarer is vals[0]
});

test('choosePositive: an exact tie (equal counts) → the first value', () => {
  assert.equal(choosePositive(['p', 'q'], new Map([['p', 7], ['q', 7]])), 'p');  // <= boundary: ties go to vals[0]
});

test('choosePositive: garbage args → null, never throws', () => {
  assert.equal(choosePositive(null, new Map()), null);
  assert.equal(choosePositive(['a', 'b'], {}), null);          // counts not a Map
  assert.doesNotThrow(() => choosePositive(42, new Map()));    // non-iterable vals must not reach the for-loop
  assert.equal(choosePositive(42, new Map()), null);
});

// ---------------- encode ----------------
const E = parseCsv(['age,plan,churn', '20,basic,no', '40,pro,yes', '30,basic,no', '50,pro,yes'].join('\n'));
const ECOLS = inferColumns(E.header, E.rows);

test('encode: numeric passes through, categorical → one indicator per level', () => {
  const r = encode(E.rows, ECOLS, 2, [0, 1]);   // target=churn, features=age,plan
  assert.deepEqual(r.featureNames, ['age', 'plan = basic', 'plan = pro']);
  assert.deepEqual(r.cases[0].x, [20, 1, 0]);    // age 20, plan=basic→1, plan=pro→0
  assert.deepEqual(r.cases[1].x, [40, 0, 1]);
});

test('encode: positive class (churn hint) → y=1 for "yes"', () => {
  const r = encode(E.rows, ECOLS, 2, [0, 1]);
  assert.equal(r.positiveLabel, 'yes');
  assert.deepEqual(r.cases.map((c) => c.y), [0, 1, 0, 1]);
});

test('encode: with no hint words, the positive class is the rarer one (exercises the real counts)', () => {
  // target "move" has values go(1)/keep(4), neither a hint; the rare "go" appears FIRST.
  // correct counting → go is rarer → positive; a corrupted count (||→&& NaN, or +1→-1) would pick keep.
  const m = parseCsv(['id,move', 'a,go', 'b,keep', 'c,keep', 'd,keep', 'e,keep'].join('\n'));
  const cols = inferColumns(m.header, m.rows);
  const r = encode(m.rows, cols, 1, [0]);
  assert.equal(r.positiveLabel, 'go');
  assert.deepEqual(r.cases.map((c) => c.y), [1, 0, 0, 0, 0]);
});

test('encode: rows with a missing target are dropped', () => {
  const m = parseCsv(['age,churn', '20,yes', '30,', '40,no'].join('\n'));
  const cols = inferColumns(m.header, m.rows);
  const r = encode(m.rows, cols, 1, [0]);
  assert.equal(r.cases.length, 2);   // the blank-target row is gone
});

test('encode: a non-binary target → empty (needs exactly two classes)', () => {
  const m = parseCsv(['x,y', '1,a', '2,b', '3,c'].join('\n'));
  const cols = inferColumns(m.header, m.rows);
  assert.deepEqual(encode(m.rows, cols, 1, [0]).cases, []);
});

test('encode: bad target index or garbage → empty, never throws', () => {
  assert.deepEqual(encode(E.rows, ECOLS, 99, [0]).cases, []);
  assert.deepEqual(encode(null, ECOLS, 2, [0]).cases, []);
  assert.doesNotThrow(() => encode(E.rows, ECOLS, 2, null));
});

// ---------------- prepare (end-to-end) ----------------
test('prepare: picks the hinted target, encodes the rest, returns cases + names', () => {
  const p = prepare(['age,plan,churn', '20,basic,no', '40,pro,yes', '30,basic,no', '55,pro,yes'].join('\n'));
  assert.equal(p.targetName, 'churn');
  assert.equal(p.nrows, 4);
  assert.deepEqual(p.featureNames, ['age', 'plan = basic', 'plan = pro']);
  assert.equal(p.cases.length, 4);
  assert.equal(p.positiveLabel, 'yes');
});

test('prepare: opts.targetName overrides the suggestion', () => {
  const csv = ['a,b', 'x,yes', 'y,no', 'x,no'].join('\n');
  const p = prepare(csv, { targetName: 'a' });
  assert.equal(p.targetName, 'a');
});

test('prepare: garbage never throws, returns an empty shape', () => {
  for (const g of [null, undefined, 42, '', 'no,commas,here']) {
    assert.doesNotThrow(() => prepare(g));
    const p = prepare(g);
    assert.ok(Array.isArray(p.cases));
  }
});
