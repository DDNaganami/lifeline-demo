/**
 * LifeLine 演示站 —— 极简静态服务器
 * ---------------------------------------------------------------
 * 特点：**零依赖**。只用 Node.js 自带模块，不需要 npm install。
 *
 * 用法：
 *   node server.js              # 默认 8080 端口
 *   node server.js 9000         # 指定端口
 *   set PORT=9000 && node server.js
 *
 * 它只做四件事：把 out/ 目录里的文件发出去、补默认页、加缓存头、记录访问日志。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 找到静态文件目录。
 * 兼容两种摆放方式：
 *   ① server.js 和 out/ 放在同一层（部署包推荐这样放）
 *   ② server.js 在 deploy/ 里、out/ 在项目根目录（开发时直接跑）
 */
function findRoot() {
  const candidates = [
    path.join(__dirname, 'out'),
    path.join(__dirname, '..', 'out'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return null;
}

const ROOT = findRoot();
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = '0.0.0.0'; // 监听所有网卡，外网才能访问

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

if (!ROOT) {
  console.error('[错误] 找不到静态文件目录（out/）。');
  console.error('       请在项目里执行  npm run build  生成静态文件，');
  console.error('       或确认 server.js 与 out/ 放在同一层。');
  process.exit(1);
}

/** 把请求路径映射成 out 目录里的真实文件；查不到返回 null */
function resolveFile(urlPath) {
  // 去掉查询串与哈希，并做一次 URL 解码
  let clean = urlPath.split('?')[0].split('#')[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }

  // 防目录穿越：拼好后必须仍在 out 目录内
  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT)) return null;

  const candidates = [];
  if (clean.endsWith('/')) {
    candidates.push(path.join(target, 'index.html'));
  } else {
    candidates.push(target);
    candidates.push(target + '.html');
    candidates.push(path.join(target, 'index.html'));
  }

  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-cache',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  const urlPath = req.url || '/';

  // 只允许 GET / HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const file = resolveFile(urlPath);

  if (!file) {
    const notFound = path.join(ROOT, '404.html');
    const body = fs.existsSync(notFound)
      ? fs.readFileSync(notFound)
      : Buffer.from('页面不存在（404）', 'utf8');
    send(res, 404, req.method === 'HEAD' ? '' : body, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    console.log(`404  ${urlPath}  (${Date.now() - started}ms)`);
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(file);

  // 带哈希的静态资源可以长缓存，HTML 不缓存（方便随时更新）
  const isHashedAsset = file.includes(`${path.sep}_next${path.sep}`) && /\.(js|css|woff2?)$/.test(file);
  const cacheControl = isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache';

  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
  } else {
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  }

  console.log(`200  ${urlPath}  → ${path.relative(ROOT, file)}  (${Date.now() - started}ms)`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[错误] 端口 ${PORT} 已被占用，请换一个，例如：node server.js 8081`);
  } else {
    console.error('[错误] ' + err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  LifeLine 演示站已启动');
  console.log('  ------------------------------------------');
  console.log(`  本机访问：   http://localhost:${PORT}/`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        console.log(`  局域网访问： http://${ni.address}:${PORT}/`);
      }
    }
  }
  console.log(`  静态文件：   ${ROOT}`);
  console.log('  ------------------------------------------');
  console.log('  外网访问：需要在路由器上把该端口转发到本机');
  console.log('  停止服务：按 Ctrl + C');
  console.log('');
});
