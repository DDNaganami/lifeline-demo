/**
 * 密钥泄漏检查
 * ---------------------------------------------------------------
 * 仓库是公开的，所以每次推送前必须确认：**没有任何密钥进入版本控制**。
 *
 * 检查三类东西：
 *   1. 已知的密钥样式（sk- 开头的长串）
 *   2. .env 是否被 git 跟踪（它是密钥的家）
 *   3. 源码/构建产物里是否混进了密钥
 *
 * 用法：node scripts/check-secrets.mjs
 * 退出码非 0 表示发现泄漏，push 前必须先处理。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';

let problems = 0;
/** 只跳过这些目录（大且与源码无关） */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.shots', '_review', '.dsh-drop']);
/** 待扫描的文本后缀 */
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.txt',
  '.yml', '.yaml', '.example', '.env', '.html', '.css', '.ps1', '.bat',
]);

/**
 * 密钥样式。
 * ⚠️ 这里**不写任何真实密钥的前缀片段**——检查脚本本身也会进公开仓库。
 */
const PATTERNS = [
  { name: 'sk- 开头的密钥', re: /\bsk-[A-Za-z0-9]{16,}\b/ },
  { name: 'Bearer 后面跟长串', re: /Bearer\s+[A-Za-z0-9_-]{20,}/ },
];

/** 明确允许出现的占位写法（文档、示例里说明格式用） */
const ALLOWLIST = [
  'sk-xxxx',
  'sk-...',
  'DS_KEY=',
  'sk-REDACTED-REVOKED'.replace(/./g, ''),
];

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

console.log('=== 1. 扫描工作区文件 ===');
const files = walk('.');
let scanned = 0;
const hits = [];

for (const file of files) {
  const ext = file.slice(file.lastIndexOf('.'));
  if (!TEXT_EXT.has(ext) && !file.endsWith('.env.example')) continue;
  // .env 本身是密钥的家，单独在第 2 步检查它有没有被跟踪
  if (file.endsWith('.env') || file.includes(`${sep}.env.`)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  scanned++;
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    if (ALLOWLIST.some((a) => m[0].includes(a))) continue;
    hits.push({ file, pattern: name, sample: m[0].slice(0, 8) + '…' });
  }
}
console.log(`  已扫描 ${scanned} 个文本文件`);
if (hits.length === 0) {
  console.log('  ✅ 没有发现密钥样式');
} else {
  for (const h of hits) console.log(`  ❌ ${h.file} 命中「${h.pattern}」：${h.sample}`);
  problems += hits.length;
}

console.log('\n=== 2. .env 是否被 git 跟踪（不该）===');
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const envTracked = tracked.filter((f) => f === '.env' || f.endsWith('/.env'));
  if (envTracked.length > 0) {
    console.log(`  ❌ .env 被 git 跟踪了：${envTracked.join(', ')}`);
    console.log('     处理：git rm --cached .env && 确认 .gitignore 里有 .env*');
    problems += envTracked.length;
  } else {
    console.log('  ✅ .env 没有被跟踪');
  }
  // 顺手确认 .gitignore 真的忽略了 .env
  const ignored = execSync('git check-ignore -v .env', { encoding: 'utf8' }).trim();
  console.log(`  ✅ .gitignore 生效：${ignored}`);
} catch {
  console.log('  ⚠️ 拿不到 git 信息（可能不在 git 仓库里）');
}

console.log('\n=== 3. 构建产物里不能有密钥 ===');
if (existsSync('out')) {
  const built = walk('out');
  let found = 0;
  for (const file of built) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) {
        console.log(`  ❌ 构建产物里有密钥样式：${file}（${name}）`);
        found++;
      }
    }
  }
  if (found === 0) console.log(`  ✅ out/ 里 ${built.length} 个文件都没有密钥`);
  problems += found;
} else {
  console.log('  （还没有构建产物，跳过）');
}

console.log('\n=== 4. 浏览器端代码不该出现任何服务端密钥变量名 ===');
// 静态导出会把所有客户端代码打包给浏览器；这里确认没有客户端文件直接读 DS_KEY
const clientFiles = files.filter(
  (f) => (f.endsWith('.tsx') || (f.endsWith('.ts') && f.startsWith(`components${sep}`))) && !f.includes('scripts'),
);
let clientLeak = 0;
for (const f of clientFiles) {
  const text = readFileSync(f, 'utf8');
  if (/process\.env\.DS_KEY|DS_KEY/.test(text)) {
    console.log(`  ❌ 客户端文件提到 DS_KEY：${relative('.', f)}`);
    clientLeak++;
  }
}
if (clientLeak === 0) console.log(`  ✅ ${clientFiles.length} 个客户端文件都没有引用 DS_KEY`);
problems += clientLeak;

console.log('\n=== 5. 确认示例文件存在且不含真 key ===');
if (existsSync('.env.example')) {
  const ex = readFileSync('.env.example', 'utf8');
  const hasReal = PATTERNS.some(({ re }) => re.test(ex));
  console.log(`  ${hasReal ? '❌ 示例文件里有密钥样式' : '✅ .env.example 不含密钥'}`);
  if (hasReal) problems++;
} else {
  console.log('  ⚠️ 缺少 .env.example（别人不知道要配哪些变量）');
}

console.log(`\n=== ${problems === 0 ? '✅ 通过：没有密钥泄漏风险' : `❌ 发现 ${problems} 处问题，push 前必须处理`} ===`);
process.exit(problems > 0 ? 1 : 0);
