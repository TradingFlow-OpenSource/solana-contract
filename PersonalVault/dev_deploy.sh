#!/bin/bash

# PersonalVault 首次部署脚本
# 用于第一次部署项目到 Solana Devnet

set -e  # 遇到错误立即退出

echo "🚀 开始 PersonalVault 部署..."

# 检查必要工具
echo "📋 检查必要工具..."
command -v anchor >/dev/null 2>&1 || { echo "❌ 需要安装 Anchor CLI"; exit 1; }
command -v solana >/dev/null 2>&1 || { echo "❌ 需要安装 Solana CLI"; exit 1; }

# 设置网络
echo "🌐 设置网络为 Devnet..."
solana config set --url devnet

# 检查钱包余额
echo "💰 检查钱包余额..."
BALANCE_BEFORE=$(solana balance | awk '{print $1}')
echo "当前余额: $BALANCE_BEFORE SOL"

# 如果需要，请求空投
if (( $(echo "$BALANCE_BEFORE < 2" | awk '{print ($1 < 2)}') )); then
    echo "💸 余额不足，请求空投..."
    solana airdrop 5
    sleep 5
    BALANCE_BEFORE=$(solana balance | awk '{print $1}')
    echo "新余额: $BALANCE_BEFORE SOL"
fi

# 清理并构建
echo "🧹 清理旧构建文件..."
anchor clean

echo "🔨 构建程序（启用 devnet feature）..."
anchor build -- --features devnet

# 获取程序 ID
echo "🆔 获取程序 ID..."
PROGRAM_ID=$(solana address -k target/deploy/personal_vault-keypair.json)
echo "程序 ID: $PROGRAM_ID"

# 更新 Anchor.toml 中的程序 ID（如果需要）
echo "📝 更新 Anchor.toml 中的程序 ID..."
sed -i.bak "s/personal_vault = \"[^\"]*\"/personal_vault = \"$PROGRAM_ID\"/" Anchor.toml

# 部署程序
echo "🚀 部署程序到 Devnet..."
anchor deploy

# 验证部署（等待账户传播）
echo "✅ 验证部署..."
sleep 3
solana program show $PROGRAM_ID 2>/dev/null || echo "⚠️  账户传播中，稍后可用 'solana program show $PROGRAM_ID' 验证"

# 检查部署后余额
BALANCE_AFTER=$(solana balance | awk '{print $1}')
COST=$(echo "$BALANCE_BEFORE - $BALANCE_AFTER" | awk '{printf "%.9f", $1}')

echo ""
echo "🎉 部署完成！"
echo "程序 ID: $PROGRAM_ID"
echo ""
echo "💰 部署成本："
echo "  部署前余额: $BALANCE_BEFORE SOL"
echo "  部署后余额: $BALANCE_AFTER SOL"
echo "  部署花费: $COST SOL"
echo ""
echo "💡 提示："
echo "1. 保存程序 ID: $PROGRAM_ID"
echo "2. 运行测试: anchor test --skip-lint"
echo "3. 如需更新，使用: ./dev_update.sh"
