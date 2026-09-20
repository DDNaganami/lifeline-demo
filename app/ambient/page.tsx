'use client';

import { useEffect, useState } from 'react';
import AmbientSimulator, { type ScreenKey } from '@/components/ambient-simulator';

const VALID: ScreenKey[] = ['almanac', 'today', 'week', 'voice', 'qr', 'idle'];

/**
 * 桌面设备模拟器
 *
 * 用 ?screen=almanac|today|week|voice|idle 可以直接打开某一屏（方便固件对照）。
 * 为了让这个页面能静态导出（部署时不需要 Node 运行时），初始屏在客户端读取，
 * 所以首帧先渲染默认屏，挂载后再切到 URL 指定的那一屏。
 */
export default function AmbientPage() {
  const [initial, setInitial] = useState<ScreenKey>('almanac');

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('screen');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 需要在挂载后读取地址栏参数（静态导出无法在服务端读）
    if (wanted && VALID.includes(wanted as ScreenKey)) setInitial(wanted as ScreenKey);
  }, []);

  // key 让模拟器在初始屏确定后重新挂载，否则它内部的 state 仍是默认值
  return <AmbientSimulator key={initial} initialScreen={initial} />;
}
