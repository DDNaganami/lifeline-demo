/**
 * 一键部署：构建 → 打包 → 上传 → 服务器上解压重启 → 外网验证
 *
 * 用法：node scripts/deploy.mjs
 *
 * 部署目标（见 deploy/服务器部署记录.md）：
 *   112.111.47.239 · Windows Server 2022 · SSH 25573 → 22
 *   运行目录 C:\LifeLine\LifeLine-Demo · 服务端口 18080
 *   外网访问 http://112.111.47.239:25572/
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IP = '112.111.47.239';
const SSH_PORT = '25573';
const PUBLIC_URL = 'http://112.111.47.239:25572';
/** 环境变量文件（含 API key）。**不进 git、不进 zip，单独 scp 上去** */
const ENV_FILE = resolve('.env');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
  return {
    code: r.status,
    out: (r.stdout ?? '').trim(),
    err: (r.stderr ?? '').trim(),
  };
}

/**
 * 执行一段本地 PowerShell。
 * 统一走 -EncodedCommand，避免中文路径与引号在不同 shell 下被吃掉
 * （这个坑在 .bat 与 Set-Content 上各踩过一次）。
 */
function localPs(script) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell', [
    '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text',
    '-EncodedCommand', b64,
  ]);
}

function step(n, title) {
  console.log(`\n${'='.repeat(56)}\n  ${n}. ${title}\n${'='.repeat(56)}`);
}

/** 在服务器上跑 PowerShell（Base64 编码，避免引号与中文被吃掉） */
function runPs(script) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return run('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    `administrator@${IP}`,
    '-p', SSH_PORT,
    `powershell -NoProfile -OutputFormat Text -EncodedCommand ${b64}`,
  ]);
}

const started = Date.now();

/* ---------------- 1. 构建 ---------------- */
step(1, '构建静态站点');

/**
 * 先做**服务端依赖自检**——本地就能发现"漏打包文件"。
 * 这一步是补上踩过的坑：server.js 引入新依赖但没进部署包，
 * 服务器启动报 Cannot find module，服务直接起不来（本地却看不出来）。
 */
const localProbe = run('node', ['deploy/probe.js', 'deploy']);
if (localProbe.code !== 0) {
  console.error(localProbe.out || localProbe.err);
  console.error('\n❌ 服务端依赖自检未通过，已中止部署');
  process.exit(1);
}
console.log('服务端依赖自检：通过');

/**
 * 注意 Windows 的两个坑：
 *   1. spawnSync 不能直接执行 .cmd（Node 会报 EINVAL），必须经过 shell
 *   2. 但传「args 数组 + shell:true」会触发弃用警告
 *      → 所以这里用「整条命令字符串 + shell」，两个问题都避开
 */
const build = run('npm run build', [], { shell: true });
if (build.code !== 0) {
  console.error(build.out);
  console.error(build.err);
  console.error('\n❌ 构建失败，已中止部署（线上仍是上一个可用版本）');
  process.exit(1);
}
const routeLine = build.out.split('\n').filter((l) => /[│├└]/.test(l)).join('\n');
console.log(routeLine || '构建完成');

/* ---------------- 2. 打包 ---------------- */
step(2, '打包');
const pkgDir = resolve('deploy/LifeLine-演示站');
const zipPath = resolve('deploy/LifeLine-演示站.zip');

/**
 * ⚠️ 打包目录里**不能留副本**。
 *
 * 这里踩过一个坑：原来只把新的 out/ 覆盖进打包目录，
 * 而 server.js 是**上一次手工放进去的旧副本**——
 * 于是每次部署都在装旧的服务端代码，
 * 表现是"新功能部署上去了但接口还是 404/405"。
 *
 * 现在改成：**两个产物每次都从权威源刷新**，
 * 保证"打包目录 = 当前构建 + 当前服务端代码"。
 */
const outDir = resolve(pkgDir, 'out');
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
localPs(`Copy-Item -Recurse -Force '${resolve('out')}' '${outDir}'`);

/**
 * 也要刷新打包目录里的**服务端配套文件**。
 *
 * 这里踩过一个坑：server.js 引入了新的依赖文件 ask-stats.js，
 * 但部署脚本只复制 out/ 和 server.js ——
 * 结果服务器启动就报 `Cannot find module './ask-stats'`，服务起不来。
 *
 * 所以：deploy/ 下**所有 .js 文件**都同步进打包目录，
 * 新增服务端文件时不用再改部署脚本。
 */
const SERVER_FILES = [];
for (const name of readdirSync(resolve('deploy'))) {
  if (name.endsWith('.js')) SERVER_FILES.push(name);
}
for (const name of SERVER_FILES) {
  localPs(`Copy-Item -Force '${resolve('deploy', name)}' '${resolve(pkgDir, name)}'`);
}
console.log(`服务端文件已刷新：${SERVER_FILES.join('、')}`);

// 自检：打包目录里的 server.js 必须与源文件一致
const serverSrc = resolve('deploy/server.js');
const serverDst = resolve(pkgDir, 'server.js');
if (!existsSync(serverDst) || statSync(serverDst).size !== statSync(serverSrc).size) {
  console.error('❌ 打包目录里的 server.js 与源文件不一致，已中止');
  process.exit(1);
}
console.log(`server.js 校验通过（${Math.round(statSync(serverSrc).size / 1024)} KB）`);

if (existsSync(zipPath)) rmSync(zipPath, { force: true });
const zip = localPs(
  `Compress-Archive -Path '${pkgDir}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal`,
);
if (zip.code !== 0 || !existsSync(zipPath)) {
  console.error(zip.err || zip.out);
  console.error('\n❌ 打包失败');
  process.exit(1);
}
const sizeKb = Math.round(statSync(zipPath).size / 1024);
console.log(`打包完成：${sizeKb} KB`);

/* ---------------- 3. 上传 ---------------- */
step(3, '上传到服务器');

/**
 * 先做密钥泄漏检查——**这是公开仓库，宁可多花 2 秒**。
 * 检查不通过就中止，绝不把密钥推上去。
 */
const secrets = run('node', ['scripts/check-secrets.mjs']);
if (secrets.code !== 0) {
  console.error(secrets.out);
  console.error('\n❌ 密钥检查未通过，已中止部署（请先处理上面列出的问题）');
  process.exit(1);
}
console.log('密钥检查：通过（仓库里没有密钥）');

const up = run('scp', [
  '-O', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
  '-P', SSH_PORT, zipPath, `administrator@${IP}:C:/LifeLine/demo.zip`,
]);
if (up.code !== 0) {
  console.error(up.err);
  console.error('\n❌ 上传失败');
  process.exit(1);
}
console.log('上传完成');

/**
 * 单独上传 .env（**不进 zip、不进 git**）。
 *
 * ⚠️ 三个刻意的设计：
 *   1. .env 放在部署包里会让它进入版本控制的历史——不行
 *   2. 不把 key 当命令行参数传（会进进程列表）；用文件传输
 *   3. 下面**不打印 .env 的内容**，只说"已上传"
 *
 * ⚠️ 上传前**去掉 BOM**：Windows 上不少工具（包括 PowerShell 的 `-Encoding UTF8`）
 *    写文件会加 UTF-8 BOM，导致服务端按行解析时第一行的键变成 `\uFEFFDS_KEY`，
 *    **匹配不上 → 静默变成"没配 key"**——服务照常启动，只是追问悄悄退回本地引擎。
 *    服务端的解析器已经能容忍 BOM，但这里先去掉更干净。
 */
if (existsSync(ENV_FILE)) {
  const envText = readFileSync(ENV_FILE, 'utf8');
  if (envText.charCodeAt(0) === 0xfeff) {
    writeFileSync(ENV_FILE, envText.slice(1), 'utf8');
    console.log('配置文件：已去掉开头 BOM');
  }
  const upEnv = run('scp', [
    '-O', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
    '-P', SSH_PORT, ENV_FILE, `administrator@${IP}:C:/LifeLine/LifeLine-Demo/.env`,
  ]);
  if (upEnv.code === 0) {
    console.log('配置文件 .env 已上传（内容不打印）');
  } else {
    console.log('⚠️ .env 上传失败——追问会退回本地回答引擎（其他功能不受影响）');
  }
} else {
  console.log('本地没有 .env —— 服务器上的追问会使用本地回答引擎');
}

/* ---------------- 4. 服务器上解压并重启 ---------------- */
step(4, '解压并重启服务');
const deploy = runPs(`
$tmp = 'C:\\LifeLine\\_extract'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path C:\\LifeLine\\demo.zip -DestinationPath $tmp -Force
if (-not (Test-Path "$tmp\\out\\index.html")) { Write-Host 'FAIL: 解压后找不到 out'; exit 1 }
# 先停服务，否则 node 占着文件会让覆盖静默失败（踩过这个坑）
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Remove-Item 'C:\\LifeLine\\LifeLine-Demo\\out' -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$tmp\\out" 'C:\\LifeLine\\LifeLine-Demo\\out' -Recurse -Force
# 覆盖**所有**服务端 js（不只是 server.js）——漏一个依赖服务就起不来
Get-ChildItem "$tmp\\*.js" | ForEach-Object { Copy-Item $_.FullName 'C:\\LifeLine\\LifeLine-Demo\\' -Force }
Write-Host "COPIED_JS=$((Get-ChildItem 'C:\\LifeLine\\LifeLine-Demo\\*.js').Name -join ',')"
$srv = Get-Content 'C:\\LifeLine\\LifeLine-Demo\\server.js' -Raw
Write-Host "SERVER_HAS_ASK=$($srv -match 'api/ask')"
if (-not ($srv -match 'api/ask')) { Write-Host 'FAIL: 部署的 server.js 是旧版'; exit 1 }
$envText = if (Test-Path 'C:\\LifeLine\\LifeLine-Demo\\.env') { Get-Content 'C:\\LifeLine\\LifeLine-Demo\\.env' -Raw } else { '' }
Write-Host "HAS_ENV_KEY=$($envText -match 'DS_KEY')"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# 真正的自检：校验依赖能否解析（用 deploy/probe.js，不启动服务）
# server.js require 的文件都必须一起打包，否则服务起不来
$probe = & 'C:\\Program Files\\nodejs\\node.exe' 'C:\\LifeLine\\LifeLine-Demo\\probe.js' 'C:\\LifeLine\\LifeLine-Demo' 2>&1 | Out-String
Write-Host "PROBE_OUT=$($probe.Trim())"
if ($LASTEXITCODE -ne 0) {
  Write-Host 'FAIL: 服务端依赖缺失或语法错误（服务会起不来）'
  exit 1
}
Write-Host 'REQUIRE_OK=True'

Start-ScheduledTask -TaskName 'LifeLineDemo'
Start-Sleep -Seconds 7
$ok = [bool](Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue)
Write-Host "LISTEN=$ok"
foreach ($p in @('/','/dashboard/','/ambient/','/changelog/')) {
  try { $r = Invoke-WebRequest "http://127.0.0.1:18080$p" -UseBasicParsing -TimeoutSec 15; Write-Host "  $p -> $($r.StatusCode)" }
  catch { Write-Host "  $p -> FAIL" }
}
`);
console.log(deploy.out);
if (deploy.err && !deploy.out.includes('LISTEN=True')) console.log('[stderr]', deploy.err);
if (!deploy.out.includes('LISTEN=True')) {
  console.error('\n❌ 服务器上服务未监听，请检查');
  process.exit(1);
}
if (deploy.out.includes('SERVER_HAS_ASK=True')) {
  console.log('服务端代码自检：含追问接口 ✅');
} else {
  console.error('\n❌ 部署的 server.js 不含追问接口（可能又装了旧副本）');
  process.exit(1);
}
if (deploy.out.includes('HAS_ENV_KEY=True')) {
  console.log('配置文件自检：服务器上有 DS_KEY ✅（不打印内容）');
} else {
  console.log('⚠️ 服务器上没有 DS_KEY —— 追问会使用本地回答引擎');
}

/* ---------------- 5. 外网验证 ---------------- */
step(5, '从外网验证');
const pages = ['/', '/birth/', '/today/', '/dashboard/', '/ambient/', '/changelog/'];
let allOk = true;
for (const p of pages) {
  /**
   * 带重试：公网请求偶发抖动是正常的，
   * 一次超时就报"部署失败"是误报——会让真正的问题被噪音淹没。
   */
  let status = 'FAIL';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = localPs(
      `try { $r = Invoke-WebRequest '${PUBLIC_URL}${p}' -UseBasicParsing -TimeoutSec 30; Write-Output $r.StatusCode } catch { Write-Output 'FAIL' }`,
    );
    status = r.out.trim();
    if (status === '200') break;
    if (attempt < 3) {
      console.log(`  ${PUBLIC_URL}${p} → ${status}（第 ${attempt} 次，重试…）`);
      await new Promise((r2) => setTimeout(r2, 1500));
    }
  }
  const ok = status === '200';
  if (!ok) allOk = false;
  console.log(`  ${ok ? '✅' : '❌'} ${PUBLIC_URL}${p} → ${status}`);
}

/* 追问接口：确认服务端真的接上了模型（这一步会花掉一次调用） */
const askProbe = localPs(
  `try {
     $body = '{"question":"测试","contextPrompt":"盘面事实：2026年"}'
     $r = Invoke-WebRequest '${PUBLIC_URL}/api/ask' -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 40
     Write-Output $r.Content
   } catch { Write-Output 'FAIL' }`,
);
const askText = askProbe.out;
if (askText.includes('"ok":true')) {
  console.log('  ✅ /api/ask → 模型已接通');
} else if (askText.includes('no-key')) {
  console.log('  ⚠️ /api/ask → 未配置 key（追问会用本地回答引擎）');
} else {
  console.log('  ⚠️ /api/ask → 未按预期响应（网页会自动降级到本地引擎，不影响其他功能）');
}

console.log(`\n${'='.repeat(56)}`);
if (allOk) {
  console.log(`✅ 部署完成（${Math.round((Date.now() - started) / 1000)} 秒）`);
  console.log(`   同事访问：${PUBLIC_URL}/`);
  console.log(`   修改日志：${PUBLIC_URL}/changelog/`);
} else {
  console.log('⚠️ 部分页面外网验证未通过，请检查');
  process.exit(1);
}
