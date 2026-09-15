#!/bin/bash
# ===========================================
# 3322.net IPv6 DDNS 自动更新脚本
# 使用: crontab -e 添加以下行实现每10分钟更新
#   */10 * * * * /Users/congqiuqiudaren/codes/perler-bead-manager/update-ddns.sh
# ===========================================

# --- 替换成你的 3322 信息 ---
USERNAME="你的3322用户名"
PASSWORD="你的3322密码"
HOSTNAME="pinpin.3322.net"   # 你创建的域名
# ------------------------------

# 获取当前 IPv6 地址
IPV6=$(curl -6 -s https://api6.ipify.org 2>/dev/null)
if [ -z "$IPV6" ]; then
  # 备选 API
  IPV6=$(curl -6 -s https://ifconfig.me 2>/dev/null)
fi

if [ -z "$IPV6" ]; then
  echo "$(date): 无法获取 IPv6 地址" >> /tmp/ddns-ipv6.log
  exit 1
fi

# 更新 DDNS 记录
UPDATE_URL="http://${USERNAME}:${PASSWORD}@members.3322.net/dyndns/update?hostname=${HOSTNAME}&myip=${IPV6}"
RESULT=$(curl -s "$UPDATE_URL")

echo "$(date): IPv6=$IPV6 结果=$RESULT" >> /tmp/ddns-ipv6.log