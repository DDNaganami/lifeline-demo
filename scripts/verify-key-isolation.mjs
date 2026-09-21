/**
 * 确认新 key 只在 .env 里，没有跑到任何其他文件或 git 历史里
 * 用法：node scripts/verify-key-isolation.mjs
 *
 * ⚠️ 这个脚本**不打印 key**，只报"在哪找到了/没找到"。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

/** 这个脚本只关心"有没有问题"，所以只累计 fail；通过数没有用途 */
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (!ok) fail++;
}

/* 从 .env 读出 key（只用于比对，不打印）。
   ⚠️ 要先去 BOM——Windows 上不少工具写文件会带 UTF-8 BOM，
      否则第一行的键会变成 \uFEFFDS_KEY，匹配不上，检查会误报"没有配置"。 */
let envText = readFileSync('.env', 'utf8');
if (envText.charCodeAt(0) === 0xfeff) envText = envText.slice(1);
const m = envText.match(/^DS_KEY=(.+)$/m);
if (!m) {
  console.error('❌ .env 里没有 DS_KEY（检查一下文件开头有没有 BOM，或键名拼错了）');
  process.exit(1);
}
const KEY = m[1].trim();
// 只显示前 6 位用于确认身份，**不显示全串**
const fingerprint = KEY.slice(0, 6) + '…' + KEY.slice(-4);
console.log(`当前 key 指纹：${fingerprint}（长度 ${KEY.length}）\n`);

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.shots', '_review', '.dsh-drop']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

console.log('=== 1. 除 .env 外，任何文件都不能含这个 key ===');
const files = walk('.');
const leaks = [];
for (const f of files) {
  if (f === '.env' || f.endsWith('\\.env') || f.endsWith('/.env')) continue;
  // 跳过二进制与压缩包
  if (/\.(zip|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i.test(f)) continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  if (text.includes(KEY)) leaks.push(relative('.', f));
}
if (leaks.length === 0) {
  console.log(`  ✅ 扫描 ${files.length} 个文件，只有 .env 里有（正确）`);
} else {
  for (const l of leaks) console.log(`  ❌ ${l} 里有明文 key`);
  fail += leaks.length;
}

console.log('\n=== 2. git 历史里绝对不能有 ===');
try {
  const revs = execSync('git rev-list --all', { encoding: 'utf8' }).split('\n').filter(Boolean);
  let hits = [];
  try {
    hits = execSync(`git grep -I -n "${KEY}" ${revs.join(' ')}`, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    /* 没匹配到会返回非 0 */
  }
  if (hits.length === 0) {
    console.log(`  ✅ ${revs.length} 个提交的完整历史里没有这个 key`);
  } else {
    for (const h of hits.slice(0, 3)) console.log(`  ❌ ${h.slice(0, 120)}`);
    fail += hits.length;
  }
} catch (e) {
  console.log(`  ⚠️ 无法检查：${e.message}`);
}

console.log('\n=== 3. .env 必须被 git 忽略 ===');
try {
  const ignored = execSync('git check-ignore -v .env', { encoding: 'utf8' }).trim();
  console.log(`  ✅ ${ignored}`);
} catch {
  console.log('  ❌ .env 没有被忽略！');
  fail++;
}
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const envTracked = tracked.filter((f) => f === '.env' || f.endsWith('/.env'));
  check('.env 不在 git 跟踪列表里', envTracked.length === 0, envTracked.join(', '));
} catch {
  /* 忽略 */
}

console.log('\n=== 4. 构建产物里不能有 ===');
let builtLeak = 0;
try {
  for (const f of walk('out')) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(KEY)) builtLeak++;
  }
} catch {
  /* 没有 out 就跳过 */
}
check('out/ 里没有 key', builtLeak === 0);

console.log('\n=== 5. 客户端代码不能引用服务端密钥变量 ===');
const clientFiles = files.filter(
  (f) => (f.endsWith('.tsx') || f.startsWith(join('components')) || f.startsWith(join('app'))) && !f.includes('scripts'),
);
let clientRef = 0;
for (const f of clientFiles) {
  const text = readFileSync(f, 'utf8');
  if (/process\.env\.DS_KEY|DS_KEY/.test(text)) {
    console.log(`  ❌ ${relative('.', f)} 提到 DS_KEY`);
    clientRef++;
  }
}
check(`${clientFiles.length} 个客户端文件都没引用 DS_KEY`, clientRef === 0);

/**
 * 第 6 项：历史里不能有任何"不是当前 key"的 sk- 长串。
 *
 * ⚠️ 这里**不写旧 key 的任何片段**——写了就等于把泄漏过的密钥又记在源码里一次。
 *    这正是上次出事的模式：为了让检查认出某个 key，把那个 key 写进了检查脚本。
 *    正确做法：**只按模式找，不按具体值找**。
 */
console.log('\n=== 6. 历史里不能有任何"不是当前 key"的 sk- 长串 ===');
const SK_PATTERN = 'sk-[A-Za-z0-9]{16,}';
// 从历史里把所有 sk- 长串抽出来（只取摘要用于报告，不打印全串）
const foundTokens = new Set();
try {
  const revs = execSync('git rev-list --all', { encoding: 'utf8' }).split('\n').filter(Boolean);
  let hits = [];
  try {
    hits = execSync(`git grep -I -o -E "${SK_PATTERN}" ${revs.join(' ')}`, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    /* 没匹配到 */
  }
  for (const line of hits) {
    const token = line.split(':').pop()?.trim() ?? '';
    if (token) foundTokens.add(token);
  }
} catch (e) {
  console.log(`  ⚠️ 无法读取历史：${e.message}`);
}

const others = [...foundTokens].filter((t) => t !== KEY);
if (others.length === 0) {
  console.log(
    foundTokens.size === 0
      ? '  ✅ 历史里没有任何 sk- 长串'
      : `  ✅ 历史里只有当前 key 的 1 个指纹（无其他残留）`,
  );
} else {
  console.log(`  ❌ 历史里有 ${others.length} 个不是当前 key 的 sk- 长串：`);
  for (const t of others.slice(0, 5)) {
    // 只显示头尾，便于识别是哪个，但不完整打印
    console.log(`     ${t.slice(0, 6)}…${t.slice(-4)}（长度 ${t.length}）`);
  }
  console.log('     处理：立刻在服务商后台作废该 key，再用 git filter-repo 清理历史');
  fail += others.length;
}

// 顺带：工作区里也不能有任何 sk- 长串（除了 .env）
console.log('\n=== 7. 工作区里不能有任何 sk- 长串（除 .env）===');
const wsLeaks = [];
for (const f of files) {
  if (f === '.env' || f.endsWith('\\' + '.env') || f.endsWith('/.env')) continue;
  if (/\.(zip|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i.test(f)) continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const tk = text.match(new RegExp(SK_PATTERN, 'g'));
  if (tk) wsLeaks.push({ file: relative('.', f), tokens: tk.map((t) => t.slice(0, 6) + '…') });
}
if (wsLeaks.length === 0) {
  console.log('  ✅ 没有');
} else {
  for (const l of wsLeaks) console.log(`  ❌ ${l.file}：${l.tokens.join(', ')}`);
  console.log('     注意：文档或注释里写"格式示例"应使用 sk-xxxx 这类显然假的写法');
  fail += wsLeaks.length;
}

console.log(`\n=== ${fail === 0 ? '✅ 通过：新 key 只存在于 .env 里' : `❌ 发现 ${fail} 处问题`} ===`);
process.exit(fail > 0 ? 1 : 0);
