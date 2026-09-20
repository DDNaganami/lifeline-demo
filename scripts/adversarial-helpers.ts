/**
 * 对抗性检查用的小工具（避免测试脚本里写一堆内联导入）
 */
import { buildLifePhases, type LifePhase } from '../lib/phases.ts';
import type { BirthInfo } from '../lib/types.ts';

/** buildLifePhases 的别名——对抗性检查里反复用到，起个短名字 */
export function buildHeroPhases(birth: BirthInfo): LifePhase[] {
  return buildLifePhases(birth);
}
