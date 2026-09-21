/**
 * 验证新的 DeepSeek key 是否可用
 * 用法：DS_KEY=xxx node scripts/test-new-key.mjs
 *
 * ⚠️ key 只从环境变量读，**不写进任何文件**。
 */
const key = process.env.DS_KEY;
if (!key) {
  console.error('缺少 DS_KEY 环境变量');
  process.exit(1);
}

console.log('=== 1. 模型列表 ===');
const modelsRes = await fetch('https://api.deepseek.com/models', {
  headers: { Authorization: `Bearer ${key}` },
});
if (!modelsRes.ok) {
  console.log(`  ❌ HTTP ${modelsRes.status}`);
  console.log('  ' + (await modelsRes.text()).slice(0, 200));
  process.exit(1);
}
const models = await modelsRes.json();
for (const m of models.data ?? []) console.log(`  ${m.id}`);

console.log('\n=== 2. 真实调用（用我们实际会发的提示词）===');
const prompt = [
  '你是一位务实的命理顾问。用户已经排好盘，你只负责把下面的排盘结果讲成人话。',
  '',
  '硬性要求：',
  '1. 只能使用下面给出的盘面事实，不要自己推算、不要新增宫位或星曜',
  '2. 不要说"一定会""绝对"，用"这一年偏""倾向"这类程度词',
  '3. 不要许诺具体月份，给"位置"而不是"日期"',
  '4. 最后给一个可执行的下一步',
  '5. 控制在 300 字以内',
  '',
  '用户问题：我今年该不该换工作',
  '',
  '盘面事实：',
  '- 年份 / 年龄：2026 年 / 33 岁',
  '- 大限：32-41 岁 · 子女宫',
  '- 流年四化：天同化禄、天机化权、文昌化科、廉贞化忌',
  '- 本年主判断：2026 年事业上的阻力偏实在，宜守不宜攻',
].join('\n');

const t0 = Date.now();
const r = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: process.env.DS_MODEL || 'deepseek-flash',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000,
  }),
});
const ms = Date.now() - t0;
const j = await r.json();
console.log(`  HTTP ${r.status}  ${ms}ms`);
if (j.error) {
  console.log('  ❌ ' + JSON.stringify(j.error));
  process.exit(1);
}
console.log('  模型:', j.model);
console.log('  用量:', JSON.stringify(j.usage));
console.log('  ── 回答 ──');
console.log(
  (j.choices?.[0]?.message?.content ?? '(空)')
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n'),
);
console.log('  ──────────');
console.log(
  (j.choices?.[0]?.message?.content ?? '').length > 50
    ? '  ✅ 新 key 可用'
    : '  ❌ content 为空（可能 token 预算不足）',
);
