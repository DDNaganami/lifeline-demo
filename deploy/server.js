/**
 * LifeLine 演示站 —— 极简静态服务器 + 追问代理
 * ---------------------------------------------------------------
 * 特点：**零依赖**。只用 Node.js 自带模块，不需要 npm install。
 *
 * 用法：
 *   node server.js              # 默认 8080 端口
 *   node server.js 9000         # 指定端口
 *   set PORT=9000 && node server.js
 *
 * 它做五件事：
 *   1. 把 out/ 目录里的文件发出去
 *   2. 补默认页、加缓存头、记录访问日志
 *   3. `POST /api/ask` —— **追问代理**（见下方安全说明）
 *
 * ⚠️ 关于 API key 的安全设计（重要）
 *   追问要调用 DeepSeek，而 **key 绝对不能出现在网页里**——
 *   仓库是公开的，浏览器端代码任何人都能看到。
 *   所以：key 只从**服务端环境变量 / .env** 读，
 *   浏览器把问题发到本站的 `/api/ask`，由这个服务带上 key 转发。
 *   网页源码里没有任何 key，按 F12 也看不到。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const stats = require('./ask-stats');

/* ------------------------- 配置（含从 .env 读取密钥） ------------------------- */

/**
 * 极简 .env 读取：只用 Node 自带模块，不引第三方依赖。
 * 依次找：环境变量 → 当前目录/.env → 上级目录/.env
 */
function loadEnv() {
  const out = { ...process.env };
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        // 真实环境变量优先于 .env 文件
        if (!process.env[k]) out[k] = v;
      }
    } catch {
      /* 文件不存在就跳过 */
    }
  }
  return out;
}

const ENV = loadEnv();
const DS_KEY = ENV.DS_KEY || '';
const DS_MODEL = ENV.DS_MODEL || 'deepseek-flash';
const DS_MAX_TOKENS = Number(ENV.DS_MAX_TOKENS || 3000);
/** 服务端兜底限流：防止有人绕开前端直接打接口 */
const ASK_PER_IP_DAILY = Number(ENV.ASK_PER_IP_DAILY || 15);
const ASK_TIMEOUT_MS = Number(ENV.ASK_TIMEOUT_MS || 60000);

/* ------------------------- 静态文件 ------------------------- */

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

  // 追问接口（POST）——在静态文件之前处理
  if (urlPath.split('?')[0] === '/api/ask') {
    handleAsk(req, res, started);
    return;
  }

  // 用量查询：只给管理员看，靠 URL 上的 token 保护
  if (urlPath.split('?')[0] === '/api/usage') {
    handleUsage(req, res, urlPath);
    return;
  }

  // 静态文件只允许 GET / HEAD
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

/* ------------------------- 追问代理 ------------------------- */

/**
 * 服务端限流。
 * ⚠️ 只存**匿名化的 IP 哈希 + 计数**，不存原始 IP（少留隐私数据）。
 */
const askCounters = new Map(); // hash → { date, count }

function ipHash(req) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';
  // 加盐哈希：即使有人拿到内存里的表，也还原不出 IP
  return crypto.createHash('sha256').update('lifeline|' + ip).digest('hex').slice(0, 16);
}

function withinServerLimit(req) {
  const today = new Date().toISOString().slice(0, 10);
  const key = ipHash(req);
  const rec = askCounters.get(key);
  if (!rec || rec.date !== today) {
    askCounters.set(key, { date: today, count: 1 });
    return true;
  }
  if (rec.count >= ASK_PER_IP_DAILY) return false;
  rec.count += 1;
  return true;
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * 处理 POST /api/ask
 *
 * 请求体：{ question, contextPrompt }
 * 响应体：{ ok, answer, usage } 或 { ok: false, error }
 *
 * ⚠️ 日志里**只记长度和耗时，不记问题原文、不记 key**。
 *    用户的提问属于隐私，不该落到服务器日志里。
 */
async function handleAsk(req, res, started) {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'method' });
    return;
  }

  /* 顺序很重要：**先校验请求体，再看 key 和限流**。
     如果先看 key，配了 key 之后坏请求也会被当成别的错误，掩盖真实原因。 */
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    json(res, 400, { ok: false, error: 'bad-body' });
    return;
  }

  const question = String(body?.question ?? '').slice(0, 500).trim();
  const contextPrompt = String(body?.contextPrompt ?? '').slice(0, 8000);
  if (!question) {
    json(res, 400, { ok: false, error: 'empty-question' });
    return;
  }

  if (!DS_KEY) {
    // 没配 key 时明确告知，前端会退回本地规则引擎
    json(res, 503, { ok: false, error: 'no-key', hint: '服务端未配置 DS_KEY，追问使用本地引擎' });
    console.log('503  /api/ask  (未配置 DS_KEY)');
    return;
  }

  if (!withinServerLimit(req)) {
    json(res, 429, { ok: false, error: 'rate-limited' });
    console.log('429  /api/ask  (服务端限流)');
    return;
  }

  const messages = [
    {
      role: 'system',
      // 系统提示把"只讲盘、不推算"这条放在最前面，比放在用户消息里更硬
      content:
        '你是 LifeLine 的命理顾问。用户已经排好盘，你只负责把给定的盘面讲成人话。' +
        '只能使用给定的盘面事实，不要自己推算、不要新增宫位或星曜。' +
        '不要说"一定会""绝对"，用"偏""倾向"。不要许诺具体月份，给"位置"而不是"日期"。' +
        '最后给一个可执行的下一步。控制在 300 字以内。',
    },
    { role: 'user', content: `${contextPrompt}\n\n用户问题：${question}` },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${DS_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DS_MODEL,
        messages,
        // ⚠️ 推理模型的思维链也吃 token，预算给足，否则 content 会是空的
        max_tokens: DS_MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      // 只记状态码，不记 text（可能含请求内容）
      console.error(`[ask] 上游 ${upstream.status}`);
      json(res, 502, {
        ok: false,
        error: 'upstream',
        status: upstream.status,
        // 401/402 这类是配置问题，把关键信息透给前端便于排查（不含 key）
        hint: upstream.status === 401 ? 'key 无效' : upstream.status === 402 ? '余额不足' : undefined,
      });
      void text;
      return;
    }

    const data = await upstream.json();
    const msg = data.choices?.[0]?.message ?? {};
    const answer = String(msg.content ?? '').trim();
    const reasoningLen = String(msg.reasoning_content ?? '').length;

    if (!answer) {
      // 思维链把预算吃光了——这是推理模型的典型失败，要说清楚而不是静默返回空
      console.error(`[ask] 上游返回空 content（思维链 ${reasoningLen} 字，可能 token 预算不足）`);
      json(res, 502, { ok: false, error: 'empty-content', reasoningChars: reasoningLen });
      return;
    }

    json(res, 200, {
      ok: true,
      answer,
      usage: data.usage,
      model: data.model,
    });
    // 用量统计：**只累计数字，不记问题/回答/key**
    const row = stats.record(data.usage, { ok: true, ms: Date.now() - started });
    // 日志：只有长度与耗时（不记问题、不记回答、不记 key）
    console.log(
      `200  POST /api/ask  (问 ${question.length} 字 → 答 ${answer.length} 字, ` +
        `思维链 ${reasoningLen} 字, ${Date.now() - started}ms)`,
    );
    stats.logLine(row);
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(`[ask] ${aborted ? '超时' : '请求失败'}`);
    // 失败的调用也记一次（但不计 token，因为拿不到 usage）
    const row = stats.record(null, { ok: false, ms: Date.now() - started });
    stats.logLine(row);
    json(res, 504, { ok: false, error: aborted ? 'timeout' : 'network' });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------- 用量查询 ------------------------- */

/**
 * GET /api/usage?token=xxx
 *
 * 为什么要 token 保护：这个接口会暴露"今天被问了多少次、花了多少"，
 * 属于运营数据，不该公开。token 从环境变量 USAGE_TOKEN 读。
 *
 * **没有配 USAGE_TOKEN 时这个接口关闭**——默认安全，
 * 而不是"忘了配就公开"。
 */
function handleUsage(req, res, urlPath) {
  const expected = ENV.USAGE_TOKEN || '';
  if (!expected) {
    json(res, 404, { ok: false, error: 'disabled', hint: '服务端未配置 USAGE_TOKEN，用量接口未开启' });
    return;
  }
  const q = urlPath.split('?')[1] || '';
  const given = new URLSearchParams(q).get('token') || '';
  // 定长比较，避免用时间差猜 token
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  const s = stats.summary();
  const yuan = (n) => `¥${n.toFixed(4)}`;
  const rows = s.daily
    .map((d) => {
      const avg = d.asks ? Math.round(d.tokens / d.asks) : 0;
      const avgMs = d.asks ? Math.round(d.ms / d.asks) : 0;
      return `<tr><td>${d.date}</td><td>${d.asks}</td><td>${d.ok}</td><td>${d.failed}</td><td>${d.tokens}</td><td>${avg}</td><td>${avgMs}ms</td></tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>LifeLine 追问用量</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{background:#0a0a09;color:#f5f2ec;font:14px/1.6 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:24px}
 h1{font-size:20px;margin:0 0 4px}
 .sub{color:#7d776c;font-size:12px;margin-bottom:20px}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
 .card{background:#141312;border:1px solid #2b2926;border-radius:12px;padding:14px 18px;min-width:150px}
 .card .k{color:#7d776c;font-size:12px}
 .card .v{font-size:26px;color:#d9a441;margin-top:2px}
 .card .s{color:#b8b2a6;font-size:12px}
 table{border-collapse:collapse;width:100%;max-width:720px;background:#141312;border-radius:12px;overflow:hidden}
 th,td{padding:8px 12px;text-align:right;border-bottom:1px solid #2b2926;font-variant-numeric:tabular-nums}
 th{color:#7d776c;font-weight:400;font-size:12px;text-align:right}
 th:first-child,td:first-child{text-align:left}
 .note{color:#7d776c;font-size:12px;margin-top:16px;max-width:720px;line-height:1.7}
 .warn{color:#e8be74}
</style></head><body>
<h1>追问用量</h1>
<div class="sub">只统计数字，不记录问题与回答内容。金额为量级估算，请以 DeepSeek 后台账单为准。</div>

<div class="cards">
  <div class="card"><div class="k">今天</div><div class="v">${s.today.asks}</div><div class="s">${s.today.tokens} token · ${yuan(s.today.cost.total)}</div></div>
  <div class="card"><div class="k">近 7 天</div><div class="v">${s.last7.asks}</div><div class="s">${s.last7.tokens} token · ${yuan(s.last7.cost.total)}</div></div>
  <div class="card"><div class="k">近 30 天</div><div class="v">${s.last30.asks}</div><div class="s">${s.last30.tokens} token · ${yuan(s.last30.cost.total)}</div></div>
  <div class="card"><div class="k">累计</div><div class="v">${s.all.asks}</div><div class="s">${s.all.days} 天 · ${s.all.tokens} token · ${yuan(s.all.cost.total)}</div></div>
</div>

<table>
<tr><th>日期</th><th>次数</th><th>成功</th><th>失败</th><th>token</th><th>均 token</th><th>均耗时</th></tr>
${rows || '<tr><td colspan="7" style="color:#7d776c">还没有记录</td></tr>'}
</table>

<div class="note">
  <b>成本估算口径</b>：按输入 ¥1/百万 token、输出 ¥2/百万 token 粗算，仅用于判断量级。<br>
  <b>数据位置</b>：服务器上的 <code>ask-stats.json</code>，保留最近 60 天。<br>
  <b>单价变化</b>：请以 DeepSeek 后台为准。当天超过 ${stats.WARN_ASKS} 次时，服务器控制台会打醒目提示。<br>
  ${s.today.asks >= stats.WARN_ASKS ? `<span class="warn">⚠️ 今天已超过 ${stats.WARN_ASKS} 次</span>` : ''}
</div>
</body></html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

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
  console.log(`  追问接口：   POST /api/ask`);
  if (DS_KEY) {
    // 只报"配没配"和模型名，**绝不打印 key**
    console.log(`  AI 追问：    已启用（${DS_MODEL}，max_tokens=${DS_MAX_TOKENS}）`);
  } else {
    console.log('  AI 追问：    未启用（没读到 DS_KEY，网页会退回本地回答引擎）');
    console.log('               要启用：复制 .env.example 为 .env 并填上 DS_KEY');
  }
  if (ENV.USAGE_TOKEN) {
    console.log(`  用量统计：   /api/usage?token=***（token 见 .env，不打印）`);
  } else {
    console.log('  用量统计：   未开启（要开启：在 .env 里配 USAGE_TOKEN）');
  }
  console.log('  ------------------------------------------');
  console.log('  外网访问：需要在路由器上把该端口转发到本机');
  console.log('  停止服务：按 Ctrl + C');
  console.log('');
});
