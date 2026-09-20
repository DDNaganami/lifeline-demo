/**
 * 验证追问：配额（每日 3 次）+ 回答引擎（真的读盘，不是通用话术）
 */
import { answerQuestion, answerPrompt, dimensionOfQuestion } from '../lib/ask-answer.ts';
import { buildYearSignals } from '../lib/signals.ts';
import { ASK_LIMIT, CAP_MESSAGE } from '../lib/ask-quota.ts';
import type { BirthInfo, DimensionKey } from '../lib/types.ts';

const birth: BirthInfo = {
  name: '演示',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '杭州',
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

const signals = buildYearSignals(birth, 2026);
const baseCtx = {
  year: 2026,
  age: 33,
  dimension: 'career' as DimensionKey,
  signals,
  mainJudgment: '2026 年事业上的阻力偏实在，宜守不宜攻，别在压力下做大决定',
  birthTimeConfident: true,
};

console.log('=== 1. 问题归类：读得懂用户在问哪个领域 ===');
const CASES: [string, DimensionKey][] = [
  ['我今年该不该换工作', 'career'],
  ['我什么时候能升职', 'career'],
  ['我为什么总是存不下钱', 'wealth'],
  ['我正缘什么时候出现', 'marriage'],
  ['父母的身体我要注意什么', 'parents'],
  ['我最近总是睡不好', 'health'],
  ['我下一段转折在哪一年', 'career'],  // 无关键词 → 用当前维度（career）
];
for (const [q, expect] of CASES) {
  const got = dimensionOfQuestion(q, 'career');
  console.log(`  ${got === expect ? '✅' : '❌'} 「${q}」→ ${got}`);
  if (got === expect) pass++;
  else fail++;
}

console.log('\n=== 2. 回答必须引用真实盘面（不能是通用话术）===');
// 注意：tsx 下是 cjs 输出，不支持顶层 await，所以整段包在异步函数里
async function main() {
const A = await answerQuestion('我今年该不该换工作', baseCtx);
console.log(A.paragraphs.map((p) => '  ' + p).join('\n\n'));
console.log('  依据:', A.basis.join(' / '));
check('有多段回答', A.paragraphs.length >= 3, `${A.paragraphs.length} 段`);
check('引用了具体宫位', A.paragraphs.some((p) => /宫/.test(p)));
check('引用了年份或大限', A.paragraphs.some((p) => p.includes('2026') || /大限/.test(p)));
check('有可追溯的依据', A.basis.length >= 2, `${A.basis.length} 条`);
check('依据里含权重或宫位', A.basis.some((b) => /宫/.test(b)));
check('provider 标为 local（没假装接了 AI）', A.provider === 'local');

console.log('\n=== 3. 不同问题给不同答案（不是同一套模板）===');
const questions = [
  '我今年该不该换工作',
  '我什么时候能升职',
  '我为什么总是存不下钱',
  '我最近总是睡不好',
];
const answers = await Promise.all(questions.map((q) => answerQuestion(q, baseCtx)));
for (let i = 0; i < questions.length; i++) {
  console.log(`\n  Q: ${questions[i]}`);
  console.log(`  A: ${answers[i].paragraphs.slice(0, 2).join(' ').slice(0, 110)}…`);
}
const uniq = new Set(answers.map((a) => a.paragraphs.join('')));
check('四个问题给四种不同回答', uniq.size === 4, `${uniq.size} 种`);

console.log('\n=== 4. 问题类型不同，给的东西也不同 ===');
const when = await answerQuestion('我什么时候能遇到正缘', { ...baseCtx, dimension: 'marriage' });
const should = await answerQuestion('我该不该现在辞职', baseCtx);
const why = await answerQuestion('我为什么总是存不下钱', baseCtx);
check('"什么时候"类 → 回答强调"给位置不给日期"', when.paragraphs.some((p) => p.includes('位置') || p.includes('不是某个月')));
check('"该不该"类 → 回答给出可执行结论', should.paragraphs.some((p) => p.includes('所以')));
check('"为什么"类 → 回答指向结构而非运气', why.paragraphs.some((p) => p.includes('结构')));

console.log('\n=== 5. 时辰不确定时必须提醒（整张盘会偏）===');
const unsure = await answerQuestion('我今年该不该换工作', { ...baseCtx, birthTimeConfident: false });
console.log('  ' + unsure.paragraphs[unsure.paragraphs.length - 1]);
check('提醒时辰不确定', unsure.paragraphs.some((p) => p.includes('时辰')), '');
check('依据里标了风险', unsure.basis.some((b) => b.includes('不确定')));

console.log('\n=== 6. 有反馈或亲笔经历时应该引用 ===');
const withNote = await answerQuestion('我今年该不该换工作', {
  ...baseCtx,
  feedback: '部分符合',
  note: '这年换了工作，收入降了但方向对了',
});
console.log('  ' + withNote.paragraphs[withNote.paragraphs.length - 1]);
check('引用了用户自己写的经历', withNote.paragraphs.some((p) => p.includes('收入降了')));

console.log('\n=== 7. 两体系冲突时措辞要变 ===');
// 造一个冲突场景：直接检查一致性字段被用上
const conflictCtx = { ...baseCtx, signals: { ...signals, consistency: '冲突' as const } };
const conflictAns = await answerQuestion('我今年该不该换工作', conflictCtx);
check('冲突时给出"两边各看一半"的措辞', conflictAns.paragraphs.some((p) => p.includes('不一致') || p.includes('各看一半')));

console.log('\n=== 8. 提示词：接模型时用它，且明确限制模型不许自己推命理 ===');
const prompt = answerPrompt('我今年该不该换工作', baseCtx);
check('提示词含用户问题', prompt.includes('我今年该不该换工作'));
check('提示词含盘面事实（大限/流年/四化）', prompt.includes('大限') && prompt.includes('流年四化'));
check('提示词含硬性要求', prompt.includes('硬性要求'));
check('提示词禁止模型自己推算', prompt.includes('不要自己推算'));
check('提示词禁止绝对化措辞', prompt.includes('一定会'));
check('提示词要求给可执行下一步', prompt.includes('可执行的下一步'));

console.log('\n=== 9. 配额：每日 3 次 ===');
check('上限是 3', ASK_LIMIT === 3);
console.log('  上限文案:');
console.log('    ' + CAP_MESSAGE.headline);
for (const l of CAP_MESSAGE.lines) console.log('    ' + l);
console.log('    ' + CAP_MESSAGE.footer);
check('上限文案不说"次数用完了"', !CAP_MESSAGE.headline.includes('用完') && !CAP_MESSAGE.lines.join('').includes('用完'));
check('上限文案给了"少则重"的理由', CAP_MESSAGE.lines.join('').includes('少'));
check('上限文案指向用户自己（与产品主张一致）', CAP_MESSAGE.lines.join('').includes('你'));

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
}

main();
