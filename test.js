// Passgen テスト
// 実行: node test.js

const fs = require('fs');

// dict.js と index.html の JS エンジン部分をロード
const dict = fs.readFileSync('dict.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const engineEnd = m[1].indexOf('// ===== 共通 =====');
const engine = m[1].substring(0, engineEnd);

// crypto.getRandomValues polyfill for Node
const { webcrypto } = require('crypto');
const _crypto = { getRandomValues: (a) => { webcrypto.getRandomValues(a); return a; } };
const setup = '';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL:', msg); }
}

function runTests() {
  const ctx = new Function('crypto', setup + dict + engine + '; return { rand, pick, cap, SYL, SYL_START, synthWord, pickDictWord, pickWord, genPw, WORD_LIST, PAT, SYM_STD, SYM_SAFE, SYM_ALL };')(_crypto);

  console.log('===== Passgen Test Suite =====\n');

  // --- 1. 辞書 ---
  console.log('[1] Dictionary');
  assert(ctx.WORD_LIST.length > 500, 'WORD_LIST should have 500+ entries, got ' + ctx.WORD_LIST.length);
  assert(ctx.WORD_LIST.every(w => w.length === 2), 'Every entry should be [romaji, kana]');
  assert(ctx.WORD_LIST.every(w => w[0].length >= 1 && w[1].length >= 1), 'No empty romaji or kana');
  assert(ctx.WORD_LIST.every(w => /^[a-z]+$/.test(w[0])), 'All romaji should be lowercase ascii');
  // 重複チェック
  const romajiSet = new Set(ctx.WORD_LIST.map(w => w[0]));
  assert(romajiSet.size === ctx.WORD_LIST.length, 'No duplicate romaji (unique: ' + romajiSet.size + ', total: ' + ctx.WORD_LIST.length + ')');
  console.log('  Dict size: ' + ctx.WORD_LIST.length);

  // --- 2. 音節テーブル ---
  console.log('[2] Syllable Table');
  assert(ctx.SYL.length >= 100, 'SYL should have 100+ syllables, got ' + ctx.SYL.length);
  assert(ctx.SYL.every(s => s.length === 2), 'Every syllable should be [romaji, kana]');
  assert(ctx.SYL_START.every(s => s[0] !== 'n' || s[0].length > 1), 'SYL_START should exclude standalone "n"');
  assert(ctx.SYL_START.length < ctx.SYL.length, 'SYL_START should be smaller than SYL');
  console.log('  SYL: ' + ctx.SYL.length + ', SYL_START: ' + ctx.SYL_START.length);

  // --- 3. 音節合成 ---
  console.log('[3] Syllable Synthesis');
  for (let i = 0; i < 50; i++) {
    const [r, k] = ctx.synthWord(4);
    assert(r.length >= 2, 'synthWord romaji too short: "' + r + '"');
    assert(r.length <= 12, 'synthWord romaji too long: "' + r + '"');
    assert(k.length >= 1, 'synthWord kana empty for "' + r + '"');
    assert(/^[a-z]+$/.test(r), 'synthWord romaji should be lowercase: "' + r + '"');
  }
  // ン で終わる語が生成されるか (最後の音節にンが使える)
  let hasN = false;
  for (let i = 0; i < 200; i++) {
    const [r] = ctx.synthWord(5);
    if (r.endsWith('n') && !r.endsWith('an') && !r.endsWith('in') && !r.endsWith('un') && !r.endsWith('en') && !r.endsWith('on')) {
      // standalone n at end? Actually "n" syllable always produces just "n"
    }
    if (r.endsWith('n')) hasN = true;
  }
  // hasN は高確率だが保証はないので weak assertion
  console.log('  synthWord "n"-ending found: ' + hasN);

  // --- 4. CSPRNG ---
  console.log('[4] CSPRNG (rand)');
  const freq = new Array(10).fill(0);
  for (let i = 0; i < 10000; i++) freq[ctx.rand(10)]++;
  const min = Math.min(...freq), max = Math.max(...freq);
  assert(min > 700, 'rand distribution min should be > 700, got ' + min);
  assert(max < 1300, 'rand distribution max should be < 1300, got ' + max);
  console.log('  Distribution (10000 samples, range 0-9): min=' + min + ' max=' + max);

  // --- 5. パスワード生成 ---
  console.log('[5] Password Generation');
  const lengths = { short: [], medium: [], long: [] };
  for (const lp of ['short', 'medium', 'long']) {
    for (let i = 0; i < 100; i++) {
      const pw = ctx.genPw(lp, 'standard');
      lengths[lp].push(pw.length);
      assert(pw.password.length > 0, 'password should not be empty');
      assert(pw.readingRomaji.includes('-'), 'readingRomaji should contain "-": ' + pw.readingRomaji);
      assert(pw.readingKana.includes('-'), 'readingKana should contain "-": ' + pw.readingKana);
      assert(pw.entropy > 0, 'entropy should be positive');
      assert(pw.length === pw.password.length, 'length should match password length');
      assert(/[A-Z]/.test(pw.password), 'password should contain uppercase: ' + pw.password);
      assert(/[0-9]/.test(pw.password), 'password should contain digit: ' + pw.password);
      assert(/[^A-Za-z0-9]/.test(pw.password), 'password should contain symbol: ' + pw.password);
    }
    const avg = (lengths[lp].reduce((a, b) => a + b, 0) / lengths[lp].length).toFixed(1);
    const mn = Math.min(...lengths[lp]), mx = Math.max(...lengths[lp]);
    console.log('  ' + lp + ': avg=' + avg + ' min=' + mn + ' max=' + mx);
  }
  // short < medium < long (average)
  const avgS = lengths.short.reduce((a, b) => a + b, 0) / 100;
  const avgM = lengths.medium.reduce((a, b) => a + b, 0) / 100;
  const avgL = lengths.long.reduce((a, b) => a + b, 0) / 100;
  assert(avgS < avgM, 'short avg should < medium avg (' + avgS.toFixed(1) + ' < ' + avgM.toFixed(1) + ')');
  assert(avgM < avgL, 'medium avg should < long avg (' + avgM.toFixed(1) + ' < ' + avgL.toFixed(1) + ')');

  // --- 6. 特殊文字セット ---
  console.log('[6] Symbol Sets');
  for (const ss of ['standard', 'safe', 'all']) {
    const syms = ss === 'safe' ? ctx.SYM_SAFE : ss === 'all' ? ctx.SYM_ALL : ctx.SYM_STD;
    let found = new Set();
    for (let i = 0; i < 200; i++) {
      const pw = ctx.genPw('medium', ss);
      for (const c of pw.password) {
        if (syms.includes(c)) found.add(c);
      }
    }
    assert(found.size >= 3, ss + ': should use 3+ different symbols, got ' + found.size + ' (' + [...found].join('') + ')');
    console.log('  ' + ss + ': symbols used = ' + [...found].join(''));
  }

  // --- 7. パターン多様性 ---
  console.log('[7] Pattern Variety');
  assert(ctx.PAT.length === 10, 'Should have 10 patterns, got ' + ctx.PAT.length);
  const patStarts = new Set();
  for (let i = 0; i < 200; i++) {
    const pw = ctx.genPw('medium', 'standard');
    patStarts.add(pw.password[0]);
  }
  assert(patStarts.size >= 5, 'Password start chars should vary, got ' + patStarts.size + ' unique');
  console.log('  Start char variety: ' + patStarts.size + ' unique');

  // --- 8. ハイブリッドモード比率 ---
  console.log('[8] Hybrid Mode (dict vs synth)');
  let dictHits = 0, synthHits = 0;
  const romajiLookup = new Set(ctx.WORD_LIST.map(w => w[0]));
  for (let i = 0; i < 500; i++) {
    const pw = ctx.genPw('medium', 'standard');
    const parts = pw.readingRomaji.split('-');
    for (const p of parts) {
      if (romajiLookup.has(p)) dictHits++; else synthHits++;
    }
  }
  const total = dictHits + synthHits;
  const synthPct = (100 * synthHits / total).toFixed(0);
  const dictPct = (100 * dictHits / total).toFixed(0);
  assert(synthHits > total * 0.2, 'Synth should be >20%, got ' + synthPct + '%');
  assert(dictHits > total * 0.2, 'Dict should be >20%, got ' + dictPct + '%');
  console.log('  dict=' + dictPct + '% synth=' + synthPct + '% (target: ~50/50)');

  // --- 9. 重複チェック ---
  console.log('[9] Uniqueness');
  const pwSet = new Set();
  for (let i = 0; i < 1000; i++) {
    pwSet.add(ctx.genPw('medium', 'standard').password);
  }
  assert(pwSet.size >= 990, '1000 passwords should be nearly all unique, got ' + pwSet.size + ' unique');
  console.log('  1000 generated: ' + pwSet.size + ' unique');

  // --- 10. CSV Quote ---
  console.log('[10] CSV Quote');
  // csvQ is in the full script, extract it
  const fullJs = m[1];
  const csvQMatch = fullJs.match(/function csvQ\([^)]*\)\{[^}]+\}/);
  assert(csvQMatch, 'csvQ function should exist in HTML');
  if (csvQMatch) {
    const csvQ = new Function(csvQMatch[0] + '; return csvQ;')();
    assert(csvQ('hello') === 'hello', 'csvQ plain');
    assert(csvQ('he,llo') === '"he,llo"', 'csvQ comma');
    assert(csvQ('he"llo') === '"he""llo"', 'csvQ double-quote');
  }

  // --- Results ---
  console.log('\n===== Results =====');
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  if (failed > 0) process.exit(1);
  else console.log('ALL TESTS PASSED');
}

runTests();
