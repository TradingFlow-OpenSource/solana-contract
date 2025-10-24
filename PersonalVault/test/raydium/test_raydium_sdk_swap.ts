/**
 * Raydium SDK CLMM 交换完整测试
 * 
 * 用途：使用 Raydium 官方 SDK 执行完整的 CLMM swap 流程
 * - 初始化 Raydium SDK（devnet 模式）
 * - 从 RPC 加载池子信息（devnet 无 API）
 * - 计算 swap 输出金额
 * - 构建并执行 swap 交易
 * 
 * 这是最接近实际使用场景的测试，用于：
 * 1. 验证池子完全可用
 * 2. 作为集成到合约的参考实现
 * 3. 调试 SDK 相关问题
 */

import { Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2'
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js'
import BN from 'bn.js'
import { RPC_ENDPOINTS, RAYDIUM_POOLS, KEYPAIRS } from './constants'

async function testRaydiumSDKSwap() {
  console.log("🧪 使用 Raydium 官方 SDK 测试 CLMM swap...\n")

  // 连接到 devnet
  const connection = new Connection(RPC_ENDPOINTS[0], "confirmed")

  // 使用 user2 钱包
  const user2Keypair = KEYPAIRS.user2;
  console.log("👤 用户地址:", user2Keypair.publicKey.toString())

  // 初始化 Raydium SDK
  console.log("\n🔧 初始化 Raydium SDK...")
  const raydium = await Raydium.load({
    owner: user2Keypair,
    connection,
    cluster: 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
  })

  console.log("  ✓ SDK 初始化成功")

  // 池子信息
  const poolId = RAYDIUM_POOLS.solUsdcClmm2.toString()
  const amountIn = new BN(10_000_000) // 0.01 SOL

  try {
    // 从 RPC 获取池子信息（因为 devnet 没有 API）
    console.log("\n📊 从 RPC 获取池子信息...")
    const { poolInfo, poolKeys, computePoolInfo, tickData } = await raydium.clmm.getPoolInfoFromRpc(poolId)
    
    console.log("  ✓ 池子信息获取成功")
    console.log("    - mintA:", poolInfo.mintA.address)
    console.log("    - mintB:", poolInfo.mintB.address)
    console.log("    - programId:", poolInfo.programId)

    // 输入是 mintA (SOL)
    const inputMint = poolInfo.mintA.address
    const baseIn = true

    // 计算输出
    console.log("\n🔧 计算 swap 输出...")
    const { PoolUtils } = await import('@raydium-io/raydium-sdk-v2')
    const epochInfo = await raydium.fetchEpochInfo()
    
    const { minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
      poolInfo: computePoolInfo,
      tickArrayCache: tickData[poolId],
      amountIn,
      tokenOut: poolInfo.mintB,
      slippage: 0.03,
      epochInfo,
    })

    console.log("  ✓ 计算成功")
    console.log("    - 输入金额:", amountIn.toString())
    console.log("    - 最小输出:", minAmountOut.amount.raw.toString())
    console.log("    - remainingAccounts:", remainingAccounts.length, "个")

    // 执行 swap
    console.log("\n🚀 执行 swap...")
    const { execute } = await raydium.clmm.swap({
      poolInfo,
      poolKeys,
      inputMint,
      amountIn,
      amountOutMin: minAmountOut.amount.raw,
      observationId: computePoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true,
      },
      remainingAccounts,
      txVersion: TxVersion.LEGACY,
    })

    const { txId } = await execute()
    console.log("✅ Swap 成功！")
    console.log("  交易ID:", txId)
    console.log("  查看:", `https://explorer.solana.com/tx/${txId}?cluster=devnet`)
  } catch (error) {
    console.log("❌ Swap 失败:", error)
    if (error instanceof Error && 'logs' in error) {
      console.log("\n交易日志:")
      ;(error as any).logs?.forEach((log: string) => console.log("  ", log))
    }
  }
}

testRaydiumSDKSwap().catch(console.error)
