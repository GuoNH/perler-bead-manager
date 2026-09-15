#!/bin/bash
# ==================================================
# 拼豆系统 - IPv6 公网模式启动脚本
# ==================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 拼豆系统 IPv6 公网模式 ==="
echo ""

# 构建前端和后端
echo "[构建] 正在构建..."
npm run build -w shared 2>/dev/null || true
npm run build -w frontend 2>/dev/null || echo " 前端已构建"
npm run build -w backend
echo ""

# 显示本机 IPv6 地址
echo "[网络] 本机公网 IPv6 地址:"
curl -6 -s https://api6.ipify.org
echo ""
echo ""

# 启动（监听所有 IPv6 地址）
echo "[启动] 监听 [::]:3001"
echo ""
echo "  本地访问:  http://localhost:3001"
echo "  公网访问:  http://[你的IPv6地址]:3001"
echo ""
echo "  如果你配好了 3322.net DDNS:"
echo "  http://pinpin.3322.net:3001"
echo ""
echo "  使用 pm2 持久化运行:"
echo "  pm2 start ecosystem.config.js --update-env"
echo ""

export HOST="::"
export PORT=3001
exec node backend/dist/index.js