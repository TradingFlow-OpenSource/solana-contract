/**
 * Raydium 核心集成模块
 * 
 * 用途：提供与 Raydium DEX 交互所需的核心函数
 * 
 * 主要功能：
 * 1. getPoolInfoById() - 从链上获取池子详细信息
 * 2. computeClmmSwapRemainingAccounts() - 计算 CLMM swap 所需的 remaining accounts
 *    包括 tickArray 账户、观察账户等
 * 3. buildRaydiumSwapAccounts() - 构建完整的 Raydium swap 账户列表
 * 
 * 这是所有 Raydium 交换功能的基础模块，被测试文件广泛使用。
 */

import { PublicKey } from "@solana/web3.js";
import {
  TxVersion,
  PoolInfoLayout,
  CpmmPoolInfoLayout,
} from '@raydium-io/raydium-sdk-v2';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { initSdk, connection } from './config';
const BN = require('bn.js');
import { PROGRAM_ID, TEST_ADDRESSES, RAYDIUM_PROGRAMS, RAYDIUM_POOLS } from './constants';


/**
 * 🎯 构建 Raydium AMM V4 交换所需的完整账户信息
 * 专门用于 AMM V4 池子类型
 * 
 * @param vaultPda Vault PDA 地址（代币账户的所有者）
 * @param tokenIn 输入代币地址
 * @param tokenOut 输出代币地址
 * @param amountIn 输入金额（lamports）
 * @param slippageBps 滑点（基点，如 100 = 1%）
 * @returns 完整的 AMM V4 交换账户信息
 */
export async function build_devnet_raydium_amm_v4_accountInfo(
  vaultPda: PublicKey,
  tokenIn: PublicKey,
  tokenOut: PublicKey,
  amountIn: number,
  slippageBps: number = 500
): Promise<{
  success: boolean;
  accounts: {
    poolInfo: any;
    poolKeys: any;
    amountIn: any;
    amountOut: any;
    inputMint: string;
    txVersion: any;

    // 🎯 18 个 AMM V4 交换所需的具体账户地址
    swapAccounts: {
      // 程序账户 (2个)
      tokenProgramId: string;               // [0] TOKEN_PROGRAM_ID
      userOwner: string;                    // [17] 交易签名者（合约程序ID）

      // 池子核心账户 (6个)
      poolState: string;                    // [1] 池状态账户
      poolAuthority: string;                // [2] 池权限账户
      poolOpenOrders: string;               // [3] 池开放订单账户
      poolTargetOrders: string;             // [4] 池目标订单账户 (AMM V4 特有)
      poolVaultA: string;                   // [5] 池金库A账户
      poolVaultB: string;                   // [6] 池金库B账户

      // Serum/OpenBook 市场账户 (8个)
      marketProgramId: string;              // [7] 市场程序ID
      marketId: string;                     // [8] 市场ID
      marketBids: string;                   // [9] 市场买单账户
      marketAsks: string;                   // [10] 市场卖单账户
      marketEventQueue: string;             // [11] 市场事件队列
      marketBaseVault: string;              // [12] 市场基础代币金库
      marketQuoteVault: string;             // [13] 市场报价代币金库
      marketAuthority: string;              // [14] 市场权限账户

      // 用户代币账户 (2个)
      userInputTokenAccount: string;        // [15] 用户输入代币账户
      userOutputTokenAccount: string;       // [16] 用户输出代币账户
    };

    config?: any;
  };
  poolInfo: any;
  poolType: 'AMM_V4';
  error?: string;
}> {
  try {
    console.log("\n🚀 开始构建 AMM V4 交换账户信息...");
    console.log("  输入代币:", tokenIn.toString());
    console.log("  输出代币:", tokenOut.toString());
    console.log("  输入金额:", amountIn.toLocaleString(), "lamports");
    console.log("  滑点:", slippageBps, "bps");

    // 第一步：使用 findPoolsByTokenPair 查找 AMM V4 池子
    console.log("\n🔍 查找 AMM V4 池子...");
    const poolResult = await findPoolsByTokenPair(tokenIn, tokenOut);

    if (!poolResult.success || !poolResult.pool) {
      throw new Error("未找到匹配的 AMM V4 池子");
    }

    if (poolResult.pool.poolType !== 'AMM_V4') {
      throw new Error(`找到的池子类型不是 AMM V4，而是 ${poolResult.pool.poolType}`);
    }

    const poolId = poolResult.pool.poolId;
    console.log("  ✅ 找到 AMM V4 池子:", poolId);

    // 第二步：获取池子详细信息
    console.log("\n🔍 获取池子详细信息...");
    const raydium = await initSdk();
    const ammData = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
    const { poolInfo, poolKeys } = ammData;

    console.log("  ✅ 成功获取池子信息");

    // 第三步：获取 Vault 的代币账户地址
    console.log("\n🔍 获取 Vault 的代币账户地址...");
    console.log("  Vault PDA:", vaultPda.toString());

    const contractInputTokenAccount = await getAssociatedTokenAddress(
      tokenIn,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log("  ✅ Vault 输入代币账户:", contractInputTokenAccount.toString());

    const contractOutputTokenAccount = await getAssociatedTokenAddress(
      tokenOut,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log("  ✅ Vault 输出代币账户:", contractOutputTokenAccount.toString());

    // 第四步：构建完整的 18 个 AMM V4 交换账户
    console.log("\n🔧 构建完整的 18 个 AMM V4 交换账户...");

    const swapAccounts = {
      // 程序账户 (2个)
      tokenProgramId: TOKEN_PROGRAM_ID.toString(),
      userOwner: PROGRAM_ID.toString(),

      // 池子核心账户 (6个)
      poolState: poolKeys.id,
      poolAuthority: poolKeys.authority,
      poolOpenOrders: poolKeys.openOrders,
      poolTargetOrders: poolKeys.targetOrders,
      poolVaultA: poolKeys.vault.A,
      poolVaultB: poolKeys.vault.B,

      // Serum/OpenBook 市场账户 (8个)
      marketProgramId: poolKeys.marketProgramId,
      marketId: poolKeys.marketId,
      marketBids: poolKeys.marketBids,
      marketAsks: poolKeys.marketAsks,
      marketEventQueue: poolKeys.marketEventQueue,
      marketBaseVault: poolKeys.marketBaseVault,
      marketQuoteVault: poolKeys.marketQuoteVault,
      marketAuthority: poolKeys.marketAuthority,

      // 用户代币账户 (2个)
      userInputTokenAccount: contractInputTokenAccount.toString(),
      userOutputTokenAccount: contractOutputTokenAccount.toString(),
    };

    // 验证所有账户都已获取
    const missingAccounts = Object.entries(swapAccounts)
      .filter(([key, value]) => !value || value === 'undefined')
      .map(([key]) => key);

    if (missingAccounts.length > 0) {
      throw new Error(`缺少以下必需的账户: ${missingAccounts.join(', ')}`);
    }

    console.log("\n✅ 成功构建所有 18 个 AMM V4 交换账户!");
    console.log("📋 账户列表:");
    Object.entries(swapAccounts).forEach(([key, value], index) => {
      console.log(`  [${index.toString().padStart(2, '0')}] ${key}: ${value}`);
    });

    // 第五步：计算输出金额（简化版本）
    console.log("\n🧮 计算预期输出金额...");
    const estimatedAmountOut = new BN(amountIn * 0.95);

    return {
      success: true,
      accounts: {
        poolInfo,
        poolKeys,
        amountIn: new BN(amountIn),
        amountOut: estimatedAmountOut,
        inputMint: tokenIn.toString(),
        txVersion: TxVersion.LEGACY,
        swapAccounts,
        config: {
          slippageBps,
        }
      },
      poolInfo,
      poolType: 'AMM_V4' as const
    };

  } catch (error) {
    console.error("❌ build_devnet_raydium_amm_v4_accountInfo 执行失败:", error);

    return {
      success: false,
      accounts: {
        poolInfo: null,
        poolKeys: null,
        amountIn: new BN(0),
        amountOut: new BN(0),
        inputMint: "",
        txVersion: TxVersion.LEGACY,
        swapAccounts: {
          tokenProgramId: "",
          userOwner: "",
          poolState: "",
          poolAuthority: "",
          poolOpenOrders: "",
          poolTargetOrders: "",
          poolVaultA: "",
          poolVaultB: "",
          marketProgramId: "",
          marketId: "",
          marketBids: "",
          marketAsks: "",
          marketEventQueue: "",
          marketBaseVault: "",
          marketQuoteVault: "",
          marketAuthority: "",
          userInputTokenAccount: "",
          userOutputTokenAccount: ""
        }
      },
      poolInfo: null,
      poolType: 'AMM_V4' as const,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 🎯 构建 Raydium CLMM 交换所需的完整账户信息
 * 专门用于 CLMM (集中流动性) 池子类型
 * 
 * @param vaultPda Vault PDA 地址（代币账户的所有者）
 * @param tokenIn 输入代币地址
 * @param tokenOut 输出代币地址
 * @param amountIn 输入金额（lamports）
 * @param slippageBps 滑点（基点，如 100 = 1%）
 * @returns 完整的 CLMM 交换账户信息（包括 tickArray 账户）
 */
export async function build_devnet_raydium_clmm_accountInfo(
  vaultPda: PublicKey,
  tokenIn: PublicKey,
  tokenOut: PublicKey,
  amountIn: number,
  slippageBps: number = 500
): Promise<{
  success: boolean;
  accounts: {
    poolInfo: any;
    poolKeys: any;
    amountIn: any;
    amountOut: any;
    inputMint: string;
    txVersion: any;

    // 🎯 CLMM 交换所需的核心账户
    swapAccounts: {
      // 程序账户
      tokenProgramId: string;
      userOwner: string;

      // CLMM 池子核心账户
      poolState: string;
      ammConfig: string;
      poolVaultA: string;
      poolVaultB: string;
      observationState: string;

      // 用户代币账户
      userInputTokenAccount: string;
      userOutputTokenAccount: string;
    };

    // 🎯 CLMM 特有：remainingAccounts（包括 exBitmap 和 tickArrays）
    remainingAccounts: Array<{
      pubkey: string;
      isWritable: boolean;
      isSigner: boolean;
    }>;

    config?: any;
  };
  poolInfo: any;
  poolType: 'CLMM';
  error?: string;
}> {
  try {
    console.log("\n🚀 开始构建 CLMM 交换账户信息...");
    console.log("  输入代币:", tokenIn.toString());
    console.log("  输出代币:", tokenOut.toString());
    console.log("  输入金额:", amountIn.toLocaleString(), "lamports");
    console.log("  滑点:", slippageBps, "bps");

    // 🎯 直接使用 constants.ts 中定义的池子地址
    const poolId = RAYDIUM_POOLS.solUsdcClmm.toString();
    console.log("  ✅ 使用预定义的 CLMM 池子:", poolId);

    // 获取池子详细信息
    console.log("\n🔍 获取池子详细信息...");
    const raydium = await initSdk();
    const clmmData = await raydium.clmm.getPoolInfoFromRpc(poolId);
    const { poolInfo, poolKeys } = clmmData;

    console.log("  ✅ 成功获取池子信息");

    // 第三步：获取 Vault 的代币账户地址
    console.log("\n🔍 获取 Vault 的代币账户地址...");
    console.log("  Vault PDA:", vaultPda.toString());

    const contractInputTokenAccount = await getAssociatedTokenAddress(
      tokenIn,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log("  ✅ Vault 输入代币账户:", contractInputTokenAccount.toString());

    const contractOutputTokenAccount = await getAssociatedTokenAddress(
      tokenOut,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log("  ✅ Vault 输出代币账户:", contractOutputTokenAccount.toString());

    // 第四步：构建 CLMM 核心账户
    console.log("\n🔧 构建 CLMM 核心交换账户...");

    const swapAccounts = {
      // 程序账户
      tokenProgramId: TOKEN_PROGRAM_ID.toString(),
      userOwner: PROGRAM_ID.toString(),

      // CLMM 池子核心账户
      poolState: poolKeys.id,
      ammConfig: poolKeys.config.id,
      poolVaultA: poolKeys.vault.A,
      poolVaultB: poolKeys.vault.B,
      observationState: poolKeys.observationId,

      // 用户代币账户
      userInputTokenAccount: contractInputTokenAccount.toString(),
      userOutputTokenAccount: contractOutputTokenAccount.toString(),
    };

    console.log("  ✅ 成功构建 CLMM 核心账户");

    // 第五步：计算 remainingAccounts（包括 exBitmap 和 tickArrays）
    console.log("\n🔧 计算 CLMM remainingAccounts（tickArrays）...");
    
    const slippage = slippageBps / 10000; // 转换为小数（如 500 bps = 0.05）
    const remainingResult = await computeClmmSwapRemainingAccounts(
      poolId,
      tokenIn.toString(),
      amountIn,
      slippage
    );

    if (!remainingResult.success || !remainingResult.remainingAccounts) {
      throw new Error(`计算 remainingAccounts 失败: ${remainingResult.error}`);
    }

    console.log(`  ✅ 成功计算 remainingAccounts，共 ${remainingResult.remainingAccounts.length} 个账户`);

    // 转换 remainingAccounts 格式
    const remainingAccounts = remainingResult.remainingAccounts.map(acc => ({
      pubkey: acc.pubkey.toString(),
      isWritable: acc.isWritable,
      isSigner: acc.isSigner
    }));

    // 验证所有账户都已获取
    const missingAccounts = Object.entries(swapAccounts)
      .filter(([key, value]) => !value || value === 'undefined')
      .map(([key]) => key);

    if (missingAccounts.length > 0) {
      throw new Error(`缺少以下必需的账户: ${missingAccounts.join(', ')}`);
    }

    console.log("\n✅ 成功构建所有 CLMM 交换账户!");
    console.log("📋 核心账户列表:");
    Object.entries(swapAccounts).forEach(([key, value], index) => {
      console.log(`  [${index.toString().padStart(2, '0')}] ${key}: ${value}`);
    });
    console.log(`📋 RemainingAccounts: ${remainingAccounts.length} 个`);

    // 第六步：计算输出金额
    const estimatedAmountOut = remainingResult.minAmountOut 
      ? new BN(remainingResult.minAmountOut) 
      : new BN(amountIn * 0.95);

    return {
      success: true,
      accounts: {
        poolInfo,
        poolKeys,
        amountIn: new BN(amountIn),
        amountOut: estimatedAmountOut,
        inputMint: tokenIn.toString(),
        txVersion: TxVersion.LEGACY,
        swapAccounts,
        remainingAccounts,
        config: {
          slippageBps,
        }
      },
      poolInfo,
      poolType: 'CLMM' as const
    };

  } catch (error) {
    console.error("❌ build_devnet_raydium_clmm_accountInfo 执行失败:", error);

    return {
      success: false,
      accounts: {
        poolInfo: null,
        poolKeys: null,
        amountIn: new BN(0),
        amountOut: new BN(0),
        inputMint: "",
        txVersion: TxVersion.LEGACY,
        swapAccounts: {
          tokenProgramId: "",
          userOwner: "",
          poolState: "",
          ammConfig: "",
          poolVaultA: "",
          poolVaultB: "",
          observationState: "",
          userInputTokenAccount: "",
          userOutputTokenAccount: ""
        },
        remainingAccounts: []
      },
      poolInfo: null,
      poolType: 'CLMM' as const,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 根据池子 ID 获取池子信息
 * @param poolId 池子地址
 * @param type 可选的池子类型，如果指定则直接查询该类型，否则尝试所有类型
 * @returns 池子信息对象，包含池子类型、详细信息等
 */
export async function getPoolInfoById(
  poolId: string,
  type?: 'CLMM' | 'AMM_V4' | 'CPMM'
): Promise<{
  success: boolean;
  poolType?: 'CLMM' | 'AMM_V4' | 'CPMM' | 'UNKNOWN';
  poolInfo?: any;
  poolKeys?: any;
  error?: string;
}> {
  try {
    console.log(`🔍 正在获取池子信息: ${poolId}${type ? ` (指定类型: ${type})` : ''}`);

    // 初始化 Raydium SDK
    const raydium = await initSdk();

    // 如果指定了类型，直接查询该类型
    if (type) {
      console.log(`  🎯 直接查询指定类型: ${type}`);

      try {
        switch (type) {
          case 'CLMM':
            const clmmData = await raydium.clmm.getPoolInfoFromRpc(poolId);
            const { poolInfo: clmmPoolInfo, poolKeys: clmmPoolKeys } = clmmData;
            return {
              success: true,
              poolType: 'CLMM',
              poolInfo: clmmPoolInfo,
              poolKeys: clmmPoolKeys
            };

          case 'AMM_V4':
            const ammData = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
            const { poolInfo: ammPoolInfo, poolKeys: ammPoolKeys } = ammData;
            return {
              success: true,
              poolType: 'AMM_V4',
              poolInfo: ammPoolInfo,
              poolKeys: ammPoolKeys
            };

          case 'CPMM':
            const cpmmData = await raydium.cpmm.getPoolInfoFromRpc(poolId);
            const { poolInfo: cpmmPoolInfo, poolKeys: cpmmPoolKeys } = cpmmData;
            return {
              success: true,
              poolType: 'CPMM',
              poolInfo: cpmmPoolInfo,
              poolKeys: cpmmPoolKeys
            };

          default:
            throw new Error(`不支持的池子类型: ${type}`);
        }
      } catch (typeError) {
        console.log(`  ❌ 查询指定类型 ${type} 失败: ${typeError instanceof Error ? typeError.message : '未知错误'}`);
        return {
          success: false,
          error: `查询指定类型 ${type} 失败: ${typeError instanceof Error ? typeError.message : '未知错误'}`
        };
      }
    }

    // 如果没有指定类型，则尝试所有类型
    console.log(`  🔄 未指定类型，尝试所有类型...`);

    try {
      const clmmData = await raydium.clmm.getPoolInfoFromRpc(poolId);
      const { poolInfo, poolKeys } = clmmData;

      // console.log("✅ CLMM 池子信息获取成功");
      // console.log(`  池子类型: CLMM`);
      // console.log(`  池子地址: ${poolInfo.id}`);
      // console.log(`  代币 A: ${poolInfo.mintA.address}`);
      // console.log(`  代币 B: ${poolInfo.mintB.address}`);
      // console.log(`  程序 ID: ${poolInfo.programId}`);

      return {
        success: true,
        poolType: 'CLMM',
        poolInfo,
        poolKeys
      };
    } catch (clmmError) {
      console.log(`  ⚠️  不是 CLMM 池子: ${clmmError instanceof Error ? clmmError.message : '未知错误'}`);
    }

    // 尝试作为 AMM v4 池子获取信息
    try {
      // console.log("  🔄 尝试作为 AMM v4 池子获取...");
      const ammData = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
      const { poolInfo, poolKeys } = ammData;

      // console.log("✅ AMM v4 池子信息获取成功");
      // console.log(`  池子类型: AMM_V4`);
      // console.log(`  池子地址: ${poolId}`);
      // console.log(`  代币 A: ${poolInfo.mintA.address}`);
      // console.log(`  代币 B: ${poolInfo.mintB.address}`);
      // console.log(`  程序 ID: ${poolInfo.programId}`);

      return {
        success: true,
        poolType: 'AMM_V4',
        poolInfo,
        poolKeys
      };
    } catch (ammError) {
      console.log(`  ⚠️  不是 AMM v4 池子: ${ammError instanceof Error ? ammError.message : '未知错误'}`);
    }

    // 尝试作为 CPMM 池子获取信息
    try {
      // console.log("  🔄 尝试作为 CPMM 池子获取...");
      const cpmmData = await raydium.cpmm.getPoolInfoFromRpc(poolId);
      const { poolInfo, poolKeys } = cpmmData;

      // console.log("✅ CPMM 池子信息获取成功");
      // console.log(`  池子类型: CPMM`);
      // console.log(`  池子地址: ${poolId}`);
      // console.log(`  代币 A: ${poolInfo.mintA.address}`);
      // console.log(`  代币 B: ${poolInfo.mintB.address}`);
      // console.log(`  程序 ID: ${poolInfo.programId}`);

      return {
        success: true,
        poolType: 'CPMM',
        poolInfo,
        poolKeys
      };
    } catch (cpmmError) {
      console.log(`  ⚠️  不是 CPMM 池子: ${cpmmError instanceof Error ? cpmmError.message : '未知错误'}`);
    }

    console.log("❌ 无法识别池子类型或获取池子信息");
    return {
      success: false,
      error: "无法识别池子类型或获取池子信息"
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 获取池子信息失败: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 查询指定程序下的所有账户信息和统计信息
 * @param programId 程序 ID
 * @returns 程序账户信息和统计信息对象
 */
export async function getProgramAccounts(
  programId: string,
  type?: 'pool' | 'all'
): Promise<{
  success: boolean;
  programId: string;
  accountCount: number;
  accounts?: Array<{
    address: string;
    dataSize: number;
    lamports: number;
    owner: string;
    containsSolMint: boolean;
    containsUsdcMint: boolean;
  }>;
  stats?: {
    totalLamports: number;
    dataSizeDistribution: Record<string, number>;
    ownerPrograms: Record<string, number>;
  };
  error?: string;
}> {
  try {
    console.log(`🔍 正在查询程序 ${programId} 下的所有账户...${type === 'pool' ? ' (仅池子账户)' : ''}`);

    // 查询所有账户
    let options: any = {
      commitment: 'confirmed'
    };
    console.log(`  🔍 查询所有账户`);

    // 搜索程序下的所有账户
    const accountsResponse = await connection.getProgramAccounts(new PublicKey(programId), options);
    let accounts = Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.value || [];

    console.log(`✅ 找到 ${accounts.length} 个账户`);

    // 如果指定了类型为 pool，过滤账户
    if (type === 'pool') {
      console.log(`  🔍 过滤池子账户...`);

      // 定义池子类型的数据大小
      const poolDataSizes = [
        PoolInfoLayout.span,  // CLMM 池子
        CpmmPoolInfoLayout.span,  // CPMM 池子
        1544  // AMM v4 池子
      ];

      // 过滤出符合池子数据大小的账户
      const filteredAccounts = accounts.filter((account: any) => {
        const dataSize = account.account.data.length;
        const isPool = poolDataSizes.includes(dataSize);
        return isPool;
      });

      console.log(`  ✅ 过滤完成: 从 ${accounts.length} 个账户中筛选出 ${filteredAccounts.length} 个池子账户`);

      // 使用过滤后的账户继续处理
      accounts = filteredAccounts;

      // 如果筛选后没有池子账户，直接返回
      if (accounts.length === 0) {
        console.log(`  ⚠️  筛选后没有找到池子账户，直接返回`);
        return {
          success: true,
          programId,
          accountCount: 0,
          accounts: [],
          stats: {
            totalLamports: 0,
            dataSizeDistribution: {},
            ownerPrograms: {}
          }
        };
      }
    }



    // 分析每个账户
    const analyzedAccounts = accounts.map((account: any, index: number) => {
      const { pubkey, account: accountInfo } = account;
      const address = pubkey.toString();
      const dataSize = accountInfo.data.length;
      const lamports = accountInfo.lamports;
      const owner = accountInfo.owner.toString();

      // 检查是否包含 SOL 和 USDC mint
      const containsSolMint = dataSize > 0 && accountInfo.data.includes(0x01); // 简化检查
      const containsUsdcMint = dataSize > 0 && accountInfo.data.includes(0x02); // 简化检查

      // console.log(`📋 账户 ${index}:`);
      // console.log(`  地址: ${address}`);
      // console.log(`  数据大小: ${dataSize} bytes`);
      // console.log(`  余额: ${lamports} lamports`);
      // console.log(`  包含 SOL mint: ${containsSolMint ? '✅' : '❌'}`);
      // console.log(`  包含 USDC mint: ${containsUsdcMint ? '✅' : '❌'}`);

      return {
        address,
        dataSize,
        lamports,
        owner,
        containsSolMint,
        containsUsdcMint
      };
    });

    // 计算统计信息
    const totalLamports = analyzedAccounts.reduce((sum: number, account: any) => sum + account.lamports, 0);

    // 数据大小分布
    const dataSizeDistribution: Record<string, number> = {};
    analyzedAccounts.forEach((account: any) => {
      const sizeKey = `${account.dataSize} bytes`;
      dataSizeDistribution[sizeKey] = (dataSizeDistribution[sizeKey] || 0) + 1;
    });

    // 所有者程序分布
    const ownerPrograms: Record<string, number> = {};
    analyzedAccounts.forEach((account: any) => {
      ownerPrograms[account.owner] = (ownerPrograms[account.owner] || 0) + 1;
    });

    console.log(`📈 程序 ${programId} 统计信息:`);
    console.log(`  总账户数: ${accounts.length}`);
    console.log(`  总余额: ${totalLamports} lamports (${totalLamports / 1e9} SOL)`);
    // console.log(`  数据大小分布:`, dataSizeDistribution);
    console.log(`  所有者程序分布:`, ownerPrograms);

    return {
      success: true,
      programId,
      accountCount: accounts.length,
      accounts: analyzedAccounts,
      stats: {
        totalLamports,
        dataSizeDistribution,
        ownerPrograms
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 查询程序账户失败: ${errorMessage}`);

    return {
      success: false,
      programId,
      accountCount: 0,
      error: errorMessage
    };
  }
}

/**
 * 查找包含指定代币对的所有类型池子 (AMM, CLMM, CPMM)
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns 包含所有找到的池子信息的对象
 */
export async function findPoolsByTokenPair(
  tokenA: PublicKey,
  tokenB: PublicKey
): Promise<{
  success: boolean;
  pool?: {
    poolId: string;
    poolType: 'AMM_V4' | 'CLMM' | 'CPMM';
    programId: string;
    programName: string;
    mintA: string;
    mintB: string;
    poolInfo?: any;
  };
  error?: string;
}> {
  console.log(`🔍 开始搜索包含代币对 ${tokenA.toString()} <-> ${tokenB.toString()} 的池子...`);

  const result = {
    success: true,
    pool: undefined as any,
    error: undefined as string | undefined
  };

  try {
    // 获取所有 Raydium 程序（使用 constants.ts 中定义的地址）
    const allPrograms = [
      { name: 'CLMM', id: RAYDIUM_PROGRAMS.clmm, type: 'CLMM' },
      { name: 'AMM_V4', id: RAYDIUM_PROGRAMS.ammV4, type: 'AMM_V4' }
    ];

    console.log(`📋 将搜索 ${allPrograms.length} 个程序...`);

    // 遍历每个程序
    for (const program of allPrograms) {
      try {
        console.log(`\n🔍 搜索程序: ${program.name} (${program.id.toString()})`);

        // 获取该程序下的所有账户（池子）
        // 对于 CLMM 程序，传入 'pool' 类型以添加数据大小过滤器
        const programAccounts = await getProgramAccounts(program.id.toString(), 'pool');

        if (!programAccounts.success || !programAccounts.accounts || programAccounts.accounts.length === 0) {
          console.log(`   ⚠️  该程序下没有账户或查询失败，跳过`);
          continue;
        }

        console.log(`   ✅ 找到 ${programAccounts.accounts.length} 个账户`);

        // 分析每个账户（池子）
        for (const account of programAccounts.accounts) {
          try {
            const poolId = account.address;
            console.log(`   🔍 分析池子: ${poolId}`);

            // 调用 getPoolInfoById 获取池子信息
            // 如果程序类型不是 UNKNOW，则传入类型参数；否则不传，让方法自动检测
            const poolInfo = await getPoolInfoById(
              poolId,
              program.type !== 'UNKNOW' ? program.type as 'CLMM' | 'AMM_V4' | 'CPMM' : undefined
            );

            if (poolInfo.success && poolInfo.poolInfo) {
              // 检查池子是否包含目标代币对
              const poolData = poolInfo.poolInfo;
              let mintA: string | null = null;
              let mintB: string | null = null;

              // 直接检查代币地址是否存在
              if (poolData.mintA?.address && poolData.mintB?.address) {
                mintA = poolData.mintA.address;
                mintB = poolData.mintB.address;
              } else if (poolData.baseMint?.address && poolData.quoteMint?.address) {
                // 备用方案：检查其他可能的字段名
                mintA = poolData.baseMint.address;
                mintB = poolData.quoteMint.address;
              }

              // 检查是否找到匹配的代币对
              if (mintA && mintB) {
                const hasTokenA = mintA === tokenA.toString() || mintB === tokenA.toString();
                const hasTokenB = mintA === tokenB.toString() || mintB === tokenB.toString();

                if (hasTokenA && hasTokenB) {
                  console.log(`   🎯 找到匹配的池子!`);
                  console.log(`      代币A: ${mintA}`);
                  console.log(`      代币B: ${mintB}`);

                  // 构建池子信息对象
                  const poolInfoObj = {
                    poolId: poolData.id || poolId,
                    poolType: program.type as 'AMM_V4' | 'CLMM' | 'CPMM',
                    programId: poolData.programId || program.id.toString(),
                    programName: program.name,
                    mintA,
                    mintB,
                    poolInfo: poolData
                  };

                  // 直接设置找到的池子
                  result.pool = poolInfoObj;

                  // 找到匹配的池子后，直接返回结果，不再继续搜索
                  console.log(`   🚀 找到匹配池子，提前结束搜索`);
                  return result;
                } else if (hasTokenA || hasTokenB) {
                  console.log(` 找到有目标代币的池子，但是不匹配`);
                  console.log(`      代币A: ${mintA}`);
                  console.log(`      代币B: ${mintB}`);
                }
              }
            } else {
              console.log(`   ⚠️  获取池子信息失败: ${poolInfo.error || '未知错误'}`);
            }
          } catch (poolError) {
            console.log(`   ❌ 分析池子时出错: ${poolError instanceof Error ? poolError.message : '未知错误'}`);
            continue;
          }
        }

        // 程序搜索计数（可选，用于调试）

      } catch (programError) {
        console.log(`❌ 搜索程序 ${program.name} 时出错: ${programError instanceof Error ? programError.message : '未知错误'}`);
        continue;
      }
    }

    if (result.pool) {
      console.log(`\n✅ 搜索完成! 找到匹配的池子:`);
      console.log(`   池子ID: ${result.pool.poolId}`);
      console.log(`   池子类型: ${result.pool.poolType}`);
      console.log(`   程序ID: ${result.pool.programId}`);
      console.log(`   程序名称: ${result.pool.programName}`);
    } else {
      console.log(`\n⚠️  搜索完成! 未找到匹配的池子`);
    }

  } catch (error) {
    console.error(`💥 搜索过程中发生错误: ${error instanceof Error ? error.message : '未知错误'}`);
    result.success = false;
    result.error = error instanceof Error ? error.message : '未知错误';
  }

  return result;
}

/**
 * 在 devnet 环境中获取池子的完整信息
 * 依次尝试 AMM、CLMM、CPMM 三种池子类型，找到就返回
 * 
 * @param poolId 池子地址
 * @returns 包含 poolInfo 和 poolKeys 的完整池子信息
 */
export async function get_dev_net_ammConfig(
  poolId: string
): Promise<{
  success: boolean;
  poolType?: 'AMM_V4' | 'CLMM' | 'CPMM';
  poolInfo?: any;
  poolKeys?: any;
  error?: string;
  debug?: {
    stage: string;
    message: string;
    data?: any;
  };
}> {
  try {
    console.log(`🔍 开始获取 devnet 环境下的 AMM 配置账户...`);
    console.log(`  池子 ID: ${poolId}`);

    // 初始化 Raydium SDK
    const raydium = await initSdk();

    try {
      const ammData = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
      const { poolInfo, poolKeys } = ammData;
      return {
        success: true,
        poolType: 'AMM_V4',
        poolInfo,
        poolKeys,
      };

    } catch (ammError) {
      console.log(`  ⚠️  不是 AMM v4 池子: ${ammError instanceof Error ? ammError.message : '未知错误'}`);
    }

    console.log(`\n📋 第二阶段: 尝试作为 CLMM 池子获取...`);

    try {
      const clmmData = await raydium.clmm.getPoolInfoFromRpc(poolId);
      const { poolInfo, poolKeys } = clmmData;
      return {
        success: true,
        poolType: 'CLMM',
        poolInfo,
        poolKeys,
      };

    } catch (clmmError) {
      console.log(`  ⚠️  不是 CLMM 池子: ${clmmError instanceof Error ? clmmError.message : '未知错误'}`);
    }

    console.log(`\n📋 第三阶段: 尝试作为 CPMM 池子获取...`);

    try {
      const cpmmData = await raydium.cpmm.getPoolInfoFromRpc(poolId);
      const { poolInfo, poolKeys } = cpmmData;
      return {
        success: true,
        poolType: 'CPMM',
        poolInfo,
        poolKeys,

      };

    } catch (cpmmError) {
      console.log(`  ⚠️  不是 CPMM 池子: ${cpmmError instanceof Error ? cpmmError.message : '未知错误'}`);
    }

    // ========================================
    // 所有类型都尝试失败
    // ========================================
    console.log(`\n❌ 所有池子类型都尝试失败，无法获取 AMM 配置账户`);

    return {
      success: false,
      error: "无法识别池子类型或获取池子信息，所有类型（AMM_V4、CLMM、CPMM）都尝试失败",

    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 get_dev_net_ammConfig 执行失败: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,

    };
  }
}

/**
 * 主函数 - 可以直接运行此文件来测试池子搜索功能
 */
async function main() {
  try {
    console.log("\n🔍 测试 getPoolInfoById 方法...");
    // 使用一个已知的 devnet 池子地址进行测试
    const knownPoolId = "3AchjHmMujJW4HRiYLztLFyK5w8QFY7oiteZa4ASHdV9";
    
    console.log("🔍 调用 getPoolInfoById...");
    const poolInfo = await getPoolInfoById(knownPoolId);
    console.log("getPoolInfoById 返回值:", JSON.stringify(poolInfo, null, 2));

    console.log("\n🔍 测试 findPoolsByTokenPair 方法...");
    const tokenA = new PublicKey("So11111111111111111111111111111111111111112"); // SOL
    const tokenB = new PublicKey("USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT"); // USDC Devnet

    const poolsResult = await findPoolsByTokenPair(tokenA, tokenB);
    console.log("findPoolsByTokenPair 返回值:", JSON.stringify(poolsResult, null, 2));

  } catch (error) {
    console.error("\n💥 程序执行出错:", error);
    if (error instanceof Error) {
      console.error("  错误信息:", error.message);
      console.error("  错误堆栈:", error.stack);
    }
  }
}

/**
 * 计算 CLMM swap 所需的 remainingAccounts（包括 tickArray 账户）
 * 基于 Raydium SDK V2 的实现
 * 
 * @param poolId CLMM 池子地址
 * @param inputMint 输入代币 mint
 * @param amountIn 输入金额
 * @param slippage 滑点（小数，如 0.01 = 1%）
 * @returns remainingAccounts 数组
 */
export async function computeClmmSwapRemainingAccounts(
  poolId: string,
  inputMint: string,
  amountIn: number,
  slippage: number
): Promise<{
  success: boolean;
  remainingAccounts?: Array<{ pubkey: PublicKey; isWritable: boolean; isSigner: boolean }>;
  tickArrayAddresses?: string[];
  minAmountOut?: string;
  error?: string;
}> {
  try {
    console.log("\n🔧 计算 CLMM swap remainingAccounts...");
    console.log("  池子ID:", poolId);
    console.log("  输入代币:", inputMint);
    console.log("  输入金额:", amountIn);
    console.log("  滑点:", slippage);

    // 初始化 SDK
    const raydium = await initSdk();

    // 获取池子信息（包括 poolInfo, poolKeys, computePoolInfo, tickData）
    const data = await raydium.clmm.getPoolInfoFromRpc(poolId);
    if (!data) {
      return {
        success: false,
        error: "无法获取池子信息"
      };
    }

    const { poolInfo, poolKeys, computePoolInfo, tickData } = data;

    console.log("  ✓ 获取池子信息成功");
    console.log("  当前 Tick:", computePoolInfo.currentPrice);
    console.log("  代币A:", poolInfo.mintA.address);
    console.log("  代币B:", poolInfo.mintB.address);

    // 确定交易方向（baseIn 为 true 表示 A → B）
    const baseIn = inputMint === poolInfo.mintA.address;

    if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address) {
      return {
        success: false,
        error: "输入代币不匹配池子的代币"
      };
    }

    console.log("  交易方向:", baseIn ? "A → B" : "B → A");

    // 获取 epoch 信息
    const epochInfo = await raydium.fetchEpochInfo();

    // 使用 PoolUtils.computeAmountOutFormat 计算 swap（包括需要的 tickArray）
    const { PoolUtils } = await import('@raydium-io/raydium-sdk-v2');
    
    const result = await PoolUtils.computeAmountOutFormat({
      poolInfo: computePoolInfo,
      tickArrayCache: tickData[poolId],
      amountIn: new BN(amountIn),
      tokenOut: poolInfo[baseIn ? 'mintB' : 'mintA'],
      slippage: slippage,
      epochInfo: epochInfo,
    });

    console.log("  ✓ 计算 swap 结果成功");
    console.log("  最小输出:", result.minAmountOut.amount.raw.toString());
    console.log("  价格影响:", result.priceImpact.toFixed(4) + "%");

    // remainingAccounts 是 PublicKey[] 类型，SDK 只返回 tickArrays
    const tickArrayPublicKeys = result.remainingAccounts;
    
    console.log("  ✓ SDK 返回的 tickArrays:", tickArrayPublicKeys.length, "个");
    
    // 🎯 重要：Raydium CLMM swap 需要的 remainingAccounts 顺序是：
    // 1. exBitmapAccount (如果存在，必须在前面！)
    // 2. tickArrays
    const allRemainingAccounts: Array<{ pubkey: PublicKey; isWritable: boolean; isSigner: boolean }> = [];
    
    // 添加 exBitmapAccount（从 poolKeys 获取）
    if (poolKeys.exBitmapAccount) {
      const exBitmapPubkey = typeof poolKeys.exBitmapAccount === 'string' 
        ? new PublicKey(poolKeys.exBitmapAccount)
        : poolKeys.exBitmapAccount;
      
      allRemainingAccounts.push({
        pubkey: exBitmapPubkey,
        isWritable: true,  // exBitmapAccount 需要可写
        isSigner: false
      });
      console.log("  ✓ 添加 exBitmapAccount:", exBitmapPubkey.toString());
    }
    
    // 添加 tickArrays
    tickArrayPublicKeys.forEach(pubkey => {
      allRemainingAccounts.push({
        pubkey: pubkey,
        isWritable: true,  // tickArray 账户需要可写
        isSigner: false
      });
    });
    
    console.log("  ✓ remainingAccounts 构建完成，共", allRemainingAccounts.length, "个账户");
    console.log("    包括:", poolKeys.exBitmapAccount ? "1 个 exBitmapAccount +" : "", tickArrayPublicKeys.length, "个 tickArrays");
    
    // 提取地址用于日志
    const allAddresses = allRemainingAccounts.map(acc => acc.pubkey.toString());
    
    // 打印每个账户地址
    allAddresses.forEach((addr, i) => {
      console.log(`    [${i}] ${addr}`);
    });

    return {
      success: true,
      remainingAccounts: allRemainingAccounts,
      tickArrayAddresses: allAddresses,
      minAmountOut: result.minAmountOut.amount.raw.toString()
    };

  } catch (error) {
    console.error("  ✗ 计算 remainingAccounts 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 主函数 - 可以直接运行此文件来测试池子搜索功能
 */

// main().then(() => {
//   console.log("\n✨ 程序执行完成");
//   process.exit(0);
// }).catch((error) => {
//   console.error("\n💥 程序异常退出:", error);
//   process.exit(1);
// });