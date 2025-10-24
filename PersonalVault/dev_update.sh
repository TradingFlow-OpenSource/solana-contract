#!/bin/bash

# PersonalVault 程序更新脚本
# 用于升级已部署的程序

set -e  # 遇到错误立即退出

echo "🔄 开始 PersonalVault 程序更新..."

# 检查必要工具
echo "📋 检查必要工具..."
command -v anchor >/dev/null 2>&1 || { echo "❌ 需要安装 Anchor CLI"; exit 1; }
command -v solana >/dev/null 2>&1 || { echo "❌ 需要安装 Solana CLI"; exit 1; }

# 设置网络
echo "🌐 设置网络为 Devnet..."
solana config set --url devnet

# 检查钱包余额
echo "💰 检查钱包余额..."
BALANCE=$(solana balance | awk '{print $1}')
echo "当前余额: $BALANCE SOL"

# 如果需要，请求空投
if [[ $(echo "$BALANCE < 1" | bc -l) -eq 1 ]]; then
    echo "💸 余额不足，请求空投..."
    solana airdrop 5
    sleep 5
    echo "新余额: $(solana balance)"
fi

# 获取程序 ID
echo "🆔 获取程序 ID..."
PROGRAM_ID="FFbZem3yLs4Pr4LoXJPuqFp7CJsDvaYj9xQEkYboTaoJ"
echo "程序 ID: $PROGRAM_ID"

# 检查程序是否已部署
# echo "🔍 检查程序是否已部署..."
# if solana program show $PROGRAM_ID >/dev/null 2>&1; then
#     echo "✅ 程序 $PROGRAM_ID 已找到，可以进行升级"
# else
#     echo "❌ 程序 $PROGRAM_ID 未找到，请先运行 ./dev_deploy.sh 进行首次部署"
#     exit 1
# fi

# 显示当前程序状态
echo "📊 当前程序状态:"
solana program show $PROGRAM_ID

# 清理并重新构建
echo "🧹 清理旧构建文件..."
anchor clean

echo "🔨 重新构建程序（启用 devnet feature）..."
anchor build -- --features devnet

# 检查构建是否成功
if [ ! -f "target/deploy/personal_vault.so" ]; then
    echo "❌ 构建失败：target/deploy/personal_vault.so 文件未生成"
    echo "尝试使用 cargo build-sbf 重新构建..."
    cargo build-sbf -- --features devnet
    if [ ! -f "target/deploy/personal_vault.so" ]; then
        echo "❌ 构建仍然失败，请检查代码错误"
        exit 1
    fi
fi

# 检查构建文件时间戳
echo "⏰ 检查构建文件时间戳..."
BUILD_TIME=$(stat -f "%m" target/deploy/personal_vault.so 2>/dev/null || stat -c "%Y" target/deploy/personal_vault.so 2>/dev/null)
CURRENT_TIME=$(date +%s)
echo "构建时间: $(date -r $BUILD_TIME)"
echo "当前时间: $(date)"

# 强制重新编译（如果需要）
if [ $((CURRENT_TIME - BUILD_TIME)) -lt 60 ]; then
    echo "⚠️  检测到构建文件可能不是最新的，强制重新编译..."
    cargo build-sbf -- --features devnet
fi

# 记录升级前余额
BALANCE_BEFORE=$(solana balance | awk '{print $1}')

# 升级程序
echo "🚀 升级程序..."
echo "使用 RPC 模式部署以提高稳定性..."
solana program deploy \
    --program-id $PROGRAM_ID \
    --upgrade-authority test/admin-keypair.json \
    --with-compute-unit-price 10000 \
    --max-sign-attempts 500 \
    --use-rpc \
    target/deploy/personal_vault.so

# 记录升级后余额
BALANCE_AFTER=$(solana balance | awk '{print $1}')

# 计算花费
COST=$(echo "$BALANCE_BEFORE - $BALANCE_AFTER" | bc)

# 验证升级
echo "✅ 验证升级..."
echo "升级后的程序状态:"
solana program show $PROGRAM_ID

# 验证新功能
echo "🔍 验证新功能..."
echo "检查新指令是否存在..."
solana program dump $PROGRAM_ID temp_program.so
strings temp_program.so | grep -E "(GetBalance|WrapSol|UnwrapSol|SendTradeSignal)" | head -5
rm temp_program.so

echo ""
echo "========================================"
echo "🎉 程序更新完成！"
echo "========================================"
echo "程序 ID: $PROGRAM_ID"
echo "新部署槽位: $(solana program show $PROGRAM_ID | grep 'Last Deployed In Slot' | awk '{print $5}')"
echo ""
echo "💰 本次更新成本："
echo "   升级前余额: $BALANCE_BEFORE SOL"
echo "   升级后余额: $BALANCE_AFTER SOL"
echo "   升级花费: $COST SOL"
echo ""
echo "========================================"
