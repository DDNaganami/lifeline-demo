/** 诊断：为什么服务没起来 */
import { runPs } from './run-remote.mjs';

function show(title, res) {
  console.log('\n--- ' + title + ' ---');
  if (res.out) console.log(res.out);
  if (res.err) console.log('[stderr] ' + res.err);
  console.log('(退出码 ' + res.code + ')');
}

// 1) start-server.ps1 是否有 BOM、能否被解析
show(
  '1. start-server.ps1 编码与语法检查',
  runPs(`
    $p = 'C:\\LifeLine\\start-server.ps1'
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $hasBom = ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    Write-Host "文件存在: $(Test-Path $p)  字节数: $($bytes.Length)  有BOM: $hasBom"
    $err = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$err)
    Write-Host "语法错误数量: $($err.Count)"
    if ($err.Count -gt 0) { $err | ForEach-Object { Write-Host ("  " + $_.Message) } }
  `),
);

// 2) 直接把服务跑起来（不用计划任务），看端口
show(
  '2. 直接启动 node 测试',
  runPs(`
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    $node = 'C:\\Program Files\\nodejs\\node.exe'
    $p = Start-Process -FilePath $node -ArgumentList 'server.js 18080' -WorkingDirectory 'C:\\LifeLine\\LifeLine-演示站' -PassThru -WindowStyle Hidden -RedirectStandardOutput 'C:\\LifeLine\\logs\\out.txt' -RedirectStandardError 'C:\\LifeLine\\logs\\err.txt'
    Start-Sleep -Seconds 4
    Write-Host "node 进程还在: $(-not $p.HasExited)"
    if ($p.HasExited) { Write-Host "退出码: $($p.ExitCode)" }
    $listen = Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue
    Write-Host "18080 监听中: $([bool]$listen)"
    Write-Host "--- stdout ---"
    if (Test-Path 'C:\\LifeLine\\logs\\out.txt') { Get-Content 'C:\\LifeLine\\logs\\out.txt' -Raw }
    Write-Host "--- stderr ---"
    if (Test-Path 'C:\\LifeLine\\logs\\err.txt') { Get-Content 'C:\\LifeLine\\logs\\err.txt' -Raw }
  `),
);

// 3) 本机 HTTP 验证
show(
  '3. 本机 HTTP 验证',
  runPs(`
    try {
      $r = Invoke-WebRequest 'http://127.0.0.1:18080/' -UseBasicParsing -TimeoutSec 10
      Write-Host "首页状态码: $($r.StatusCode)  长度: $($r.RawContentLength)"
    } catch { Write-Host "请求失败: $($_.Exception.Message)" }
  `),
);

// 4) 计划任务的历史记录（看它是怎么失败的）
show(
  '4. 计划任务最近一次执行结果',
  runPs(`
    $info = Get-ScheduledTaskInfo -TaskName 'LifeLineDemo' -ErrorAction SilentlyContinue
    if ($info) {
      Write-Host "上次运行时间: $($info.LastRunTime)"
      Write-Host "上次结果码:   $($info.LastTaskResult)"
      Write-Host "下次运行时间: $($info.NextRunTime)"
    } else { Write-Host "找不到任务 LifeLineDemo" }
    Write-Host "任务当前状态: $((Get-ScheduledTask -TaskName 'LifeLineDemo').State)"
  `),
);
