/**
 * 远程执行 PowerShell 的辅助：用 Base64 传命令，避免 SSH 引号被吃掉
 */
import { spawnSync } from 'node:child_process';

const IP = '112.111.47.239';
const PORT = '25573';
const USER = 'administrator';

/** 把脚本编码成 PowerShell -EncodedCommand 需要的 Base64(UTF-16LE) */
function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** 在服务器上执行一段 PowerShell，返回 { code, out, err } */
export function runPs(script, { timeout = 120000 } = {}) {
  // -OutputFormat Text 让输出是纯文本而不是 CLIXML，避免日志噪音
  const wrapped = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`;
  const r = spawnSync(
    'ssh',
    [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=20',
      `${USER}@${IP}`,
      '-p', PORT,
      `powershell -NoProfile -NonInteractive -OutputFormat Text -EncodedCommand ${encode(wrapped)}`,
    ],
    { encoding: 'utf8', timeout },
  );
  // PowerShell 会把 Write-Host 写到 stderr，这里合并到一起，只过滤 CLIXML 头
  const clean = (s) =>
    (s ?? '')
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('#< CLIXML') && !l.startsWith('<Objs'))
      .join('\n')
      .trim();
  return { code: r.status, out: clean(r.stdout), err: clean(r.stderr) };
}

/** 上传文件（scp） */
export function upload(localPath, remotePath) {
  const r = spawnSync(
    'scp',
    ['-O', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-P', PORT, localPath, `${USER}@${IP}:${remotePath}`],
    { encoding: 'utf8', timeout: 180000 },
  );
  return { code: r.status, err: (r.stderr ?? '').trim() };
}

// 直接运行时，执行传进来的脚本（node run-remote.mjs "脚本内容"）
if (process.argv[1] && process.argv[1].endsWith('run-remote.mjs') && process.argv[2]) {
  const res = runPs(process.argv[2]);
  console.log(res.out);
  if (res.err) console.error('STDERR:', res.err);
  process.exit(res.code ?? 0);
}
