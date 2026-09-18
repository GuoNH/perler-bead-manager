#!/bin/bash
# ==================================================
# 拼豆系统 - 生产模式启动脚本
# ==================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 拼豆系统 生产模式启动 ==="

# 1. 构建共享类型包（如果需要）
echo "[1/4] 构建共享类型包..."
npm run build -w shared 2>/dev/null || true

# 2. 构建前端
echo "[2/4] 构建前端..."
npm run build -w frontend 2>/dev/null || echo "（前端已构建或跳过）"

# 3. 构建后端
echo "[3/4] 构建后端..."
npm run build -w backend

# 4. 启动
echo "[4/4] 启动后端服务..."
echo "   访问地址: http://localhost:3001"
echo "   按 Ctrl+C 停止"
echo ""
exec node backend/dist/server.js