/**
 * 测试 WSOL Swap 修复（方案 1）
 * 
 * 测试流程：
 * 1. 创建临时 WSOL 账户
 * 2. 执行 swap（WSOL -> USDC）
 * 3. 验证交易成功
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { 
  sendTradeSignal, 
  VAULT_PDA,
  adminKeypair 
} from './test';
import { TEST_ADDRESSES, RPC_ENDPOINTS } from './raydium/constants';

async function testWsolSwap() {
  try {
    console.log("\n🧪 测试 WSOL Swap 修复（方案 1）\n");
    console.log("=" .repeat(60));

    // 检查 VAULT_PDA 是否已初始化
    if (!VAULT_PDA) {
      console.error("❌ VAULT_PDA 未初始化，请先运行 test.ts");
      return;
    }

    console.log("✅ Vault PDA:", VAULT_PDA.toString());
    console.log("✅ Admin:", adminKeypair.publicKey.toString());

    // 测试参数
    const tokenIn = TEST_ADDRESSES.dwsolDevnet; // WSOL
    const tokenOut = TEST_ADDRESSES.usdcDevnet; // USDC
    const amountIn = 100000000; // 0.1 SOL
    const slippageBps = 300; // 3% 滑点

    console.log("\n📋 交易参数:");
    console.log("  输入代币 (WSOL):", tokenIn.toString());
    console.log("  输出代币 (USDC):", tokenOut.toString());
    console.log("  输入金额:", amountIn, "lamports (0.1 SOL)");
    console.log("  滑点:", slippageBps, "bps (3%)");

    console.log("\n🚀 开始执行 WSOL swap...");
    console.log("  (将创建临时 WSOL 账户，模仿 SDK 行为)\n");

    const tx = await sendTradeSignal(
      VAULT_PDA,
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
      adminKeypair
    );

    console.log("\n" + "=".repeat(60));
    console.log("✅ WSOL Swap 测试成功！");
    console.log("=" .repeat(60));
    console.log("🔗 交易签名:", tx);
    console.log("🔗 查看交易: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ WSOL Swap 测试失败");
    console.error("=" .repeat(60));
    console.error(error);
  }
}

// 运行测试
console.log("🎯 启动 WSOL Swap 测试...");
testWsolSwap();
