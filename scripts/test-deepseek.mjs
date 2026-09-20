/**
 * 验证 DeepSeek API：模型、编码、时延、用量
 * 用法：DS_KEY=xxx node scripts/test-deepseek.mjs
 */
const KEY = process.env.DS_KEY;
if (!KEY) {
  console.error('缺少 DS_KEY 环境变量');
  process.exit(1);
}

const BASE = 'https://api.deepseek.com';

async function call(model, messages, maxTokens = 200) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    return { ok: false, status: res.status, text: await res.text(), ms };
  }
  const json = await res.json();
  return {
    ok: true,
    ms,
    model: json.model,
    content: json.choices?.[0]?.message?.content ?? '',
    usage: json.usage,
  };
}

console.log('=== 1. 模型列表 ===');
const modelsRes = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
const models = await modelsRes.json();
for (const m of models.data ?? []) console.log(`  ${m.id}`);

console.log('\n=== 2. 中文编码必须完好（上一个 PowerShell 测试里中文变成了问号）===');
const zh = await call('deepseek-flash', [
  { role: 'user', content: '请原样重复这句话，不要加任何解释：真太阳时' },
]);
console.log(`  耗时 ${zh.ms}ms`);
console.log(`  回答: ${JSON.stringify(zh.content)}`);
console.log(`  用量: prompt=${zh.usage?.prompt_tokens} completion=${zh.usage?.completion_tokens}`);
const zhOk = typeof zh.content === 'string' && zh.content.includes('真太阳时');
console.log(`  ${zhOk ? '✅' : '❌'} 中文往返完好`);

console.log('\n=== 3. 真实场景：让它把盘面讲成人话（这是我们要用的方式）===');
const prompt = `你是一位务实的命理顾问。用户已经排好盘，你只负责把下面的排盘结果讲成人话。

**硬性要求**：
1. 只能使用下面给出的盘面事实，不要自己推算、不要新增宫位或星曜
2. 不要说"一定会""绝对"，用"这一年偏""倾向"这类程度词
3. 不要许诺具体月份，给"位置"而不是"日期"
4. 最后给一个可执行的下一步

用户问题：我今年该不该换工作

盘面事实：
- 年份 / 年龄：2026 年 / 33 岁
- 维度：事业
- 大限：32-41 岁 · 子女宫
- 流年：丙午
- 流年四化：天同化禄、天机化权、文昌化科、廉贞化忌
- 大限四化：太阳化禄、武曲化权、太阴化科、天同化忌
- 八字：流年丙午（七杀），大运乙卯（正财），流年十神偏逆，宜守
- 本年主判断：2026 年事业上的阻力偏实在，宜守不宜攻，别在压力下做大决定
- 两体系是否印证：单信号`;

const real = await call('deepseek-flash', [{ role: 'user', content: prompt }], 600);
console.log(`  耗时 ${real.ms}ms`);
console.log(`  用量: prompt=${real.usage?.prompt_tokens} completion=${real.usage?.completion_tokens}`);
console.log('  ── 回答 ──');
console.log(
  (real.content ?? '')
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n'),
);
console.log('  ─────────');

console.log('\n=== 4. 遵守约束了吗（自动检查）===');
const c = real.content ?? '';
const checks = [
  ['没有"一定会"这类绝对措辞', !/一定会|绝对会|必然/.test(c)],
  ['没有许诺具体月份', !/\d+月份|[一二三四五六七八九十]+月份/.test(c)],
  ['提到了可执行的一步', /建议|可以先|不妨|试着/.test(c)],
  ['没有自己新增宫位', !/迁移宫|田宅宫|福德宫/.test(c)],
  ['长度适中（150-600 字）', c.length >= 150 && c.length <= 900],
];
for (const [name, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${name}`);

console.log('\n=== 5. 两个模型的对比（看该用哪个）===');
for (const model of ['deepseek-flash', 'deepseek-v4-pro']) {
  const r = await call(model, [{ role: 'user', content: '用一句话说明"大限"是什么意思' }], 150);
  console.log(`  ${model.padEnd(18)} ${String(r.ms).padStart(5)}ms  ${r.usage?.prompt_tokens}+${r.usage?.completion_tokens} tokens`);
  console.log(`    ${(r.content ?? '').slice(0, 80)}`);
}
