import { PublicKey, Connection } from "@solana/web3.js";
import { ApiV3PoolInfoConcentratedItem, ComputeClmmPoolInfo, ReturnTypeFetchMultiplePoolTickArrays } from '@raydium-io/raydium-sdk-v2';
/**
 * Raydium CLMM 相关工具函数
 * 基于 Raydium SDK V2 官方实现:
 * - Mainnet: 使用 API 获取池子信息
 * - Devnet: 使用 RPC 方法获取池子信息 (API 不支持 devnet)
 */
export interface RaydiumSwapAccounts {
    creatableAccounts: any;
    externalAccounts: any;
    poolInfo: {
        poolInfo: ApiV3PoolInfoConcentratedItem;
        clmmPoolInfo?: ComputeClmmPoolInfo;
        tickCache?: ReturnTypeFetchMultiplePoolTickArrays;
    };
    swapResult?: any;
}
/**
 * 搜索所有类型的 Raydium 池子
 * @param connection Solana 连接对象
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns 所有找到的池子信息
 */
export declare function findAllRaydiumPools(connection: Connection, tokenA: PublicKey, tokenB: PublicKey): Promise<{
    clmm: string | null;
    ammV4: string | null;
    cpmm: string | null;
    summary: string;
    allPrograms: Record<string, any>;
}>;
/**
 * 使用 Raydium SDK 获取 AMM v4 池子信息
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns AMM v4 池子信息
 */
export declare function getAmmV4PoolInfo(tokenA: PublicKey, tokenB: PublicKey): Promise<any>;
/**
 * 获取完整的 Raydium CLMM 交换账户信息
 * @param tokenIn 输入代币地址
 * @param tokenOut 输出代币地址
 * @param amountIn 输入金额（lamports）
 * @param amountOutMinimum 最小输出金额（lamports）
 * @param slippageBps 滑点（基点）
 * @param poolId 池子 ID
 * @param cluster 网络类型 ('mainnet' | 'devnet')
 * @param owner 用户钱包 (devnet 环境必需)
 * @returns 完整的交换账户信息
 */
export declare function getCompleteRaydiumSwapAccounts(tokenIn: PublicKey, tokenOut: PublicKey, amountIn: number, amountOutMinimum: number, slippageBps: number, poolId: string, cluster?: 'mainnet' | 'devnet'): Promise<RaydiumSwapAccounts>;
/**
 * 计算 swap 操作所需的 tick arrays
 * 基于 Raydium SDK 的实现逻辑
 * @param programId 程序ID
 * @param poolId 池子ID
 * @param tickSpacing tick间距
 * @param currentTick 当前tick
 * @returns tick array地址列表
 */
export declare function calculateRequiredTickArrays(programId: string, poolId: string, tickSpacing: number, currentTick: number): PublicKey[];
/**
 * 根据 tick 索引计算 tick array 起始索引
 * 基于 Raydium SDK 的实现
 * @param tickIndex tick索引
 * @param tickSpacing tick间距
 * @returns tick array起始索引
 */
export declare function getTickArrayStartIndexByTick(tickIndex: number, tickSpacing: number): number;
/**
 * 计算 tick array 的 PDA 地址
 * 基于 Raydium SDK 的实现
 * @param programId 程序ID
 * @param poolId 池子ID
 * @param startIndex 起始索引
 * @returns tick array的PDA地址
 */
export declare function getPdaTickArrayAddress(programId: PublicKey, poolId: PublicKey, startIndex: number): PublicKey;
/**
 * 设置可创建账户的系统程序地址
 * @param creatableAccounts 可创建账户对象
 * @param systemProgram 系统程序地址
 * @param tokenProgram 代币程序地址
 * @param associatedTokenProgram 关联代币程序地址
 * @param computeBudgetProgram 计算单元预算程序地址
 * @returns 更新后的可创建账户对象
 */
export declare function setSystemPrograms(creatableAccounts: any, systemProgram: PublicKey, tokenProgram: PublicKey, associatedTokenProgram: PublicKey, computeBudgetProgram: PublicKey): any;
/**
 * 设置用户代币账户地址
 * @param creatableAccounts 可创建账户对象
 * @param userTokenAccountA 用户代币账户A地址
 * @param userTokenAccountB 用户代币账户B地址
 * @returns 更新后的可创建账户对象
 */
export declare function setUserTokenAccounts(creatableAccounts: any, userTokenAccountA: PublicKey, userTokenAccountB: PublicKey): any;
/**
 * 在指定程序下查找包含特定代币对的池子
 * @param connection Solana 连接对象
 * @param programId 程序 ID
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns 池子信息，如果找到的话
 */
export declare function findPoolByTokens(connection: Connection, programId: PublicKey, tokenA: PublicKey, tokenB: PublicKey): Promise<{
    poolAddress: string;
    mintA: string;
    mintB: string;
    dataSize: number;
    poolData: any;
    programName: string;
} | null>;
//# sourceMappingURL=raydium.d.ts.map