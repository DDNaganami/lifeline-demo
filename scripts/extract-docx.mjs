/**
 * 提取 .docx 的正文文字（docx 本质是 zip，正文在 word/document.xml）
 * 用法：node scripts/extract-docx.mjs <docx路径>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const docxPath = process.argv[2];
if (!docxPath) {
  console.error('用法: node scripts/extract-docx.mjs <docx路径>');
  process.exit(1);
}

// docx 是 zip：先用 PowerShell 解压（脚本外已完成），这里读已解压的 document.xml
const xmlPath = resolve('_review/docx/word/document.xml');
const xml = readFileSync(xmlPath, 'utf8');

// 按段落切分，提取每个 <w:t> 文本
const paragraphs = xml.split(/<w:p[ >]/).slice(1);
const lines = [];
for (const p of paragraphs) {
  const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  const line = texts.join('').trim();
  if (line) lines.push(line);
}

const text = lines.join('\n');
console.log(text);

// 同时写一份到 _review 便于我引用
const outPath = resolve('_review/同事修改建议-原文.txt');
writeFileSync(outPath, text, 'utf8');
console.log(`\n[已保存到 ${outPath}]`);
