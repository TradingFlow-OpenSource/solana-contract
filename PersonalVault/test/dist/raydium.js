"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompleteRaydiumSwapAccounts = getCompleteRaydiumSwapAccounts;
exports.calculateRequiredTickArrays = calculateRequiredTickArrays;
exports.getTickArrayStartIndexByTick = getTickArrayStartIndexByTick;
exports.getPdaTickArrayAddress = getPdaTickArrayAddress;
exports.setSystemPrograms = setSystemPrograms;
exports.setUserTokenAccounts = setUserTokenAccounts;
const web3_js_1 = require("@solana/web3.js");
/**
 * 获取完整的 Raydium CLMM 交换账户信息
 * @param tokenIn 输入代币地址
 * @param tokenOut 输出代币地址
 * @param amountIn 输入金额（lamports）
 * @param amountOutMinimum 最小输出金额（lamports）
 * @param slippageBps 滑点（基点）
 * @returns 完整的交换账户信息
 */
async function getCompleteRaydiumSwapAccounts(tokenIn, tokenOut, amountIn, amountOutMinimum, slippageBps) {
    try {
        console.log("\n🔍 获取完整的 Raydium 交换账户信息...");
        console.log("  输入代币:", tokenIn.toString());
        console.log("  输出代币:", tokenOut.toString());
        console.log("  输入金额:", amountIn.toLocaleString(), "lamports");
        console.log("  最小输出:", amountOutMinimum.toLocaleString(), "lamports");
        console.log("  滑点:", slippageBps, "bps");
        // 1. 查找池子
        let poolInfo = null;
        const raydiumApiUrl = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json";
        try {
            const poolsResponse = await fetch(raydiumApiUrl);
            if (poolsResponse.ok) {
                const allPools = await poolsResponse.json();
                console.log("✅ 获取所有池子列表成功，池子数量:", allPools.length);
                // 查找匹配的池子 - 需要检查是否是 CLMM 池子
                poolInfo = allPools.find((pool) => {
                    // 检查是否是 CLMM 池子（concentrated liquidity）
                    const isClmmPool = pool.version === 6 || pool.version === 7; // CLMM 版本
                    const baseMint = pool.baseMint;
                    const quoteMint = pool.quoteMint;
                    // 检查是否匹配输入和输出代币，且是 CLMM 池子
                    return isClmmPool && ((baseMint === tokenIn.toString() && quoteMint === tokenOut.toString()) ||
                        (baseMint === tokenOut.toString() && quoteMint === tokenIn.toString()));
                });
                if (poolInfo) {
                    console.log("✅ 找到匹配的 CLMM 池子:", poolInfo.id);
                    console.log("  池子版本:", poolInfo.version);
                    console.log("  基础代币:", poolInfo.baseMint);
                    console.log("  报价代币:", poolInfo.quoteMint);
                    console.log("  池子地址:", poolInfo.id);
                    console.log("  程序ID:", poolInfo.programId);
                }
                else {
                    console.log("❌ 未找到匹配的池子");
                    throw new Error("未找到匹配的 Raydium CLMM 池子");
                }
            }
            else {
                throw new Error(`API 请求失败: ${poolsResponse.status}`);
            }
        }
        catch (error) {
            console.error("❌ 获取池子信息失败:", error);
            throw error;
        }
        // 2. 获取外部账户（不能创建的）- 基于 Raydium SDK 标准
        const externalAccounts = {
            // 核心账户 - 这些由 Raydium 协议管理
            ammConfig: poolInfo.config?.id ? new web3_js_1.PublicKey(poolInfo.config.id) : null,
            poolState: poolInfo.id ? new web3_js_1.PublicKey(poolInfo.id) : null,
            observationState: poolInfo.observationId ? new web3_js_1.PublicKey(poolInfo.observationId) : null,
            exTickArrayBitmap: poolInfo.exBitmapAccount ? new web3_js_1.PublicKey(poolInfo.exBitmapAccount) : null,
            // 代币金库 - 由 Raydium 管理
            poolVaultA: poolInfo.vault?.A ? new web3_js_1.PublicKey(poolInfo.vault.A) : null,
            poolVaultB: poolInfo.vault?.B ? new web3_js_1.PublicKey(poolInfo.vault.B) : null,
            // 代币铸币账户
            mintA: poolInfo.mintA?.address ? new web3_js_1.PublicKey(poolInfo.mintA.address) : null,
            mintB: poolInfo.mintB?.address ? new web3_js_1.PublicKey(poolInfo.mintB.address) : null,
            // 程序ID
            raydiumProgramId: poolInfo.programId ? new web3_js_1.PublicKey(poolInfo.programId) : null,
            // 原始池子信息
            poolInfo: poolInfo,
            apiResponse: poolInfo
        };
        // 3. 获取可创建账户（可以创建的）
        const creatableAccounts = {
            // 用户代币账户 - 这些需要用户创建
            userTokenAccountA: null, // 需要根据用户钱包动态创建
            userTokenAccountB: null, // 需要根据用户钱包动态创建
            // 系统程序
            systemProgram: null, // 将在调用时设置
            tokenProgram: null, // 将在调用时设置
            associatedTokenProgram: null, // 将在调用时设置
            // 计算单元预算程序
            computeBudgetProgram: null // 将在调用时设置
        };
        // 4. 动态计算 tick arrays（这是关键部分）
        if (poolInfo.programId && poolInfo.id && poolInfo.config?.tickSpacing && poolInfo.tickCurrent !== undefined) {
            const tickArrays = calculateRequiredTickArrays(poolInfo.programId, poolInfo.id, poolInfo.config.tickSpacing, poolInfo.tickCurrent);
            externalAccounts.tickArrays = tickArrays;
        }
        console.log("✅ 获取完整交换账户信息成功");
        console.log("  池子信息:", poolInfo.id);
        console.log("  外部账户数量:", Object.keys(externalAccounts).length);
        console.log("  可创建账户数量:", Object.keys(creatableAccounts).length);
        console.log("  代币金库A:", externalAccounts.poolVaultA?.toString());
        console.log("  代币金库B:", externalAccounts.poolVaultB?.toString());
        return {
            creatableAccounts,
            externalAccounts,
            poolInfo
        };
    }
    catch (error) {
        console.error("❌ 获取完整 Raydium 交换账户信息失败:", error);
        throw error;
    }
}
/**
 * 计算 swap 操作所需的 tick arrays
 * 基于 Raydium SDK 的实现逻辑
 * @param programId 程序ID
 * @param poolId 池子ID
 * @param tickSpacing tick间距
 * @param currentTick 当前tick
 * @returns tick array地址列表
 */
function calculateRequiredTickArrays(programId, poolId, tickSpacing, currentTick) {
    const TICK_ARRAY_SIZE = 64; // Raydium CLMM 中每个 tick array 包含 64 个 tick
    // 计算当前 tick 所在的 tick array 起始索引
    const currentTickArrayStartIndex = getTickArrayStartIndexByTick(currentTick, tickSpacing);
    // 计算需要的 tick arrays（通常需要 3-5 个）
    const requiredTickArrays = [];
    // 添加当前 tick array 和相邻的几个
    for (let i = -1; i <= 1; i++) {
        const tickArrayStartIndex = currentTickArrayStartIndex + (i * tickSpacing * TICK_ARRAY_SIZE);
        const tickArrayAddress = getPdaTickArrayAddress(new web3_js_1.PublicKey(programId), new web3_js_1.PublicKey(poolId), tickArrayStartIndex);
        requiredTickArrays.push(tickArrayAddress);
    }
    return requiredTickArrays;
}
/**
 * 根据 tick 索引计算 tick array 起始索引
 * 基于 Raydium SDK 的实现
 * @param tickIndex tick索引
 * @param tickSpacing tick间距
 * @returns tick array起始索引
 */
function getTickArrayStartIndexByTick(tickIndex, tickSpacing) {
    const TICK_ARRAY_SIZE = 64;
    return Math.floor(tickIndex / (tickSpacing * TICK_ARRAY_SIZE)) * tickSpacing * TICK_ARRAY_SIZE;
}
/**
 * 计算 tick array 的 PDA 地址
 * 基于 Raydium SDK 的实现
 * @param programId 程序ID
 * @param poolId 池子ID
 * @param startIndex 起始索引
 * @returns tick array的PDA地址
 */
function getPdaTickArrayAddress(programId, poolId, startIndex) {
    const TICK_ARRAY_SEED = Buffer.from("tick_array", "utf8");
    // 将 startIndex 转换为字节
    const startIndexBytes = new Uint8Array(4);
    const view = new DataView(startIndexBytes.buffer);
    view.setInt32(0, startIndex, true);
    const [publicKey] = web3_js_1.PublicKey.findProgramAddressSync([TICK_ARRAY_SEED, poolId.toBuffer(), startIndexBytes], programId);
    return publicKey;
}
/**
 * 设置可创建账户的系统程序地址
 * @param creatableAccounts 可创建账户对象
 * @param systemProgram 系统程序地址
 * @param tokenProgram 代币程序地址
 * @param associatedTokenProgram 关联代币程序地址
 * @param computeBudgetProgram 计算单元预算程序地址
 * @returns 更新后的可创建账户对象
 */
function setSystemPrograms(creatableAccounts, systemProgram, tokenProgram, associatedTokenProgram, computeBudgetProgram) {
    return {
        ...creatableAccounts,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        computeBudgetProgram
    };
}
/**
 * 设置用户代币账户地址
 * @param creatableAccounts 可创建账户对象
 * @param userTokenAccountA 用户代币账户A地址
 * @param userTokenAccountB 用户代币账户B地址
 * @returns 更新后的可创建账户对象
 */
function setUserTokenAccounts(creatableAccounts, userTokenAccountA, userTokenAccountB) {
    return {
        ...creatableAccounts,
        userTokenAccountA,
        userTokenAccountB
    };
}
//# sourceMappingURL=raydium.js.map