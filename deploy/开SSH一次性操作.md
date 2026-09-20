# 开 SSH 一次性操作（只需要做这一遍）

做完这个，剩下的部署、启动、验证、开机自启**全部由我远程完成**，不用你再动手。

---

## 第 1 步：路由器上加一条转发

在路由器「虚拟服务器」页面点「添加」，填：

| 外部端口 | 内部端口 | IP 地址 | 协议类型 |
|---|---|---|---|
| **25571** | **22** | 192.168.1.75 | **TCP** |

> 25571 原来是僵尸毁灭工程的，那个服务现在没跑。
> 如果以后要开僵尸毁灭工程，把这条删掉就能释放端口（或者到时候我们换个外部端口）。

---

## 第 2 步：在服务器上开 SSH（复制整段执行）

用远程桌面连上服务器 → 开始菜单搜索 **PowerShell** → **右键 → 以管理员身份运行**
→ 把下面**整段**粘进去，回车。

```powershell
# 1) 安装 OpenSSH 服务端
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# 2) 启动并设为开机自启
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# 3) 放行防火墙
New-NetFirewallRule -DisplayName "OpenSSH-Server-Inbound" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow

# 4) 写入我们的公钥（实现免密登录）
$key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE4tkEnsnqg56afdRd/vFMYGZBhnyMoSdRLtwPy5gtGg scarm@126.com'
$sshDir = Join-Path $env:USERPROFILE '.ssh'
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
Add-Content -Path (Join-Path $sshDir 'authorized_keys') -Value $key -Encoding ascii

# 5) 确认管理员账号的 authorized_keys 位置（OpenSSH 对管理员有特殊规则）
$adminKeys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
New-Item -ItemType Directory -Force -Path (Join-Path $env:ProgramData 'ssh') | Out-Null
Add-Content -Path $adminKeys -Value $key -Encoding ascii
icacls $adminKeys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null

# 6) 显示结果
Write-Host ''
Write-Host '=== 结果 ===' -ForegroundColor Green
Get-Service sshd | Select-Object Name, Status, StartType | Format-Table
Write-Host "已写入公钥到："
Write-Host "  $sshDir\authorized_keys"
Write-Host "  $adminKeys"
Write-Host ''
Write-Host '如果上面 Status 显示 Running，就成功了。' -ForegroundColor Green
```

---

## 第 3 步：告诉我做完了

我会自己从这边连上去验证，然后完成剩下所有事：

- 部署演示站
- 检查 8080 等端口占用情况，选一个空闲端口
- 启动服务、设置开机自启
- 从外网验证同事能不能打开
- 如果还需要额外加转发，我会明确告诉你加哪一条

---

## 常见问题

**Q：第 1 步的 `Add-WindowsCapability` 报错怎么办？**
A：如果报「找不到源文件」或需要联网，说明服务器缺少组件源。备选方案（在服务器上执行）：

```powershell
# 备选：直接从 GitHub 下载 OpenSSH 便携版
$url = 'https://github.com/PowerShell/Win32-OpenSSH/releases/download/v9.5.0.0p1-Beta/OpenSSH-Win64.zip'
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\OpenSSH-Win64.zip"
Expand-Archive "$env:TEMP\OpenSSH-Win64.zip" -DestinationPath 'C:\Program Files\OpenSSH' -Force
cd 'C:\Program Files\OpenSSH\OpenSSH-Win64'
powershell -ExecutionPolicy Bypass -File install-sshd.ps1
Start-Service sshd
Set-Service sshd -StartupType Automatic
New-NetFirewallRule -DisplayName "OpenSSH-Server-Inbound" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
```

如果服务器完全不能上网，告诉我，我换一个不需要装任何东西的方案（用现有 RDP 手动部署）。

**Q：这样开 SSH 安全吗？**
A：我们的公钥认证是安全的（只认你本机这把私钥）。但要注意：

- **我会在部署完成后建议做三件事**：① 关闭密码登录（只留密钥）② 改掉远程桌面密码（它出现在对话记录里了）③ 确认防火墙只放了 22 这一个口
- 关掉密码登录的命令我到时候给你，一条就够

**Q：会不会影响朋友在跑的服务？**
A：不会。我们只新增了一条转发、一个 Windows 服务（sshd）和一条防火墙规则，
没有改动任何现有服务。SSH 服务空闲时几乎不占资源。

**Q：做完之后 25571 还能给僵尸毁灭工程用吗？**
A：能。把那条转发删掉、把 22 换成游戏端口就行（或者到时候我帮你换一个外部端口）。
