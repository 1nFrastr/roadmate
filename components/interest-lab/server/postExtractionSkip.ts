/** 产品构想/功能文案帖：逐帖 LLM 易误提取功能名，直接跳过 */
const PRODUCT_SPEC_SIGNALS = [
  /路友\s*road\s*mate/i,
  /云端功能设计/,
  /【轻身份管理】/,
  /【轻链接管理】/,
  /产品原则：/,
  /陌生人.*乌托邦/,
  /雷达自动扫描/,
  /设备碰一碰/,
  /匹配成功动画/,
  /数字身份（app/i,
];

/** 纯讨论他人/转评，无作者自身可匹配锚点 */
const THIRD_PARTY_ONLY_SIGNALS = [
  /徐师傅/,
  /up\s*的主/,
  /这个嘉宾/,
  /评论区说得很好/,
];

export function shouldSkipTagExtraction(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const productHits = PRODUCT_SPEC_SIGNALS.filter((pattern) => pattern.test(trimmed)).length;
  if (productHits >= 2) return true;
  if (productHits >= 1 && /功能设计|产品原则|愿景/.test(trimmed)) return true;

  if (THIRD_PARTY_ONLY_SIGNALS.some((pattern) => pattern.test(trimmed))) {
    const selfSignals = /我(?:在|想|准备|最近|正在)|我的|我们团队|我做|打算做/.test(trimmed);
    if (!selfSignals) return true;
  }

  return false;
}
