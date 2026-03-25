// Passgen テスト
// 実行: node test.js

const fs = require('fs');
const { webcrypto } = require('crypto');
const _crypto = { getRandomValues: (a) => { webcrypto.getRandomValues(a); return a; } };

const dict = fs.readFileSync('dict.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const engineEnd = m[1].indexOf('// ===== 共通 =====');
const engine = m[1].substring(0, engineEnd);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL:', msg); }
}

function runTests() {
  const ctx = new Function('crypto', dict + engine + '; return { rand, pick, cap, SYL, SYL_START, synthWord, pickDictWord, pickWord, genPw, WORD_LIST, PAT, SYM_STD, SYM_SAFE, SYM_ALL, POLICIES, WORD_SPEC };')(_crypto);

  console.log('===== Passgen Test Suite =====\n');

  // --- 1. 辞書 ---
  console.log('[1] Dictionary');
  assert(ctx.WORD_LIST.length > 500, 'WORD_LIST should have 500+ entries, got ' + ctx.WORD_LIST.length);
  assert(ctx.WORD_LIST.every(w => w.length === 2), 'Every entry should be [romaji, kana]');
  assert(ctx.WORD_LIST.every(w => w[0].length >= 1 && w[1].length >= 1), 'No empty romaji or kana');
  assert(ctx.WORD_LIST.every(w => /^[a-z]+$/.test(w[0])), 'All romaji should be lowercase ascii');
  const romajiSet = new Set(ctx.WORD_LIST.map(w => w[0]));
  assert(romajiSet.size === ctx.WORD_LIST.length, 'No duplicate romaji');
  console.log('  Dict size: ' + ctx.WORD_LIST.length);

  // --- 2. 音節テーブル ---
  console.log('[2] Syllable Table');
  assert(ctx.SYL.length >= 100, 'SYL should have 100+ syllables, got ' + ctx.SYL.length);
  assert(ctx.SYL.every(s => s.length === 2), 'Every syllable should be [romaji, kana]');
  assert(ctx.SYL_START.every(s => s[0] !== 'n' || s[0].length > 1), 'SYL_START excludes standalone "n"');
  console.log('  SYL: ' + ctx.SYL.length + ', SYL_START: ' + ctx.SYL_START.length);

  // --- 3. 音節合成 ---
  console.log('[3] Syllable Synthesis');
  for (let i = 0; i < 50; i++) {
    const [r, k] = ctx.synthWord(4, 2);
    assert(r.length >= 2, 'synthWord romaji too short: "' + r + '"');
    assert(r.length <= 12, 'synthWord romaji too long: "' + r + '"');
    assert(k.length >= 1, 'synthWord kana empty');
    assert(/^[a-z]+$/.test(r), 'synthWord romaji lowercase: "' + r + '"');
  }

  // --- 4. CSPRNG ---
  console.log('[4] CSPRNG');
  const freq = new Array(10).fill(0);
  for (let i = 0; i < 10000; i++) freq[ctx.rand(10)]++;
  const min = Math.min(...freq), max = Math.max(...freq);
  assert(min > 700, 'rand min > 700, got ' + min);
  assert(max < 1300, 'rand max < 1300, got ' + max);
  console.log('  10000 samples: min=' + min + ' max=' + max);

  // --- 5. ポリシー定義 ---
  console.log('[5] Policy Definitions');
  const policyIds = ['gws', 'm365', 'apple', 'ad', 'ipa', 'nist', 'pci', 'custom'];
  for (const id of policyIds) {
    assert(ctx.POLICIES[id], 'Policy ' + id + ' should exist');
    assert(ctx.POLICIES[id].minLen >= 7, id + ' minLen >= 7');
    assert(ctx.POLICIES[id].wordHint, id + ' should have wordHint');
  }
  console.log('  ' + policyIds.length + ' policies defined');

  // --- 6. ポリシー別パスワード生成 + ポリシー準拠チェック ---
  console.log('[6] Policy Compliance (100 passwords each)');
  const nonCustomPolicies = policyIds.filter(id => id !== 'custom');
  for (const id of nonCustomPolicies) {
    const pol = ctx.POLICIES[id];
    let passCount = 0, failReasons = [];
    const lens = [];
    for (let i = 0; i < 100; i++) {
      const pw = ctx.genPw(id, 'standard');
      assert(pw.password.length > 0, id + ': password not empty');
      assert(pw.readingRomaji.includes('-'), id + ': reading has dash');
      assert(pw.readingKana.includes('-'), id + ': kana has dash');
      assert(pw.entropy > 0, id + ': entropy positive');
      lens.push(pw.length);

      // ポリシー準拠チェック
      let ok = true;
      if (pw.length < pol.minLen) { ok = false; failReasons.push('len=' + pw.length + '<' + pol.minLen); }
      if (pol.needUpper && !/[A-Z]/.test(pw.password)) { ok = false; failReasons.push('no upper'); }
      if (pol.needLower && !/[a-z]/.test(pw.password)) { ok = false; failReasons.push('no lower'); }
      if (pol.needDigit && !/[0-9]/.test(pw.password)) { ok = false; failReasons.push('no digit'); }
      if (pol.needSymbol && !/[^A-Za-z0-9]/.test(pw.password)) { ok = false; failReasons.push('no symbol'); }
      if (ok) passCount++;
    }
    const avg = (lens.reduce((a, b) => a + b) / 100).toFixed(1);
    const mn = Math.min(...lens), mx = Math.max(...lens);
    const pct = passCount;
    assert(pct >= 98, id + ': compliance should be >= 98%, got ' + pct + '%' + (failReasons.length ? ' (' + failReasons.slice(0, 3).join(', ') + ')' : ''));
    console.log('  ' + id.padEnd(8) + ': ' + pct + '% compliant, avg=' + avg + ' min=' + mn + ' max=' + mx);
  }

  // --- 7. 特殊文字セット ---
  console.log('[7] Symbol Sets');
  for (const ss of ['standard', 'safe', 'all']) {
    const syms = ss === 'safe' ? ctx.SYM_SAFE : ss === 'all' ? ctx.SYM_ALL : ctx.SYM_STD;
    let found = new Set();
    for (let i = 0; i < 200; i++) {
      const pw = ctx.genPw('ipa', ss);
      for (const c of pw.password) { if (syms.includes(c)) found.add(c); }
    }
    assert(found.size >= 3, ss + ': 3+ symbols used, got ' + found.size);
    console.log('  ' + ss + ': ' + [...found].join(''));
  }

  // --- 8. パターン多様性 ---
  console.log('[8] Pattern Variety');
  assert(ctx.PAT.length === 10, '10 patterns');
  const starts = new Set();
  for (let i = 0; i < 200; i++) starts.add(ctx.genPw('ipa', 'standard').password[0]);
  assert(starts.size >= 5, 'Start variety >= 5, got ' + starts.size);
  console.log('  Start chars: ' + starts.size + ' unique');

  // --- 9. ハイブリッドモード ---
  console.log('[9] Hybrid Mode');
  let dh = 0, sh = 0;
  const lookup = new Set(ctx.WORD_LIST.map(w => w[0]));
  for (let i = 0; i < 500; i++) {
    const pw = ctx.genPw('ipa', 'standard');
    for (const p of pw.readingRomaji.split('-')) {
      if (lookup.has(p)) dh++; else sh++;
    }
  }
  const t = dh + sh;
  assert(sh > t * 0.2, 'Synth >20%');
  assert(dh > t * 0.2, 'Dict >20%');
  console.log('  dict=' + (100 * dh / t).toFixed(0) + '% synth=' + (100 * sh / t).toFixed(0) + '%');

  // --- 10. ユニーク性 ---
  console.log('[10] Uniqueness');
  const pwSet = new Set();
  for (let i = 0; i < 1000; i++) pwSet.add(ctx.genPw('ipa', 'standard').password);
  assert(pwSet.size >= 990, '1000 passwords nearly all unique: ' + pwSet.size);
  console.log('  1000 generated: ' + pwSet.size + ' unique');

  // --- 11. CSV Quote ---
  console.log('[11] CSV Quote');
  const fullJs = m[1];
  const csvQMatch = fullJs.match(/function csvQ\([^)]*\)\{[^}]+\}/);
  assert(csvQMatch, 'csvQ function exists');
  if (csvQMatch) {
    const csvQ = new Function(csvQMatch[0] + '; return csvQ;')();
    assert(csvQ('hello') === 'hello', 'csvQ plain');
    assert(csvQ('he,llo') === '"he,llo"', 'csvQ comma');
    assert(csvQ('he"llo') === '"he""llo"', 'csvQ quote');
  }

  // --- 12. ポリシー間の長さ順序 ---
  console.log('[12] Policy Length Ordering');
  const avgByPolicy = {};
  for (const id of ['gws', 'ipa', 'pci']) {
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += ctx.genPw(id, 'standard').length;
    avgByPolicy[id] = sum / 200;
  }
  assert(avgByPolicy.gws < avgByPolicy.ipa, 'gws avg < ipa avg (' + avgByPolicy.gws.toFixed(1) + ' < ' + avgByPolicy.ipa.toFixed(1) + ')');
  assert(avgByPolicy.ipa < avgByPolicy.pci, 'ipa avg < pci avg (' + avgByPolicy.ipa.toFixed(1) + ' < ' + avgByPolicy.pci.toFixed(1) + ')');
  console.log('  gws=' + avgByPolicy.gws.toFixed(1) + ' < ipa=' + avgByPolicy.ipa.toFixed(1) + ' < pci=' + avgByPolicy.pci.toFixed(1));

  // --- Results ---
  console.log('\n===== Results =====');
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  if (failed > 0) process.exit(1);
  else console.log('ALL TESTS PASSED');
}

runTests();
