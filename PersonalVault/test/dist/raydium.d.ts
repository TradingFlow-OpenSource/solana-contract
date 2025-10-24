import { PublicKey } from "@solana/web3.js";
/**
 * Raydium CLMM 相关工具函数
 * 用于获取完整的交换账户信息和计算必要的地址
 */
export interface RaydiumSwapAccounts {
    creatableAccounts: any;
    externalAccounts: any;
    poolInfo: any;
}
/**
 * 获取完整的 Raydium CLMM 交换账户信息
 * @param tokenIn 输入代币地址
 * @param tokenOut 输出代币地址
 * @param amountIn 输入金额（lamports）
 * @param amountOutMinimum 最小输出金额（lamports）
 * @param slippageBps 滑点（基点）
 * @returns 完整的交换账户信息
 */
export declare function getCompleteRaydiumSwapAccounts(tokenIn: PublicKey, tokenOut: PublicKey, amountIn: number, amountOutMinimum: number, slippageBps: number): Promise<RaydiumSwapAccounts>;
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
//# sourceMappingURL=raydium.d.ts.map