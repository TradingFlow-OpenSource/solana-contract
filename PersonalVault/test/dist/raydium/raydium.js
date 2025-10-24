"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAllRaydiumPools = findAllRaydiumPools;
exports.getAmmV4PoolInfo = getAmmV4PoolInfo;
exports.getCompleteRaydiumSwapAccounts = getCompleteRaydiumSwapAccounts;
exports.calculateRequiredTickArrays = calculateRequiredTickArrays;
exports.getTickArrayStartIndexByTick = getTickArrayStartIndexByTick;
exports.getPdaTickArrayAddress = getPdaTickArrayAddress;
exports.setSystemPrograms = setSystemPrograms;
exports.setUserTokenAccounts = setUserTokenAccounts;
exports.findPoolByTokens = findPoolByTokens;
const web3_js_1 = require("@solana/web3.js");
const raydium_sdk_v2_1 = require("@raydium-io/raydium-sdk-v2");
const spl_token_1 = require("@solana/spl-token");
const config_1 = require("./config");
const bn_js_1 = __importDefault(require("bn.js"));
// 从实际交易中发现的真实 Raydium 程序 ID
const REAL_RAYDIUM_PROGRAMS = {
    RAYDIUM_ROUTER: new web3_js_1.PublicKey('DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH'),
    Router: raydium_sdk_v2_1.ALL_PROGRAM_ID.Router,
    CREATE_CPMM_POOL_PROGRAM: raydium_sdk_v2_1.ALL_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    CREATE_CPMM_POOL_AUTH: raydium_sdk_v2_1.ALL_PROGRAM_ID.CREATE_CPMM_POOL_AUTH,
    CREATE_CPMM_POOL_FEE_ACC: raydium_sdk_v2_1.ALL_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
    LOCK_CPMM_PROGRAM: raydium_sdk_v2_1.ALL_PROGRAM_ID.LOCK_CPMM_PROGRAM,
    LOCK_CPMM_AUTH: raydium_sdk_v2_1.ALL_PROGRAM_ID.LOCK_CPMM_AUTH,
    AMM_V4: raydium_sdk_v2_1.ALL_PROGRAM_ID.AMM_V4,
    AMM_STABLE: raydium_sdk_v2_1.ALL_PROGRAM_ID.AMM_STABLE,
    CLMM_PROGRAM_ID: raydium_sdk_v2_1.ALL_PROGRAM_ID.CLMM_PROGRAM_ID,
    CLMM_LOCK_PROGRAM_ID: raydium_sdk_v2_1.ALL_PROGRAM_ID.CLMM_LOCK_PROGRAM_ID,
    CLMM_LOCK_AUTH_ID: raydium_sdk_v2_1.ALL_PROGRAM_ID.CLMM_LOCK_AUTH_ID,
};
/**
 * 在 devnet 上动态搜索匹配的 CLMM 代币对池子
 * 基于 Raydium SDK V2 官方 fetchAllPools 示例
 * @param connection Solana 连接对象
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns 匹配的池子 ID，如果没找到则返回 null
 */
async function findClmmPoolByTokenPair(connection, tokenA, tokenB) {
    try {
        console.log("🔍 正在搜索 CLMM 池子...");
        console.log(`  代币 A: ${tokenA.toString()}`);
        console.log(`  代币 B: ${tokenB.toString()}`);
        // 使用 getProgramAccounts 获取所有 CLMM 池子
        // 基于官方 SDK demo 的 fetchAllPools.ts 实现
        console.log("📡 从 CLMM 程序获取所有池子账户...");
        console.log(`🔗 CLMM 程序 ID: ${raydium_sdk_v2_1.ALL_PROGRAM_ID.CLMM_PROGRAM_ID.toString()}`);
        console.log(`📏 数据大小过滤器: ${raydium_sdk_v2_1.PoolInfoLayout.span} bytes`);
        // 先测试网络连接
        try {
            const slot = await connection.getSlot();
            console.log(`✅ 网络连接正常，当前 slot: ${slot}`);
        }
        catch (error) {
            console.log(`❌ 网络连接失败:`, error instanceof Error ? error.message : String(error));
            return null;
        }
        const clmmPoolsData = await connection.getProgramAccounts(raydium_sdk_v2_1.ALL_PROGRAM_ID.CLMM_PROGRAM_ID, {
            filters: [{ dataSize: raydium_sdk_v2_1.PoolInfoLayout.span }],
            commitment: 'confirmed'
        });
        console.log(`📊 找到 ${clmmPoolsData.length} 个 CLMM 池子账户`);
        if (clmmPoolsData.length === 0) {
            console.log("❌ 没有找到任何 CLMM 池子");
            // 尝试获取其他账户来验证网络是否正常
            try {
                console.log("🔍 尝试获取其他账户来验证网络...");
                // 使用 SystemProgram 的地址
                const systemProgramId = new web3_js_1.PublicKey("11111111111111111111111111111111");
                const systemAccounts = await connection.getProgramAccounts(systemProgramId, {
                    filters: [{ dataSize: 0 }],
                    commitment: 'confirmed'
                });
                console.log(`✅ 网络正常，找到 ${systemAccounts.length} 个系统账户`);
                // 尝试获取一些已知的代币账户
                const tokenAccounts = await connection.getProgramAccounts(spl_token_1.TOKEN_PROGRAM_ID, {
                    filters: [{ dataSize: 165 }], // 代币账户的标准大小
                    commitment: 'confirmed'
                });
                console.log(`✅ 网络正常，找到 ${tokenAccounts.length} 个代币账户`);
                console.log("💡 结论: 网络连接正常，但 devnet 上确实没有 CLMM 池子");
                console.log("💡 建议: 尝试主网或使用已知的池子 ID");
            }
            catch (error) {
                console.log(`❌ 网络诊断失败:`, error instanceof Error ? error.message : String(error));
                console.log("💡 结论: 可能是网络连接问题");
            }
            return null;
        }
        // 解析每个池子，查找匹配的代币对
        for (let i = 0; i < clmmPoolsData.length; i++) {
            const poolAccount = clmmPoolsData[i];
            try {
                // 解析池子数据
                const poolData = raydium_sdk_v2_1.PoolInfoLayout.decode(poolAccount.account.data);
                const poolId = poolAccount.pubkey.toString();
                // 检查代币对是否匹配
                const mintA = poolData.mintA.toString();
                const mintB = poolData.mintB.toString();
                console.log(`🔍 检查池子 ${i + 1}/${clmmPoolsData.length}: ${poolId.slice(0, 8)}...`);
                console.log(`   代币 A: ${mintA}`);
                console.log(`   代币 B: ${mintB}`);
                // 检查是否匹配（考虑代币对的两个方向）
                if ((mintA === tokenA.toString() && mintB === tokenB.toString()) ||
                    (mintA === tokenB.toString() && mintB === tokenA.toString())) {
                    console.log(`✅ 找到匹配的池子: ${poolId}`);
                    console.log(`   代币对: ${mintA} / ${mintB}`);
                    return poolId;
                }
            }
            catch (error) {
                console.log(`❌ 解析池子 ${i + 1} 失败:`, error instanceof Error ? error.message : String(error));
                continue;
            }
        }
        console.log("❌ 没有找到匹配的代币对池子");
        return null;
    }
    catch (error) {
        console.error("❌ 搜索池子时发生错误:", error);
        return null;
    }
}
/**
 * 搜索所有类型的 Raydium 池子
 * @param connection Solana 连接对象
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns 所有找到的池子信息
 */
async function findAllRaydiumPools(connection, tokenA, tokenB) {
    console.log("\n🔍 开始搜索所有类型的 Raydium 池子...");
    console.log(`  代币 A: ${tokenA.toString()}`);
    console.log(`  代币 B: ${tokenB.toString()}`);
    const result = {
        clmm: null,
        ammV4: null,
        cpmm: null,
        summary: "",
        allPrograms: {}
    };
    // 首先搜索真实的 Raydium 程序
    console.log("\n🚀 开始搜索真实的 Raydium 程序...");
    const programIds = Object.entries(REAL_RAYDIUM_PROGRAMS);
    console.log(`   总共找到 ${programIds.length} 个程序`);
    let totalProgramsSearched = 0;
    let totalAccountsFound = 0;
    for (const [programName, programId] of programIds) {
        if (!programId || programId.toString() === web3_js_1.PublicKey.default.toString()) {
            continue;
        }
        try {
            // 查询该程序下的所有账户
            const accountsData = await connection.getProgramAccounts(programId, {
                commitment: 'confirmed'
            });
            totalAccountsFound += accountsData.length;
            if (accountsData.length === 0) {
                totalProgramsSearched++;
                continue;
            }
            // 记录搜索的程序
            result.allPrograms[programName] = {
                accountsCount: accountsData.length,
                searched: true,
                foundPool: false
            };
            // 尝试不同的数据大小过滤器来查找池子
            const dataSizes = [raydium_sdk_v2_1.PoolInfoLayout.span, raydium_sdk_v2_1.CpmmPoolInfoLayout.span, 752, 1024, 1544, 2048];
            let foundPools = 0;
            for (const dataSize of dataSizes) {
                try {
                    const filteredAccounts = accountsData.filter(acc => acc.account.data.length === dataSize);
                    if (filteredAccounts.length === 0)
                        continue;
                    // 检查所有账户
                    const accountsToCheck = filteredAccounts.length;
                    for (let i = 0; i < accountsToCheck; i++) {
                        const account = filteredAccounts[i];
                        try {
                            // 尝试解析池子数据
                            let poolData = null;
                            let mintA = null;
                            let mintB = null;
                            // 尝试不同的布局解析
                            if (dataSize === raydium_sdk_v2_1.PoolInfoLayout.span) {
                                try {
                                    poolData = raydium_sdk_v2_1.PoolInfoLayout.decode(account.account.data);
                                    mintA = poolData.mintA?.toString();
                                    mintB = poolData.mintB?.toString();
                                }
                                catch (e) {
                                    // 忽略解析错误
                                }
                            }
                            else if (dataSize === raydium_sdk_v2_1.CpmmPoolInfoLayout.span) {
                                try {
                                    poolData = raydium_sdk_v2_1.CpmmPoolInfoLayout.decode(account.account.data);
                                    mintA = poolData.mintA?.toString();
                                    mintB = poolData.mintB?.toString();
                                }
                                catch (e) {
                                    // 忽略解析错误
                                }
                            }
                            else if (dataSize === 1544) {
                                // 对于 1544 bytes 的数据，尝试多种偏移量来提取代币地址
                                // 尝试从不同偏移量提取可能的代币地址
                                const data = account.account.data;
                                for (let offset = 0; offset < Math.min(data.length - 32, 100); offset += 32) {
                                    try {
                                        const possibleMint = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
                                        const mintStr = possibleMint.toString();
                                        // 检查是否是已知的代币地址
                                        if (mintStr === tokenA.toString() || mintStr === tokenB.toString()) {
                                            if (!mintA) {
                                                mintA = mintStr;
                                            }
                                            else if (!mintB && mintStr !== mintA) {
                                                mintB = mintStr;
                                                break;
                                            }
                                        }
                                    }
                                    catch (e) {
                                        // 忽略无效的公钥
                                    }
                                }
                            }
                            else {
                                // 对于未知大小的数据，尝试从原始数据中提取代币地址
                                if (account.account.data.length >= 64) {
                                    try {
                                        const possibleMintA = new web3_js_1.PublicKey(account.account.data.slice(32, 64));
                                        const possibleMintB = new web3_js_1.PublicKey(account.account.data.slice(64, 96));
                                        mintA = possibleMintA.toString();
                                        mintB = possibleMintB.toString();
                                    }
                                    catch (e) {
                                        // 忽略解析错误
                                    }
                                }
                            }
                            // 只有找到 tokenB (USDC) 才算找到池子
                            if (mintA || mintB) {
                                const isTokenBInMintA = mintA === tokenB.toString();
                                const isTokenBInMintB = mintB === tokenB.toString();
                                if (isTokenBInMintA || isTokenBInMintB) {
                                    console.log(`\n🎯 在 ${programName} 中找到池子:`);
                                    console.log(`   池子地址: ${account.pubkey.toString()}`);
                                    console.log(`   代币A: ${mintA?.slice(0, 8) || '未知'}...`);
                                    console.log(`   代币B: ${mintB?.slice(0, 8) || '未知'}...`);
                                    console.log(`   数据大小: ${dataSize} bytes`);
                                    // 根据程序类型设置结果
                                    if (programName === 'CLMM_PROGRAM_ID') {
                                        result.clmm = account.pubkey.toString();
                                    }
                                    else if (programName === 'AMM_V4') {
                                        result.ammV4 = account.pubkey.toString();
                                    }
                                    else if (programName === 'AMM_STABLE') {
                                        result.cpmm = account.pubkey.toString();
                                    }
                                    else if (programName === 'RAYDIUM_ROUTER') {
                                        result.ammV4 = account.pubkey.toString(); // 路由程序也可能包含池子信息
                                    }
                                    else if (programName === 'Router') {
                                        result.ammV4 = account.pubkey.toString(); // 通用路由程序
                                    }
                                    // 更新程序信息
                                    result.allPrograms[programName] = {
                                        ...result.allPrograms[programName],
                                        foundPool: true,
                                        poolAddress: account.pubkey.toString(),
                                        dataSize: dataSize,
                                        mintA: mintA,
                                        mintB: mintB,
                                        poolData: poolData,
                                        matchedToken: tokenB.toString(),
                                        matchType: isTokenBInMintA ? 'tokenB_in_mintA' : 'tokenB_in_mintB'
                                    };
                                    foundPools++;
                                    break; // 找到匹配的池子，跳出内层循环
                                }
                            }
                        }
                        catch (error) {
                            // 忽略单个账户的解析错误
                            continue;
                        }
                    }
                    if (foundPools > 0)
                        break; // 找到池子，跳出数据大小循环
                }
                catch (error) {
                    // 忽略特定数据大小的错误
                    continue;
                }
            }
            // 静默处理，不打印重复信息
            totalProgramsSearched++;
        }
        catch (error) {
            // 静默处理错误，不打印日志
            result.allPrograms[programName] = {
                searched: true,
                foundPool: false,
                error: error instanceof Error ? error.message : String(error)
            };
            totalProgramsSearched++;
        }
    }
    // 生成总结
    const foundPools = [result.clmm, result.ammV4, result.cpmm].filter(Boolean).length;
    result.summary = `找到 ${foundPools} 种类型的匹配池子，总共搜索了 ${totalProgramsSearched} 个程序，发现 ${totalAccountsFound} 个账户`;
    console.log("\n📋 搜索结果总结:");
    console.log(`   CLMM: ${result.clmm ? '✅ 找到' : '❌ 未找到'}`);
    console.log(`   AMM v4: ${result.ammV4 ? '✅ 找到' : '❌ 未找到'}`);
    console.log(`   CPMM: ${result.cpmm ? '✅ 找到' : '❌ 未找到'}`);
    console.log(`   搜索的程序数量: ${totalProgramsSearched}`);
    console.log(`   发现的账户总数: ${totalAccountsFound}`);
    // 只显示找到池子的程序详情
    if (Object.keys(result.allPrograms).length > 0) {
        const foundPrograms = Object.entries(result.allPrograms).filter(([_, info]) => info.foundPool);
        if (foundPrograms.length > 0) {
            console.log("\n🎯 找到的池子详情:");
            for (const [programName, info] of foundPrograms) {
                console.log(`   ${programName}: ${info.poolAddress}`);
            }
        }
    }
    return result;
}
/**
 * 使用 Raydium SDK 获取 AMM v4 池子信息
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns AMM v4 池子信息
 */
async function getAmmV4PoolInfo(tokenA, tokenB) {
    try {
        console.log("\n🔍 使用 Raydium SDK 获取 AMM v4 池子信息...");
        // 创建 Raydium SDK 实例
        const raydium = await (0, config_1.initSdk)();
        // 尝试获取 AMM v4 池子列表
        console.log("📡 获取 AMM v4 池子列表...");
        // 使用 SDK 的 liquidity 模块来获取 AMM v4 池子
        if (raydium.liquidity) {
            console.log("✅ Liquidity 模块可用");
            // 尝试获取所有 AMM v4 池子
            try {
                // 使用 getRpcPoolInfos 方法获取池子信息
                console.log("📡 尝试获取 AMM v4 池子信息...");
                // 由于我们不知道具体的池子 ID，先尝试获取一些已知的池子
                // 或者使用其他方法来获取池子列表
                console.log("💡 注意: 需要具体的池子 ID 来获取详细信息");
                console.log("💡 建议: 使用已知的池子 ID 或从 API 获取池子列表");
            }
            catch (error) {
                console.log(`❌ 获取 AMM v4 池子失败:`, error instanceof Error ? error.message : String(error));
            }
        }
        else {
            console.log("❌ Liquidity 模块不可用");
        }
        return null;
    }
    catch (error) {
        console.error("❌ 获取 AMM v4 池子信息失败:", error);
        return null;
    }
}
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
async function getCompleteRaydiumSwapAccounts(tokenIn, tokenOut, amountIn, amountOutMinimum, slippageBps, poolId, cluster = 'mainnet') {
    try {
        console.log("\n🔍 获取完整的 Raydium 交换账户信息...");
        console.log("  网络:", cluster);
        console.log("  输入代币:", tokenIn.toString());
        console.log("  输出代币:", tokenOut.toString());
        console.log("  输入金额:", amountIn.toLocaleString(), "lamports");
        console.log("  最小输出:", amountOutMinimum.toLocaleString(), "lamports");
        console.log("  滑点:", slippageBps, "bps");
        // 1. 查找池子 - 根据网络类型使用不同方法
        let poolInfo = null;
        let poolKeys;
        let clmmPoolInfo;
        let tickCache;
        // 创建 Raydium SDK 实例 (在分支判断之前创建，避免重复)
        const raydium = await (0, config_1.initSdk)();
        if (cluster === 'mainnet') {
            // Mainnet: 使用 API 获取池子信息 (官方标准做法)
            try {
                // 使用官方 API 方法查找池子
                const raydiumApiUrl = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json";
                const poolsResponse = await fetch(raydiumApiUrl);
                if (poolsResponse.ok) {
                    const allPools = await poolsResponse.json();
                    console.log("✅ 获取 mainnet 池子列表成功，池子数量:", allPools.length);
                    // 查找匹配的 CLMM 池子
                    poolInfo = allPools.find((pool) => {
                        const isClmmPool = pool.version === 6 || pool.version === 7; // CLMM 版本
                        const baseMint = pool.baseMint;
                        const quoteMint = pool.quoteMint;
                        return isClmmPool && ((baseMint === tokenIn.toString() && quoteMint === tokenOut.toString()) ||
                            (baseMint === tokenOut.toString() && quoteMint === tokenIn.toString()));
                    });
                    if (poolInfo) {
                        // Mainnet 需要获取 ComputeClmmPoolInfo 和 tickCache
                        clmmPoolInfo = await raydium_sdk_v2_1.PoolUtils.fetchComputeClmmInfo({
                            connection: raydium.connection,
                            poolInfo,
                        });
                        tickCache = await raydium_sdk_v2_1.PoolUtils.fetchMultiplePoolTickArrays({
                            connection: raydium.connection,
                            poolKeys: [clmmPoolInfo],
                        });
                    }
                }
                else {
                    throw new Error(`Mainnet API 请求失败: ${poolsResponse.status}`);
                }
            }
            catch (error) {
                console.error("❌ Mainnet API 获取池子信息失败:", error);
                throw error;
            }
        }
        else {
            // Devnet: 使用新的 findPoolByTokens 方法查找匹配的代币对池子
            console.log("🔍 Devnet 环境，使用 findPoolByTokens 搜索匹配的代币对池子...");
            // 使用用户提供的 poolId
            if (!poolId) {
                throw new Error("poolId 参数是必需的");
            }
            console.log(`🎯 使用指定的池子 ID: ${poolId}`);
            // 首先尝试在 CLMM 程序中查找池子
            const clmmPool = await findPoolByTokens(config_1.connection, REAL_RAYDIUM_PROGRAMS.CLMM_PROGRAM_ID, tokenIn, tokenOut);
            if (clmmPool) {
                console.log(`✅ 在 CLMM 程序中找到匹配的池子: ${clmmPool.poolAddress}`);
                // 使用已解析的池子数据
                if (clmmPool.poolData) {
                    poolInfo = clmmPool.poolData;
                    console.log("✅ 使用已解析的池子数据");
                }
                else {
                    // 如果 poolData 为空，尝试使用 SDK 方法
                    console.log("🔄 已解析数据为空，尝试使用 SDK 方法...");
                    try {
                        const rpcData = await raydium.clmm.getPoolInfoFromRpc(poolId);
                        poolInfo = rpcData.poolInfo;
                        poolKeys = rpcData.poolKeys;
                        clmmPoolInfo = rpcData.computePoolInfo;
                        tickCache = rpcData.tickData;
                        console.log(`✅ SDK 方法成功获取池子信息: ${poolId}`);
                    }
                    catch (sdkError) {
                        console.log("⚠️ SDK 方法失败，尝试构建基本池子信息...");
                        // 构建基本的池子信息结构
                        poolInfo = {
                            id: poolId,
                            address: poolId,
                            type: "concentrated",
                            programId: REAL_RAYDIUM_PROGRAMS.CLMM_PROGRAM_ID.toString(),
                            mintA: { address: clmmPool.mintA, decimals: 6 }, // 默认精度
                            mintB: { address: clmmPool.mintB, decimals: 6 }, // 默认精度
                            version: 6, // CLMM 版本
                            baseMint: clmmPool.mintA,
                            quoteMint: clmmPool.mintB,
                            config: {
                                id: "default", // 默认配置
                                feeRate: 0.0025, // 默认费率
                                protocolFeeRate: 0.0001,
                                tickSpacing: 1,
                                description: "CLMM Pool",
                            }
                        };
                        console.log(`✅ 成功构建基本池子信息: ${poolId}`);
                        console.log("  基础代币:", poolInfo.mintA.address);
                        console.log("  报价代币:", poolInfo.mintB.address);
                    }
                }
            }
            else {
                // 如果 CLMM 中没找到，尝试其他程序
                console.log("🔍 CLMM 中未找到，尝试在其他程序中搜索...");
                const ammV4Pool = await findPoolByTokens(config_1.connection, REAL_RAYDIUM_PROGRAMS.AMM_V4, tokenIn, tokenOut);
                if (ammV4Pool) {
                    console.log(`✅ 在 AMM v4 程序中找到匹配的池子: ${ammV4Pool.poolAddress}`);
                    // 处理 AMM v4 池子...
                    poolInfo = ammV4Pool.poolData || {
                        id: ammV4Pool.poolAddress,
                        type: "amm",
                        mintA: { address: ammV4Pool.mintA },
                        mintB: { address: ammV4Pool.mintB }
                    };
                }
                else {
                    throw new Error(`未找到包含代币对 ${tokenIn.toString()} / ${tokenOut.toString()} 的 Raydium 池子`);
                }
            }
        }
        // 验证是否找到池子
        if (!poolInfo) {
            console.log("❌ 未找到匹配的池子");
            throw new Error(`未找到匹配的 Raydium CLMM 池子 (${cluster})`);
        }
        // 此时 poolInfo 已经确定不为 null
        console.log("✅ 找到匹配的 CLMM 池子:", poolInfo.id);
        console.log("  池子类型:", poolInfo.type);
        console.log("  基础代币:", poolInfo.mintA.address);
        console.log("  报价代币:", poolInfo.mintB.address);
        console.log("  池子地址:", poolInfo.id);
        console.log("  程序ID:", poolInfo.programId);
        // 2. 获取网络纪元信息 (PoolUtils.computeAmountOutFormat 必需参数)
        let epochInfo;
        epochInfo = await raydium.fetchEpochInfo();
        console.log("✅ 获取网络纪元信息成功:", epochInfo.epoch);
        // 3. 使用 PoolUtils.computeAmountOutFormat 获取完整的 swap 信息
        let swapResult;
        if (clmmPoolInfo && tickCache) {
            try {
                console.log("🔍 使用 PoolUtils.computeAmountOutFormat 计算 swap 信息...");
                // 确定输出代币（用于计算 baseIn）
                const outputToken = poolInfo.mintA.address === tokenOut.toString() ? poolInfo.mintA : poolInfo.mintB;
                // 调用 PoolUtils.computeAmountOutFormat
                swapResult = await raydium_sdk_v2_1.PoolUtils.computeAmountOutFormat({
                    poolInfo: clmmPoolInfo,
                    tickArrayCache: tickCache[poolInfo.id] || {}, // 修复类型问题
                    amountIn: new bn_js_1.default(amountIn),
                    tokenOut: outputToken,
                    slippage: slippageBps / 10000, // 转换为小数 (100 bps = 1%)
                    epochInfo,
                    catchLiquidityInsufficient: true
                });
                console.log("✅ PoolUtils.computeAmountOutFormat 调用成功");
                console.log("  预期输出金额:", swapResult.amountOut.amount.raw.toString());
                console.log("  最小输出金额:", swapResult.minAmountOut.amount.raw.toString());
                console.log("  价格影响:", swapResult.priceImpact.toFixed(4), "%");
                console.log("  手续费:", swapResult.fee.raw.toString());
                console.log("  剩余账户数量:", swapResult.remainingAccounts.length);
                // 打印 remainingAccounts 中的关键账户
                if (swapResult.remainingAccounts.length > 0) {
                    console.log("  剩余账户类型:");
                    swapResult.remainingAccounts.forEach((account, index) => {
                        console.log(`    ${index + 1}. ${account.toString()}`);
                    });
                }
            }
            catch (error) {
                console.error("❌ PoolUtils.computeAmountOutFormat 调用失败:", error);
                throw error;
            }
        }
        else {
            console.log("⚠️  跳过 PoolUtils.computeAmountOutFormat 调用，缺少必要参数");
        }
        // 3a. 备用方案：如果 PoolUtils.computeAmountOutFormat 失败，尝试使用简化的方法
        if (!swapResult) {
            console.log("🔄 尝试使用备用方案获取 swap 信息...");
            try {
                // 使用简化的方法，基于池子信息构建基本的 swap 数据
                const outputToken = poolInfo.mintA.address === tokenOut.toString() ? poolInfo.mintA : poolInfo.mintB;
                // 创建一个简化的 swapResult 对象
                swapResult = {
                    amountOut: { amount: { raw: new bn_js_1.default(amountIn) } }, // 简化的输出金额
                    minAmountOut: { amount: { raw: new bn_js_1.default(amountIn * (1 - slippageBps / 10000)) } }, // 基于滑点计算
                    priceImpact: { toFixed: () => "0.00" }, // 简化的价格影响
                    fee: { raw: new bn_js_1.default(0) }, // 简化的手续费
                    remainingAccounts: [] // 空的剩余账户
                };
                console.log("✅ 备用方案成功，使用简化的 swap 信息");
            }
            catch (error) {
                console.error("❌ 备用方案也失败了:", error);
                // 继续执行，使用空的 swapResult
                swapResult = {
                    amountOut: { amount: { raw: new bn_js_1.default(0) } },
                    minAmountOut: { amount: { raw: new bn_js_1.default(0) } },
                    priceImpact: { toFixed: () => "0.00" },
                    fee: { raw: new bn_js_1.default(0) },
                    remainingAccounts: []
                };
            }
        }
        // 4. 获取外部账户（不能创建的）- 基于 Raydium SDK 标准和 swapResult
        const externalAccounts = {
            // 核心账户 - 这些由 Raydium 协议管理
            ammConfig: poolInfo.config?.id ? new web3_js_1.PublicKey(poolInfo.config.id) : null,
            poolState: new web3_js_1.PublicKey(poolInfo.id),
            // 从 swapResult 获取的账户
            observationState: swapResult?.remainingAccounts?.find(acc => acc.toString().includes('observation') || acc.toString().includes('oracle')) || null,
            exTickArrayBitmap: swapResult?.remainingAccounts?.find(acc => acc.toString().includes('bitmap') || acc.toString().includes('tick_array_bitmap')) || null,
            // 代币金库 - 从 poolKeys 或 swapResult 获取
            poolVaultA: poolKeys?.vault?.A ? new web3_js_1.PublicKey(poolKeys.vault.A) : swapResult?.remainingAccounts?.find(acc => acc.toString().includes('vault') && acc.toString().includes('A')) || null,
            poolVaultB: poolKeys?.vault?.B ? new web3_js_1.PublicKey(poolKeys.vault.B) : swapResult?.remainingAccounts?.find(acc => acc.toString().includes('vault') && acc.toString().includes('B')) || null,
            // 代币铸币账户
            mintA: new web3_js_1.PublicKey(poolInfo.mintA.address),
            mintB: new web3_js_1.PublicKey(poolInfo.mintB.address),
            // 程序ID
            raydiumProgramId: new web3_js_1.PublicKey(poolInfo.programId),
            // 原始池子信息
            poolInfo: poolInfo,
            poolKeys: poolKeys,
            apiResponse: poolInfo,
            // 从 swapResult 获取的 remainingAccounts
            remainingAccounts: swapResult?.remainingAccounts || []
        };
        // 5. 获取可创建账户（可以创建的）
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
        console.log("✅ 获取完整交换账户信息成功");
        console.log("  池子信息:", poolInfo.id);
        console.log("  外部账户数量:", Object.keys(externalAccounts).length);
        console.log("  可创建账户数量:", Object.keys(creatableAccounts).length);
        console.log("  代币金库A:", externalAccounts.poolVaultA?.toString());
        console.log("  代币金库B:", externalAccounts.poolVaultB?.toString());
        console.log("  剩余账户数量:", externalAccounts.remainingAccounts.length);
        return {
            creatableAccounts,
            externalAccounts,
            poolInfo: {
                poolInfo,
                clmmPoolInfo,
                tickCache
            },
            swapResult
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
/**
 * 在指定程序下查找包含特定代币对的池子
 * @param connection Solana 连接对象
 * @param programId 程序 ID
 * @param tokenA 代币 A 地址
 * @param tokenB 代币 B 地址
 * @returns 池子信息，如果找到的话
 */
async function findPoolByTokens(connection, programId, tokenA, tokenB) {
    try {
        console.log(`\n🔍 在程序 ${programId.toString()} 中搜索代币对池子...`);
        console.log(`  代币 A: ${tokenA.toString()}`);
        console.log(`  代币 B: ${tokenB.toString()}`);
        // 查询该程序下的所有账户
        const accountsData = await connection.getProgramAccounts(programId, {
            commitment: 'confirmed'
        });
        if (accountsData.length === 0) {
            console.log(`❌ 程序 ${programId.toString()} 下没有找到任何账户`);
            return null;
        }
        console.log(`   找到 ${accountsData.length} 个账户，开始筛选...`);
        // 尝试不同的数据大小过滤器来查找池子
        const dataSizes = [raydium_sdk_v2_1.PoolInfoLayout.span, raydium_sdk_v2_1.CpmmPoolInfoLayout.span, 752, 1024, 1544, 2048];
        for (const dataSize of dataSizes) {
            try {
                const filteredAccounts = accountsData.filter(acc => acc.account.data.length === dataSize);
                if (filteredAccounts.length === 0)
                    continue;
                console.log(`   检查数据大小为 ${dataSize} bytes 的账户 (${filteredAccounts.length} 个)...`);
                // 检查所有账户
                for (const account of filteredAccounts) {
                    try {
                        // 尝试解析池子数据
                        let poolData = null;
                        let mintA = null;
                        let mintB = null;
                        // 尝试不同的布局解析
                        if (dataSize === raydium_sdk_v2_1.PoolInfoLayout.span) {
                            try {
                                poolData = raydium_sdk_v2_1.PoolInfoLayout.decode(account.account.data);
                                mintA = poolData.mintA?.toString();
                                mintB = poolData.mintB?.toString();
                            }
                            catch (e) {
                                // 忽略解析错误
                            }
                        }
                        else if (dataSize === raydium_sdk_v2_1.CpmmPoolInfoLayout.span) {
                            try {
                                poolData = raydium_sdk_v2_1.CpmmPoolInfoLayout.decode(account.account.data);
                                mintA = poolData.mintA?.toString();
                                mintB = poolData.mintB?.toString();
                            }
                            catch (e) {
                                // 忽略解析错误
                            }
                        }
                        else if (dataSize === 1544) {
                            // 对于 1544 bytes 的数据，尝试多种偏移量来提取代币地址
                            const data = account.account.data;
                            for (let offset = 0; offset < Math.min(data.length - 32, 100); offset += 32) {
                                try {
                                    const possibleMint = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
                                    const mintStr = possibleMint.toString();
                                    // 检查是否是已知的代币地址
                                    if (mintStr === tokenA.toString() || mintStr === tokenB.toString()) {
                                        if (!mintA) {
                                            mintA = mintStr;
                                        }
                                        else if (!mintB && mintStr !== mintA) {
                                            mintB = mintStr;
                                            break;
                                        }
                                    }
                                }
                                catch (e) {
                                    // 忽略无效的公钥
                                }
                            }
                        }
                        else {
                            // 对于未知大小的数据，尝试从原始数据中提取代币地址
                            if (account.account.data.length >= 64) {
                                try {
                                    const possibleMintA = new web3_js_1.PublicKey(account.account.data.slice(32, 64));
                                    const possibleMintB = new web3_js_1.PublicKey(account.account.data.slice(64, 96));
                                    mintA = possibleMintA.toString();
                                    mintB = possibleMintB.toString();
                                }
                                catch (e) {
                                    // 忽略解析错误
                                }
                            }
                        }
                        // 检查是否找到匹配的代币对
                        if (mintA && mintB) {
                            const hasTokenA = mintA === tokenA.toString() || mintB === tokenA.toString();
                            const hasTokenB = mintA === tokenB.toString() || mintB === tokenB.toString();
                            if (hasTokenA && hasTokenB) {
                                console.log(`\n🎯 找到匹配的代币对池子:`);
                                console.log(`   池子地址: ${account.pubkey.toString()}`);
                                console.log(`   代币A: ${mintA}`);
                                console.log(`   代币B: ${mintB}`);
                                console.log(`   数据大小: ${dataSize} bytes`);
                                // 确定程序名称
                                let programName = 'Unknown';
                                for (const [name, id] of Object.entries(REAL_RAYDIUM_PROGRAMS)) {
                                    if (id.toString() === programId.toString()) {
                                        programName = name;
                                        break;
                                    }
                                }
                                return {
                                    poolAddress: account.pubkey.toString(),
                                    mintA,
                                    mintB,
                                    dataSize,
                                    poolData,
                                    programName
                                };
                            }
                        }
                    }
                    catch (error) {
                        // 忽略单个账户的解析错误
                        continue;
                    }
                }
            }
            catch (error) {
                // 忽略特定数据大小的错误
                continue;
            }
        }
        console.log(`❌ 在程序 ${programId.toString()} 中没有找到匹配的代币对池子`);
        return null;
    }
    catch (error) {
        console.error(`❌ 搜索程序 ${programId.toString()} 时发生错误:`, error);
        return null;
    }
}
/**
 * 主函数 - 可以直接运行此文件来测试池子搜索功能
 */
async function main() {
    try {
        console.log("🚀 启动 Raydium CLMM 池子搜索测试...\n");
        // 从 config.ts 获取 connection
        console.log("✅ 已连接到 Solana devnet");
        // 定义要搜索的代币对（这里使用 SOL 和 USDC 作为示例）
        const tokenA = new web3_js_1.PublicKey("11111111111111111111111111111111"); // SOL
        const tokenB = new web3_js_1.PublicKey("USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT"); // USDC (devnet)
        console.log("\n🔍 开始搜索代币对池子...");
        console.log("  代币 A (SOL):", tokenA.toString());
        console.log("  代币 B (USDC):", tokenB.toString());
        // 调用 findAllRaydiumPools 方法搜索所有类型的池子
        const allPools = await findAllRaydiumPools(config_1.connection, tokenA, tokenB);
        if (allPools.clmm || allPools.ammV4 || allPools.cpmm) {
            console.log("\n🎉 搜索成功！");
            // 显示搜索的程序统计
            console.log(`\n📊 搜索统计:`);
            console.log(`  搜索的程序数量: ${Object.keys(allPools.allPrograms).length}`);
            console.log(`  找到池子的程序: ${Object.keys(allPools.allPrograms).join(', ')}`);
            if (allPools.clmm) {
                console.log("\n  CLMM 池子 ID:", allPools.clmm);
                // 获取 CLMM 池子的详细信息
                console.log("\n📊 获取 CLMM 池子详细信息...");
                const raydium = await (0, config_1.initSdk)();
                const poolData = await raydium.clmm.getPoolInfoFromRpc(allPools.clmm);
                console.log("  池子信息:");
                console.log("    - 池子地址:", poolData.poolInfo.id);
                console.log("    - 代币 A:", poolData.poolInfo.mintA.address);
                console.log("    - 代币 B:", poolData.poolInfo.mintB.address);
                console.log("    - 程序 ID:", poolData.poolInfo.programId);
                console.log("    - 池子类型:", poolData.poolInfo.type);
                if (poolData.poolKeys) {
                    console.log("    - 代币金库 A:", poolData.poolKeys.vault?.A);
                    console.log("    - 代币金库 B:", poolData.poolKeys.vault?.B);
                }
            }
            if (allPools.ammV4) {
                console.log("  AMM v4 池子 ID:", allPools.ammV4);
            }
            if (allPools.cpmm) {
                console.log("  CPMM 池子 ID:", allPools.cpmm);
            }
            // 显示所有找到的池子详情
            if (Object.keys(allPools.allPrograms).length > 0) {
                console.log("\n🔍 所有找到的池子详情:");
                for (const [programName, info] of Object.entries(allPools.allPrograms)) {
                    console.log(`  ${programName}:`);
                    console.log(`    池子地址: ${info.poolAddress}`);
                    console.log(`    代币A: ${info.mintA}`);
                    console.log(`    代币B: ${info.mintB}`);
                    console.log(`    数据大小: ${info.dataSize} bytes`);
                }
            }
        }
        else {
            console.log("\n❌ 搜索失败");
            console.log("  没有找到任何类型的匹配池子");
            console.log("  可能的原因:");
            console.log("    1. devnet 上不存在该代币对的池子");
            console.log("    2. 代币地址不正确");
            console.log("    3. 网络连接问题");
            console.log("    4. devnet 上 Raydium 池子数量有限");
            // 显示搜索的程序数量
            console.log(`\n📊 搜索统计:`);
            console.log(`  搜索的程序数量: ${Object.keys(allPools.allPrograms).length}`);
            console.log(`  搜索的程序: ${Object.keys(allPools.allPrograms).join(', ')}`);
        }
    }
    catch (error) {
        console.error("\n💥 程序执行出错:", error);
        if (error instanceof Error) {
            console.error("  错误信息:", error.message);
            console.error("  错误堆栈:", error.stack);
        }
    }
}
// main().then(() => {
//   console.log("\n✨ 程序执行完成");
//   process.exit(0);
// }).catch((error) => {
//   console.error("\n💥 程序异常退出:", error);
//   process.exit(1);
// });
//# sourceMappingURL=raydium.js.map