"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.botKeypair = exports.adminKeypair = exports.user1Keypair = exports.VAULT_PDA = exports.GLOBAL_CONFIG_PDA = exports.TEST_ADDRESSES = void 0;
exports.generateGlobalConfigPDA = generateGlobalConfigPDA;
exports.generateVaultPDA = generateVaultPDA;
exports.initializeGlobalConfig = initializeGlobalConfig;
exports.createBalanceManager = createBalanceManager;
exports.userDeposit = userDeposit;
exports.userDepositSol = userDepositSol;
exports.userWithdraw = userWithdraw;
exports.userWithdrawSol = userWithdrawSol;
exports.getBalance = getBalance;
exports.setBot = setBot;
exports.setAdmin = setAdmin;
exports.sendTradeSignal = sendTradeSignal;
exports.serializeTradeSignalData = serializeTradeSignalData;
exports.getVaultInfo = getVaultInfo;
exports.getGlobalConfigInfo = getGlobalConfigInfo;
exports.verifyBalanceChange = verifyBalanceChange;
exports.testComplete = testComplete;
exports.testRaydiumSwapAccounts = testRaydiumSwapAccounts;
// Solana devnet 测试代码 - 更新版本匹配新的程序结构
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// 导入 Raydium 相关函数
const raydium_1 = require("./raydium");
// 程序 ID
const PROGRAM_ID = new web3_js_1.PublicKey("FFbZem3yLs4Pr4LoXJPuqFp7CJsDvaYj9xQEkYboTaoJ");
// 加载密钥对
const adminKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, 'admin-keypair.json'), 'utf8'))));
exports.adminKeypair = adminKeypair;
// 加载 user1 密钥对
const user1Keypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, 'user1-keypair.json'), 'utf8'))));
exports.user1Keypair = user1Keypair;
// 加载bot密钥对 - 用于交易信号
const botKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, 'bot-keypair.json'), 'utf8'))));
exports.botKeypair = botKeypair;
// 全局变量保存地址
let GLOBAL_CONFIG_PDA = null;
exports.GLOBAL_CONFIG_PDA = GLOBAL_CONFIG_PDA;
let VAULT_PDA = null;
exports.VAULT_PDA = VAULT_PDA;
console.log("程序 ID 创建成功:", PROGRAM_ID.toString());
// 测试地址
const TEST_ADDRESSES = {
    bot: botKeypair.publicKey, // 使用动态生成的bot地址
    testToken: new web3_js_1.PublicKey("11111111111111111111111111111111"), // 原生 SOL (系统程序 ID)
    usdcDevnet: new web3_js_1.PublicKey("USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT") // Devnet dUSDC 地址
};
exports.TEST_ADDRESSES = TEST_ADDRESSES;
// 设置连接 - 尝试多个 RPC 端点
const RPC_ENDPOINTS = [
    "https://api.devnet.solana.com",
    "https://devnet.solana.com",
    "https://solana-devnet.g.alchemy.com/v2/demo",
    "https://rpc.ankr.com/solana_devnet",
    "https://devnet.genesysgo.net"
];
// 尝试连接不同的 RPC 端点
async function initializeConnection() {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            console.log(`尝试连接: ${endpoint}`);
            const testConnection = new web3_js_1.Connection(endpoint, "confirmed");
            const version = await testConnection.getVersion();
            console.log(`✅ 连接成功: ${endpoint}`);
            console.log(`  Solana 版本:`, version);
            return testConnection;
        }
        catch (error) {
            console.log(`❌ 连接失败: ${endpoint}`);
            console.log(`  错误:`, error.message);
        }
    }
    throw new Error("所有 RPC 端点都无法连接");
}
// 检查网络连接
async function checkConnection() {
    try {
        const connection = await initializeConnection();
        console.log("✅ 网络连接成功");
        return connection;
    }
    catch (error) {
        console.error("❌ 网络连接失败:", error);
        console.log("请检查网络连接或尝试使用其他 RPC 端点");
        return null;
    }
}
console.log("钱包创建成功");
console.log("钱包地址:", adminKeypair.publicKey.toString());
console.log("🔧 初始化测试环境...");
console.log("程序 ID:", PROGRAM_ID.toString());
console.log("钱包地址:", adminKeypair.publicKey.toString());
console.log("网络: devnet");
// 生成全局配置 PDA
function generateGlobalConfigPDA() {
    const [pda, bump] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("global_config")], PROGRAM_ID);
    console.log("📝 生成全局配置 PDA:");
    console.log("  PDA 地址:", pda.toString());
    console.log("  Bump:", bump);
    return [pda, bump];
}
// 生成金库 PDA
function generateVaultPDA(userAddress) {
    const [pda, bump] = web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("vault"),
        userAddress.toBuffer()
    ], PROGRAM_ID);
    console.log("📝 生成金库 PDA:");
    console.log("  用户地址:", userAddress.toString());
    console.log("  PDA 地址:", pda.toString());
    console.log("  Bump:", bump);
    return [pda, bump];
}
// 生成Anchor指令discriminator
function getInstructionDiscriminator(instructionName) {
    // 将camelCase转换为snake_case 
    const snakeCaseName = instructionName.replace(/([A-Z])/g, '_$1').toLowerCase();
    const preimage = `global:${snakeCaseName}`;
    const hash = require('crypto').createHash('sha256').update(preimage).digest();
    return hash.slice(0, 8);
}
// 生成sendTradeSignal指令的discriminator
function getSendTradeSignalDiscriminator() {
    // 合约中的指令名称是 send_trade_signal
    const preimage = `global:send_trade_signal`;
    const hash = require('crypto').createHash('sha256').update(preimage).digest();
    return hash.slice(0, 8);
}
// 序列化指令数据的辅助函数 - 使用Anchor标准格式
function serializeInstructionData(instructionName, ...args) {
    // Anchor指令格式: [指令标识(8字节)] + [参数数据]
    const discriminator = getInstructionDiscriminator(instructionName);
    let data = Buffer.from(discriminator);
    // 序列化参数
    for (const arg of args) {
        if (arg instanceof web3_js_1.PublicKey) {
            const pubkeyBuffer = arg.toBuffer();
            const newData = Buffer.alloc(data.length + pubkeyBuffer.length);
            data.copy(newData, 0);
            pubkeyBuffer.copy(newData, data.length);
            data = newData;
        }
        else if (typeof arg === 'number' || typeof arg === 'bigint') {
            // 对于数字，转换为8字节的little-endian格式
            const numBuffer = Buffer.alloc(8);
            numBuffer.writeBigUInt64LE(BigInt(arg), 0);
            const newData = Buffer.alloc(data.length + numBuffer.length);
            data.copy(newData, 0);
            numBuffer.copy(newData, data.length);
            data = newData;
        }
    }
    return data;
}
// 检查账户是否已存在
async function checkAccountExists(accountPda) {
    try {
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const accountInfo = await connection.getAccountInfo(accountPda);
        return accountInfo !== null;
    }
    catch (error) {
        console.error("❌ 检查账户存在性失败:", error);
        return false;
    }
}
// 1. 初始化全局配置
async function initializeGlobalConfig(botAddress) {
    try {
        console.log("\n🚀 开始初始化全局配置...");
        // 检查网络连接
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        // 生成全局配置 PDA
        const [globalConfigPda, globalConfigBump] = generateGlobalConfigPDA();
        // 检查全局配置是否已存在
        const configExists = await checkAccountExists(globalConfigPda);
        if (configExists) {
            console.log("⚠️  全局配置已存在，跳过初始化");
            console.log("  全局配置地址:", globalConfigPda.toString());
            // 保存全局配置地址到全局变量
            exports.GLOBAL_CONFIG_PDA = GLOBAL_CONFIG_PDA = globalConfigPda;
            return { globalConfigPda, tx: "已存在，无需初始化" };
        }
        console.log("📋 初始化参数:");
        console.log("  机器人地址:", botAddress.toString());
        // 创建初始化全局配置指令
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: globalConfigPda, isSigner: false, isWritable: true },
                { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: serializeInstructionData("initializeGlobalConfig", botAddress),
        })), [adminKeypair]);
        console.log("✅ 全局配置初始化成功!");
        console.log("  交易签名:", tx);
        console.log("  全局配置地址:", globalConfigPda.toString());
        // 保存全局配置地址到全局变量
        exports.GLOBAL_CONFIG_PDA = GLOBAL_CONFIG_PDA = globalConfigPda;
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return { globalConfigPda, tx };
    }
    catch (error) {
        console.error("❌ 初始化全局配置失败:", error);
        throw error;
    }
}
// 2. 创建余额管理器（金库）
async function createBalanceManager(globalConfigPda, userKeypair = adminKeypair) {
    try {
        console.log("\n🏦 开始创建余额管理器...");
        console.log("  为用户创建金库:", userKeypair.publicKey.toString());
        // 检查网络连接
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        // 生成金库 PDA
        const [vaultPda, vaultBump] = generateVaultPDA(userKeypair.publicKey);
        // 检查金库是否已存在
        const vaultExists = await checkAccountExists(vaultPda);
        if (vaultExists) {
            console.log("⚠️  金库已存在，跳过创建");
            console.log("  金库地址:", vaultPda.toString());
            // 保存金库地址到全局变量
            exports.VAULT_PDA = VAULT_PDA = vaultPda;
            return { vaultPda, tx: "已存在，无需创建" };
        }
        console.log("📋 创建参数:");
        console.log("  用户地址:", userKeypair.publicKey.toString());
        console.log("  全局配置地址:", globalConfigPda.toString());
        // 创建余额管理器指令
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: globalConfigPda, isSigner: false, isWritable: false },
                { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: serializeInstructionData("createBalanceManager"),
        })), [userKeypair]);
        console.log("✅ 余额管理器创建成功!");
        console.log("  交易签名:", tx);
        console.log("  金库地址:", vaultPda.toString());
        // 保存金库地址到全局变量
        exports.VAULT_PDA = VAULT_PDA = vaultPda;
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return { vaultPda, tx };
    }
    catch (error) {
        console.error("❌ 创建余额管理器失败:", error);
        throw error;
    }
}
// 3. 用户存款 (SPL 代币)
async function userDeposit(vaultPda, mint, amount, userKeypair = user1Keypair // 默认使用 user1，可以传入其他用户
) {
    try {
        console.log("\n💰 用户存款...");
        console.log("  用户地址:", userKeypair.publicKey.toString());
        console.log("  代币地址:", mint.toString());
        console.log("  存款金额:", amount);
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: mint, isSigner: false, isWritable: false },
            ],
            data: serializeInstructionData("userDeposit", amount),
        })), [userKeypair]);
        console.log("✅ 存款成功!");
        console.log("  交易签名:", tx);
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ 存款失败:", error);
        throw error;
    }
}
// 3a. 用户存入原生 SOL
async function userDepositSol(vaultPda, amount, userKeypair = user1Keypair // 默认使用 user1，可以传入其他用户
) {
    try {
        console.log("\n💰 用户 SOL 存款...");
        console.log("  用户地址:", userKeypair.publicKey.toString());
        console.log("  存款金额:", amount.toLocaleString(), "lamports");
        console.log("  存款金额:", (amount / 1000000000), "SOL");
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: serializeInstructionData("userDepositSol", amount),
        })), [userKeypair]);
        console.log("✅ SOL 存款成功!");
        console.log("  交易签名:", tx);
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ SOL 存款失败:", error);
        throw error;
    }
}
// 4. 用户取款 (SPL 代币)
async function userWithdraw(vaultPda, mint, amount, userKeypair = user1Keypair // 默认使用 user1，可以传入其他用户
) {
    try {
        console.log("\n💸 用户取款...");
        console.log("  用户地址:", userKeypair.publicKey.toString());
        console.log("  代币地址:", mint.toString());
        console.log("  取款金额:", amount);
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: mint, isSigner: false, isWritable: false },
            ],
            data: serializeInstructionData("userWithdraw", amount),
        })), [userKeypair]);
        console.log("✅ 取款成功!");
        console.log("  交易签名:", tx);
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ 取款失败:", error);
        throw error;
    }
}
// 4a. 用户取出原生 SOL
async function userWithdrawSol(vaultPda, amount, userKeypair = user1Keypair // 默认使用 user1，可以传入其他用户
) {
    try {
        console.log("\n💸 用户 SOL 取款...");
        console.log("  用户地址:", userKeypair.publicKey.toString());
        console.log("  取款金额:", amount.toLocaleString(), "lamports");
        console.log("  取款金额:", (amount / 1000000000), "SOL");
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: vaultPda, isSigner: false, isWritable: true },
                { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: serializeInstructionData("userWithdrawSol", amount),
        })), [userKeypair]);
        console.log("✅ SOL 取款成功!");
        console.log("  交易签名:", tx);
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ SOL 取款失败:", error);
        throw error;
    }
}
// 5. 获取余额（View函数）
async function getBalance(vaultPda, token) {
    try {
        console.log("\n📊 查询余额...");
        console.log("  代币地址:", token.toString());
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        // 注意：getBalance 是一个 view 函数，不会修改状态
        // 我们需要从金库账户数据中解析余额
        const vaultAccount = await connection.getAccountInfo(vaultPda);
        if (!vaultAccount) {
            console.log("⚠️  金库账户不存在");
            return new anchor_1.BN(0);
        }
        console.log("✅ 获取金库账户信息成功");
        console.log("  账户数据长度:", vaultAccount.data.length);
        console.log("  账户所有者:", vaultAccount.owner.toString());
        // 解析账户数据
        const vaultData = parsePersonalVaultAccount(vaultAccount.data);
        if (!vaultData) {
            console.log("⚠️  账户数据解析失败");
            return new anchor_1.BN(0);
        }
        console.log("✅ 账户数据解析成功");
        console.log("  投资者:", vaultData.investor);
        console.log("  已初始化:", vaultData.isInitialized);
        console.log("  代币余额数量:", vaultData.balances.length);
        // 查找特定代币的余额
        const tokenStr = token.toString();
        const balanceEntry = vaultData.balances.find((balance) => balance.token === tokenStr);
        if (balanceEntry) {
            const balance = new anchor_1.BN(balanceEntry.amount);
            console.log("✅ 找到代币余额:", balance.toNumber().toLocaleString(), "lamports (" + (balance.toNumber() / 1000000000) + " SOL)");
            return balance;
        }
        else {
            console.log("⚠️  未找到代币余额，返回0");
            return new anchor_1.BN(0);
        }
    }
    catch (error) {
        console.error("❌ 查询余额失败:", error);
        throw error;
    }
}
// 6. 设置机器人地址
async function setBot(globalConfigPda, newBotAddress) {
    try {
        console.log("\n🤖 设置机器人地址...");
        console.log("  新机器人地址:", newBotAddress.toString());
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: globalConfigPda, isSigner: false, isWritable: true },
                { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
            ],
            data: serializeInstructionData("setBot", newBotAddress),
        })), [adminKeypair]);
        console.log("✅ 机器人地址设置成功!");
        console.log("  交易签名:", tx);
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ 设置机器人失败:", error);
        throw error;
    }
}
// 7. 设置管理员
async function setAdmin(globalConfigPda, newAdmin) {
    try {
        console.log("\n👤 设置管理员...");
        console.log("  新管理员地址:", newAdmin.toString());
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const tx = await connection.sendTransaction(new web3_js_1.Transaction().add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: globalConfigPda, isSigner: false, isWritable: true },
                { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
            ],
            data: serializeInstructionData("setAdmin", newAdmin),
        })), [adminKeypair]);
        console.log("✅ 管理员设置成功!");
        console.log("  交易签名:", tx);
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ 设置管理员失败:", error);
        throw error;
    }
}
// 8. 发送交易信号 
async function sendTradeSignal(vaultPda, tokenIn, tokenOut, amountIn, slippageBps, signerKeypair = adminKeypair // 默认使用管理员，也可以传入机器人
) {
    try {
        console.log("\n🔄 发送交易信号...");
        console.log("  调用者:", signerKeypair.publicKey.toString());
        console.log("  输入代币:", tokenIn.toString());
        console.log("  输出代币:", tokenOut.toString());
        console.log("  输入金额:", amountIn.toLocaleString(), "lamports");
        console.log("  滑点基点:", slippageBps, "bps");
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        // 计算 globalConfigPda
        const [globalConfigPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("global_config")], PROGRAM_ID);
        console.log("  全局配置 PDA:", globalConfigPda.toString());
        // 从 vaultPda 推导出用户地址
        // vaultPda 的种子是 ["vault", user.key()]
        // 我们需要从金库账户数据中获取用户地址
        const vaultAccount = await connection.getAccountInfo(vaultPda);
        if (!vaultAccount) {
            throw new Error("金库账户不存在");
        }
        // 解析金库账户数据获取用户地址
        const vaultData = parsePersonalVaultAccount(vaultAccount.data);
        if (!vaultData) {
            throw new Error("无法解析金库账户数据");
        }
        const userAddress = new web3_js_1.PublicKey(vaultData.investor);
        console.log("  金库所有者:", userAddress.toString());
        const transaction = new web3_js_1.Transaction()
            .add(
        // 增加计算单元预算到 1,000,000 CU
        web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }))
            .add(
        // 设置计算单元价格（可选，提高交易优先级）
        web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }))
            .add(new web3_js_1.TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                // 根据最新的 SendTradeSignal 结构体定义，需要 4 个账户
                { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: false }, // executor (管理员或Bot)
                { pubkey: userAddress, isSigner: false, isWritable: false }, // user (金库所有者，用于账户推导)
                { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault (目标金库)
                { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // global_config
            ],
            data: serializeTradeSignalData(tokenIn, tokenOut, amountIn, slippageBps),
        }));
        const tx = await connection.sendTransaction(transaction, [signerKeypair]);
        console.log("✅ 交易信号发送成功!");
        console.log("  交易签名:", tx);
        // 打印交易查看链接
        console.log("\n🔗 交易查看链接:");
        console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return tx;
    }
    catch (error) {
        console.error("❌ 发送交易信号失败:", error);
        throw error;
    }
}
// 序列化交易信号指令数据的辅助函数
function serializeTradeSignalData(tokenIn, tokenOut, amountIn, slippageBps) {
    const discriminator = getSendTradeSignalDiscriminator();
    let data = Buffer.from(discriminator);
    // 添加 tokenIn (32字节)
    const tokenInBuffer = tokenIn.toBuffer();
    let newData = Buffer.alloc(data.length + tokenInBuffer.length);
    data.copy(newData, 0);
    tokenInBuffer.copy(newData, data.length);
    data = newData;
    // 添加 tokenOut (32字节)
    const tokenOutBuffer = tokenOut.toBuffer();
    newData = Buffer.alloc(data.length + tokenOutBuffer.length);
    data.copy(newData, 0);
    tokenOutBuffer.copy(newData, data.length);
    data = newData;
    // 添加 amountIn (8字节)
    const amountInBuffer = Buffer.alloc(8);
    amountInBuffer.writeBigUInt64LE(BigInt(amountIn), 0);
    newData = Buffer.alloc(data.length + amountInBuffer.length);
    data.copy(newData, 0);
    amountInBuffer.copy(newData, data.length);
    data = newData;
    // 添加 slippageBps (2字节)
    const slippageBpsBuffer = Buffer.alloc(2);
    slippageBpsBuffer.writeUInt16LE(slippageBps, 0);
    newData = Buffer.alloc(data.length + slippageBpsBuffer.length);
    data.copy(newData, 0);
    slippageBpsBuffer.copy(newData, data.length);
    data = newData;
    return data;
}
// 解析PersonalVault账户数据的辅助函数（更新版本）
function parsePersonalVaultAccount(data) {
    try {
        // 跳过8字节的账户标识符
        let offset = 8;
        // 读取investor (32字节)
        const investor = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        // 读取is_initialized (1字节)
        const isInitialized = data[offset] === 1;
        offset += 1;
        // 读取is_locked (1字节) - 新增字段
        const isLocked = data[offset] === 1;
        offset += 1;
        // 读取balances数组长度 (4字节)
        const balancesLength = data.readUInt32LE(offset);
        offset += 4;
        // 读取balances数组
        const balances = [];
        for (let i = 0; i < balancesLength; i++) {
            // 每个TokenBalance: token(32字节) + amount(8字节)
            const token = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
            offset += 32;
            const amount = data.readBigUInt64LE(offset);
            offset += 8;
            balances.push({
                token: token.toString(),
                amount: amount.toString()
            });
        }
        // 读取bump (1字节) - 在数组数据之后
        const bump = data[offset];
        offset += 1;
        return {
            investor: investor.toString(),
            isInitialized,
            isLocked,
            balances,
            bump
        };
    }
    catch (error) {
        console.error("❌ 解析账户数据失败:", error);
        return null;
    }
}
// 解析GlobalConfig账户数据的辅助函数
function parseGlobalConfigAccount(data) {
    try {
        // 跳过8字节的账户标识符
        let offset = 8;
        // 读取admin (32字节)
        const admin = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        // 读取bot (32字节)
        const bot = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        // 读取is_initialized (1字节)
        const isInitialized = data[offset] === 1;
        offset += 1;
        return {
            admin: admin.toString(),
            bot: bot.toString(),
            isInitialized
        };
    }
    catch (error) {
        console.error("❌ 解析全局配置数据失败:", error);
        return null;
    }
}
// 获取金库信息函数（更新版本）
async function getVaultInfo(vaultPda) {
    try {
        console.log("\n🔍 获取金库信息...");
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const vaultAccount = await connection.getAccountInfo(vaultPda);
        if (!vaultAccount) {
            console.log("⚠️  金库账户不存在");
            return null;
        }
        console.log("✅ 金库信息:");
        console.log("  账户所有者:", vaultAccount.owner.toString());
        console.log("  账户数据长度:", vaultAccount.data.length);
        // 解析账户数据
        const vaultData = parsePersonalVaultAccount(vaultAccount.data);
        if (vaultData) {
            console.log("  投资者:", vaultData.investor);
            console.log("  已初始化:", vaultData.isInitialized);
            console.log("  代币余额数量:", vaultData.balances.length);
            // 显示所有代币余额
            if (vaultData.balances.length > 0) {
                console.log("  代币余额详情:");
                vaultData.balances.forEach((balance, index) => {
                    const amount = new anchor_1.BN(balance.amount);
                    console.log(`    ${index + 1}. 代币: ${balance.token}, 余额: ${amount.toNumber().toLocaleString()} lamports (${(amount.toNumber() / 1000000000)} SOL)`);
                });
            }
            else {
                console.log("  暂无代币余额");
            }
        }
        else {
            console.log("⚠️  账户数据解析失败");
        }
        return vaultAccount;
    }
    catch (error) {
        console.error("❌ 获取金库信息失败:", error);
        throw error;
    }
}
// 获取全局配置信息函数
async function getGlobalConfigInfo(globalConfigPda) {
    try {
        console.log("\n🔍 获取全局配置信息...");
        const connection = await checkConnection();
        if (!connection) {
            throw new Error("网络连接失败");
        }
        const configAccount = await connection.getAccountInfo(globalConfigPda);
        if (!configAccount) {
            console.log("⚠️  全局配置账户不存在");
            return null;
        }
        console.log("✅ 全局配置信息:");
        console.log("  账户所有者:", configAccount.owner.toString());
        console.log("  账户数据长度:", configAccount.data.length);
        // 解析账户数据
        const configData = parseGlobalConfigAccount(configAccount.data);
        if (configData) {
            console.log("  管理员:", configData.admin);
            console.log("  机器人:", configData.bot);
            console.log("  已初始化:", configData.isInitialized);
        }
        else {
            console.log("⚠️  配置数据解析失败");
        }
        return configAccount;
    }
    catch (error) {
        console.error("❌ 获取全局配置信息失败:", error);
        throw error;
    }
}
// 验证余额变化函数 - 需要在操作前后分别调用
async function verifyBalanceChange(vaultPda, tokenMint, balanceBefore, expectedChange, operation) {
    try {
        console.log(`\n🔍 验证${operation}后的余额变化...`);
        console.log(`  操作前余额: ${balanceBefore.toNumber().toLocaleString()} lamports (${(balanceBefore.toNumber() / 1000000000)} SOL)`);
        // 等待一段时间确保交易确认
        await new Promise(resolve => setTimeout(resolve, 2000));
        const balanceAfter = await getBalance(vaultPda, tokenMint);
        console.log(`  操作后余额: ${balanceAfter.toNumber().toLocaleString()} lamports (${(balanceAfter.toNumber() / 1000000000)} SOL)`);
        const actualChange = balanceAfter.sub(balanceBefore).toNumber();
        console.log(`  实际变化: ${actualChange.toLocaleString()} lamports (${(actualChange / 1000000000)} SOL)`);
        console.log(`  预期变化: ${expectedChange.toLocaleString()} lamports (${(expectedChange / 1000000000)} SOL)`);
        const isCorrect = actualChange === expectedChange;
        if (isCorrect) {
            console.log(`✅ ${operation}余额变化验证成功`);
        }
        else {
            console.log(`❌ ${operation}余额变化验证失败`);
        }
        return isCorrect;
    }
    catch (error) {
        console.error(`❌ 验证${operation}余额变化失败:`, error);
        return false;
    }
}
// 主测试函数
async function testComplete() {
    try {
        console.log("🎯 开始完整测试流程...\n");
        console.log("=== 步骤 1: 初始化全局配置 ===");
        const { globalConfigPda } = await initializeGlobalConfig(TEST_ADDRESSES.bot);
        console.log("\n✅ 全局配置初始化完成!");
        console.log("全局配置地址:", globalConfigPda.toString());
        // 获取全局配置信息
        await getGlobalConfigInfo(globalConfigPda);
        console.log("\n=== 步骤 2: 创建余额管理器（为 user1） ===");
        console.log("User1 地址:", user1Keypair.publicKey.toString());
        const { vaultPda } = await createBalanceManager(globalConfigPda, user1Keypair);
        console.log("\n✅ 余额管理器创建完成!");
        console.log("金库地址:", vaultPda.toString());
        // 获取初始金库信息
        await getVaultInfo(vaultPda);
        console.log("\n=== 步骤 3: SOL 存款测试 ===");
        try {
            const testToken = TEST_ADDRESSES.testToken; // 原生 SOL (系统程序 ID)
            const depositAmount = 200000000; // 0.2 SOL
            console.log("💰 测试 SOL 存款功能...");
            console.log("  代币标识符:", testToken.toString());
            console.log("  存款金额:", depositAmount.toLocaleString(), "lamports");
            console.log("  存款金额:", (depositAmount / 1000000000), "SOL");
            // 记录操作前余额
            const balanceBeforeDeposit = await getBalance(vaultPda, testToken);
            const depositTx = await userDepositSol(vaultPda, depositAmount, user1Keypair);
            console.log("✅ SOL 存款测试成功");
            console.log("  交易签名:", depositTx);
            // 验证存款后的余额变化
            await verifyBalanceChange(vaultPda, testToken, balanceBeforeDeposit, depositAmount, "SOL 存款");
        }
        catch (error) {
            console.error("❌ SOL 存款测试失败:", error);
        }
        console.log("\n=== 步骤 5: 取款测试 ===");
        try {
            const testToken = TEST_ADDRESSES.testToken;
            const withdrawAmount = 100000000; // 0.1 SOL
            console.log("💸 测试取款功能...");
            console.log("  代币地址:", testToken.toString());
            console.log("  取款金额:", withdrawAmount.toLocaleString(), "lamports");
            // 记录操作前余额
            const balanceBeforeWithdraw = await getBalance(vaultPda, testToken);
            // 根据代币类型选择正确的取款函数
            let withdrawTx;
            if (testToken.equals(web3_js_1.SystemProgram.programId)) {
                // 原生 SOL 取款
                withdrawTx = await userWithdrawSol(vaultPda, withdrawAmount, user1Keypair);
            }
            else {
                // SPL Token 取款
                withdrawTx = await userWithdraw(vaultPda, testToken, withdrawAmount, user1Keypair);
            }
            console.log("✅ 取款测试成功");
            console.log("  交易签名:", withdrawTx);
            // 验证取款后的余额变化 (取款是负数变化)
            await verifyBalanceChange(vaultPda, testToken, balanceBeforeWithdraw, -withdrawAmount, "取款");
        }
        catch (error) {
            console.error("❌ 取款测试失败:", error);
        }
        console.log("\n=== 步骤 6: 交易信号测试 ===");
        // 6a. 机器人权限测试
        try {
            console.log("\n🤖 测试机器人权限调用交易信号...");
            const tokenIn = TEST_ADDRESSES.testToken; // SOL 作为输入代币
            const tokenOut = TEST_ADDRESSES.usdcDevnet; // USDC Devnet 作为输出代币
            const amountIn = 100000000; // 0.1 SOL
            const slippageBps = 300; // 3% 滑点 (300 基点)
            console.log("使用机器人身份调用交易信号...");
            const botTradeTx = await sendTradeSignal(vaultPda, tokenIn, tokenOut, amountIn, slippageBps, botKeypair // 使用机器人密钥对
            );
            console.log("✅ 机器人交易信号测试成功");
            console.log("  交易签名:", botTradeTx);
        }
        catch (error) {
            console.error("❌ 机器人交易信号测试失败:", error);
        }
        // 6b. 管理员权限测试
        // try {
        //   console.log("\n👨‍💼 测试管理员权限调用交易信号...");
        //   const tokenIn = TEST_ADDRESSES.usdcDevnet; // USDC Devnet 作为输入代币
        //   const tokenOut = TEST_ADDRESSES.testToken; // SOL 作为输出代币
        //   const amountIn = 1000000; // 1 USDC
        //   const slippageBps = 250; // 2.5% 滑点 (250 基点)
        //   console.log("  使用管理员身份调用交易信号...");
        //   const adminTradeTx = await sendTradeSignal(
        //     vaultPda,
        //     tokenIn,
        //     tokenOut,
        //     amountIn,
        //     slippageBps,
        //     walletKeypair // 使用管理员密钥对
        //   );
        //   console.log("✅ 管理员交易信号测试成功");
        //   console.log("  交易签名:", adminTradeTx);
        // } catch (error) {
        //   console.error("❌ 管理员交易信号测试失败:", error);
        // }
        // 6c. 无权限用户测试 (应该失败)
        // try {
        //   console.log("\n🚫 测试无权限用户调用交易信号 (应该失败)...");
        //   const tokenIn = TEST_ADDRESSES.testToken;
        //   const tokenOut = TEST_ADDRESSES.usdcDevnet; // USDC Devnet
        //   const amountIn = 100000000; // 0.1 SOL
        //   const slippageBps = 300; // 3% 滑点 (300 基点)
        //   console.log("  使用普通用户身份调用交易信号 (应该失败)...");
        //   const unauthorizedTradeTx = await sendTradeSignal(
        //     vaultPda,
        //     tokenIn,
        //     tokenOut,
        //     amountIn,
        //     slippageBps,
        //     user1Keypair // 使用普通用户密钥对
        //   );
        //   console.log("⚠️ 无权限用户交易信号测试意外成功 - 这可能是个问题!");
        //   console.log("  交易签名:", unauthorizedTradeTx);
        // } catch (error) {
        //   console.log("✅ 无权限用户交易信号测试正确失败 (符合预期)");
        //   console.log("  错误信息:", error);
        // }
        // // === 步骤 7: 设置机器人测试 ===
        // console.log("\n=== 步骤 7: 设置机器人测试 ===");
        // try {
        //   const newBotAddress = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        //   console.log("🤖 测试设置机器人功能...");
        //   console.log("  新机器人地址:", newBotAddress.toString());
        //   const setBotTx = await setBot(globalConfigPda, newBotAddress);
        //   console.log("✅ 设置机器人测试成功");
        //   console.log("  交易签名:", setBotTx);
        // } catch (error) {
        //   console.error("❌ 设置机器人测试失败:", error);
        // }
        // console.log("\n🎉 所有测试完成!");
        // console.log("📋 测试总结:");
        // console.log("  ✅ 全局配置初始化");
        // console.log("  ✅ 余额管理器创建");
        // console.log("  ✅ 用户 SOL 存款");
        // console.log("  ✅ 余额查询");
        // console.log("  ✅ 用户 SOL 取款");
        // console.log("  ✅ 交易信号测试 (机器人权限)");
        // console.log("  ✅ 交易信号测试 (管理员权限)");
        // console.log("  ✅ 交易信号测试 (权限验证)");
    }
    catch (error) {
        console.error("❌ 测试流程失败:", error);
    }
}
// 新增：测试 Raydium 交换账户信息查询
async function testRaydiumSwapAccounts() {
    try {
        console.log("🎯 开始测试 Raydium 交换账户信息查询...\n");
        const tokenIn = TEST_ADDRESSES.testToken; // SOL
        const tokenOut = TEST_ADDRESSES.usdcDevnet; // USDC Devnet
        const amountIn = 100000000; // 0.1 SOL
        const amountOutMinimum = 95000000; // 0.095 SOL (5% 滑点)
        const slippageBps = 500; // 5% 滑点
        const devnet_sol_usdc_poolId = "FXAXqgjNK6JVzVV2frumKTEuxC8hTEUhVTJTRhMMwLmM";
        // 所有详细的日志打印都在该方法内部完成
        await (0, raydium_1.getCompleteRaydiumSwapAccounts)(tokenIn, tokenOut, amountIn, amountOutMinimum, slippageBps, devnet_sol_usdc_poolId, // 传入找到的池子 ID
        'devnet');
        console.log("\n🎉 Raydium 交换账户信息查询测试完成!");
    }
    catch (error) {
        console.error("❌ Raydium 交换账户信息查询测试失败:", error);
    }
}
// 注释掉原来的测试函数调用
// testComplete();
// 运行新的 Raydium 测试函数
testRaydiumSwapAccounts();
//# sourceMappingURL=test.js.map