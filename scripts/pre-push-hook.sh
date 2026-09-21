#!/bin/sh
# ---------------------------------------------------------------------------
# push 前的密钥检查钩子
#
# 为什么需要它：
#   2026-09-21 我把一个真实的 DeepSeek key 明文写进了 check-secrets.mjs
#   并推到了公开仓库，导致 key 被拿走、账户余额被消耗。
#   **当时的部署脚本里有密钥检查，但只在"部署"时跑，不在"push"时跑。**
#   这个钩子补的就是这个缺口：**没通过检查就推不上去。**
#
# 安装（在新克隆的仓库里执行一次）：
#   cp scripts/pre-push-hook.sh .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push
#
# 临时跳过（只在确实需要时用，比如急着推一个和密钥无关的修复）：
#   git push --no-verify
# ---------------------------------------------------------------------------

echo "[pre-push] 检查密钥泄漏…"

if ! command -v node >/dev/null 2>&1; then
  echo "[pre-push] ⚠️ 找不到 node，跳过检查（请自行确认没有密钥）"
  exit 0
fi

node scripts/check-secrets.mjs
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo ""
  echo "[pre-push] ❌ 密钥检查未通过，已阻止推送。"
  echo "[pre-push]    仓库是公开的——密钥一旦推上去就必须立刻作废重建。"
  echo "[pre-push]    修好上面的问题再推；确实要跳过用 git push --no-verify"
  exit 1
fi

echo "[pre-push] ✅ 通过"
exit 0
