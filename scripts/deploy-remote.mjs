/**
 * 部署 LifeLine 演示站到服务器（Windows Server 2022）
 * 用法：node scripts/deploy-remote.mjs
 */
import { runPs, upload } from './run-remote.mjs';
import { resolve } from 'node:path';

const APP_DIR = 'C:\\LifeLine\\LifeLine-演示站';
const PORT = 18080;

function step(title) {
  console.log('\n' + '='.repeat(60));
  console.log('  ' + title);
  console.log('='.repeat(60));
}

function show(res, label = '') {
  if (res.out) console.log(res.out);
  if (res.err) console.log('[stderr] ' + res.err);
  if (res.code !== 0) console.log(`[退出码 ${res.code}] ${label}`);
}

/* ---------------- 1. 环境确认 ---------------- */
step('1. 确认环境');
show(
  runPs(`
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { $node = 'C:\\Program Files\\nodejs\\node.exe' }
    Write-Host "node 路径: $node"
    Write-Host "node 版本: $(& $node -v)"
    Write-Host "网页入口存在: $(Test-Path '${APP_DIR}\\out\\index.html')"
    Write-Host "启动脚本存在: $(Test-Path 'C:\\LifeLine\\start-server.ps1')"
    Write-Host "端口 ${PORT} 是否被占用: $([bool](Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue))"
  `),
);

/* ---------------- 2. 放行防火墙 ---------------- */
step('2. 放行防火墙端口 ' + PORT);
show(
  runPs(`
    $name = 'LifeLine Demo ${PORT}'
    if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
      Write-Host "规则已存在，跳过"
    } else {
      New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort ${PORT} -Action Allow | Out-Null
      Write-Host "已新增防火墙规则: $name"
    }
    Get-NetFirewallRule -DisplayName $name | Select-Object DisplayName, Enabled, Direction, Action | Format-List
  `),
);

/* ---------------- 3. 注册计划任务（开机自启 + 崩溃重启） ---------------- */
step('3. 注册计划任务（开机自启）');
show(
  runPs(`
    $taskName = 'LifeLineDemo'
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    $ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    $action = New-ScheduledTaskAction -Execute $ps -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\\LifeLine\\start-server.ps1'
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'LifeLine 演示站（静态网站）' | Out-Null
    Write-Host "计划任务已注册: $taskName"
    Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State | Format-List
  `),
);

/* ---------------- 4. 启动 ---------------- */
step('4. 启动服务');
show(
  runPs(`
    Start-ScheduledTask -TaskName 'LifeLineDemo'
    Start-Sleep -Seconds 6
    $t = Get-ScheduledTask -TaskName 'LifeLineDemo'
    Write-Host "任务状态: $($t.State)"
    $listen = Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue
    Write-Host "端口 ${PORT} 监听中: $([bool]$listen)"
    if ($listen) { Write-Host "进程 PID: $($listen[0].OwningProcess)" }
  `),
);

/* ---------------- 5. 服务器本机验证 ---------------- */
step('5. 服务器本机验证（HTTP 请求）');
show(
  runPs(`
    foreach ($p in @('/','/dashboard/','/ambient/','/ambient/?screen=week')) {
      try {
        $r = Invoke-WebRequest "http://127.0.0.1:${PORT}$p" -UseBasicParsing -TimeoutSec 15
        Write-Host ("  {0,-24} -> {1}  ({2} 字节)" -f $p, $r.StatusCode, $r.RawContentLength)
      } catch {
        Write-Host ("  {0,-24} -> 失败: {1}" -f $p, $_.Exception.Message)
      }
    }
    Write-Host ''
    Write-Host "日志文件:"
    if (Test-Path 'C:\\LifeLine\\logs\\demo.log') { Get-Content 'C:\\LifeLine\\logs\\demo.log' -Tail 8 }
  `),
);

/* ---------------- 6. 重新上传最新文件（如需更新时用） ---------------- */
if (process.env.UPLOAD === '1') {
  step('6. 重新上传网页文件');
  const zip = resolve('deploy/LifeLine-演示站.zip');
  const up = upload(zip, 'C:/LifeLine/demo.zip');
  console.log('上传: ' + (up.code === 0 ? '完成' : '失败 ' + up.err));
  show(
    runPs(`
      Expand-Archive -Path C:\\LifeLine\\demo.zip -DestinationPath C:\\LifeLine -Force
      Write-Host "解压完成"
      Restart-ScheduledTask -TaskName 'LifeLineDemo' -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 4
      Write-Host "服务已重启"
    `),
  );
}

console.log('\n部署脚本执行完毕。');
