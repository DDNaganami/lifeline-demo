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
import { existsSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const IP = '112.111.47.239';
const SSH_PORT = '25573';
const PUBLIC_URL = 'http://112.111.47.239:25572';

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

// 用最新的 out/ 覆盖包内产物
const outDir = resolve(pkgDir, 'out');
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
localPs(`Copy-Item -Recurse -Force '${resolve('out')}' '${outDir}'`);
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

/* ---------------- 4. 服务器上解压并重启 ---------------- */
step(4, '解压并重启服务');
const deploy = runPs(`
$tmp = 'C:\\LifeLine\\_extract'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path C:\\LifeLine\\demo.zip -DestinationPath $tmp -Force
if (-not (Test-Path "$tmp\\out\\index.html")) { Write-Host 'FAIL: 解压后找不到 out'; exit 1 }
Remove-Item 'C:\\LifeLine\\LifeLine-Demo\\out' -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$tmp\\out" 'C:\\LifeLine\\LifeLine-Demo\\out' -Recurse -Force
Copy-Item "$tmp\\server.js" 'C:\\LifeLine\\LifeLine-Demo\\server.js' -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
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

/* ---------------- 5. 外网验证 ---------------- */
step(5, '从外网验证');
const pages = ['/', '/dashboard/', '/ambient/', '/changelog/'];
let allOk = true;
for (const p of pages) {
  const r = localPs(
    `try { $r = Invoke-WebRequest '${PUBLIC_URL}${p}' -UseBasicParsing -TimeoutSec 20; Write-Output $r.StatusCode } catch { Write-Output 'FAIL' }`,
  );
  const status = r.out.trim();
  const ok = status === '200';
  if (!ok) allOk = false;
  console.log(`  ${ok ? '✅' : '❌'} ${PUBLIC_URL}${p} → ${status}`);
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
