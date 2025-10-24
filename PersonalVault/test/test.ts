// Solana devnet 测试代码 - 更新版本匹配新的程序结构
import { Connection, PublicKey, SystemProgram, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createInitializeAccountInstruction, createCloseAccountInstruction } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// 导入共享常量
import { PROGRAM_ID, TEST_ADDRESSES, RPC_ENDPOINTS, KEYPAIRS, RAYDIUM_PROGRAMS } from './raydium/constants';

// 导入 Raydium 相关函数
import {
  build_devnet_raydium_clmm_accountInfo
} from './raydium/raydium';

// 导入事件日志解析函数
import {
  parseBalanceManagerCreatedEventLog,
  parseUserDepositEventLog,
  parseUserWithdrawEventLog
} from './raydium/event_log';

// 获取正确的文件路径
function getFilePath(filename: string): string {
  // 尝试多个可能的路径
  const possiblePaths = [
    path.join(__dirname, filename),                    // 当前目录
    path.join(__dirname, '..', 'test', filename),     // 上级目录的test文件夹
    path.join(process.cwd(), 'test', filename),        // 工作目录的test文件夹
    path.join(process.cwd(), filename)                 // 工作目录
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      console.log(`✅ 找到文件: ${filePath}`);
      return filePath;
    }
  }

  throw new Error(`找不到文件: ${filename}。尝试的路径: ${possiblePaths.join(', ')}`);
}

// 使用共享常量中的密钥对
const { admin: adminKeypair, user1: user1Keypair, user2: user2Keypair, bot: botKeypair } = KEYPAIRS;

// 全局变量保存地址
let GLOBAL_CONFIG_PDA: PublicKey | null = null;
let VAULT_PDA: PublicKey | null = null;

console.log("程序 ID 创建成功:", PROGRAM_ID.toString());

// 扩展测试地址，添加bot地址
const TEST_ADDRESSES_WITH_BOT = {
  ...TEST_ADDRESSES,
  bot: botKeypair.publicKey, // 使用动态生成的bot地址
};

// 尝试连接不同的 RPC 端点
async function initializeConnection(): Promise<Connection> {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      console.log(`尝试连接: ${endpoint}`);
      const testConnection = new Connection(endpoint, "confirmed");
      const version = await testConnection.getVersion();
      console.log(`✅ 连接成功: ${endpoint}`);
      console.log(`  Solana 版本:`, version);
      return testConnection;
    } catch (error: any) {
      console.log(`❌ 连接失败: ${endpoint}`);
      console.log(`  错误:`, error.message);
    }
  }
  throw new Error("所有 RPC 端点都无法连接");
}

// 检查网络连接
async function checkConnection(): Promise<Connection | null> {
  try {
    const connection = await initializeConnection();
    console.log("✅ 网络连接成功");
    return connection;
  } catch (error) {
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
function generateGlobalConfigPDA(): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    PROGRAM_ID
  );

  console.log("📝 生成全局配置 PDA:");
  console.log("  PDA 地址:", pda.toString());
  console.log("  Bump:", bump);

  return [pda, bump];
}

// 生成金库 PDA
function generateVaultPDA(userAddress: PublicKey): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault"),
      userAddress.toBuffer()
    ],
    PROGRAM_ID
  );

  console.log("📝 生成金库 PDA:");
  console.log("  用户地址:", userAddress.toString());
  console.log("  PDA 地址:", pda.toString());
  console.log("  Bump:", bump);

  return [pda, bump];
}

// 生成Anchor指令discriminator
function getInstructionDiscriminator(instructionName: string): Buffer {
  // 将camelCase转换为snake_case 
  const snakeCaseName = instructionName.replace(/([A-Z])/g, '_$1').toLowerCase();
  const preimage = `global:${snakeCaseName}`;
  const hash = require('crypto').createHash('sha256').update(preimage).digest();
  return hash.slice(0, 8);
}

// 生成sendTradeSignal指令的discriminator
function getSendTradeSignalDiscriminator(): Buffer {
  // 合约中的指令名称是 send_trade_signal
  const preimage = `global:send_trade_signal`;
  const hash = require('crypto').createHash('sha256').update(preimage).digest();
  return hash.slice(0, 8);
}

// 序列化指令数据的辅助函数 - 使用Anchor标准格式
function serializeInstructionData(instructionName: string, ...args: any[]): Buffer {
  // Anchor指令格式: [指令标识(8字节)] + [参数数据]
  const discriminator = getInstructionDiscriminator(instructionName);
  let data = Buffer.from(discriminator);

  // 序列化参数
  for (const arg of args) {
    if (arg instanceof PublicKey) {
      const pubkeyBuffer = arg.toBuffer();
      const newData = Buffer.alloc(data.length + pubkeyBuffer.length);
      data.copy(newData, 0);
      pubkeyBuffer.copy(newData, data.length);
      data = newData;
    } else if (typeof arg === 'number' || typeof arg === 'bigint') {
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
async function checkAccountExists(accountPda: PublicKey): Promise<boolean> {
  try {
    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    const accountInfo = await connection.getAccountInfo(accountPda);
    return accountInfo !== null;
  } catch (error) {
    console.error("❌ 检查账户存在性失败:", error);
    return false;
  }
}

// 1. 初始化全局配置
async function initializeGlobalConfig(
  botAddress: PublicKey
): Promise<{ globalConfigPda: PublicKey, tx: string }> {
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
      GLOBAL_CONFIG_PDA = globalConfigPda;

      return { globalConfigPda, tx: "已存在，无需初始化" };
    }

    console.log("📋 初始化参数:");
    console.log("  机器人地址:", botAddress.toString());

    // 创建初始化全局配置指令
    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: globalConfigPda, isSigner: false, isWritable: true },
            { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: serializeInstructionData("initializeGlobalConfig", botAddress),
        })
      ),
      [adminKeypair]
    );

    console.log("✅ 全局配置初始化成功!");
    console.log("  交易签名:", tx);
    console.log("  全局配置地址:", globalConfigPda.toString());

    // 保存全局配置地址到全局变量
    GLOBAL_CONFIG_PDA = globalConfigPda;

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return { globalConfigPda, tx };

  } catch (error) {
    console.error("❌ 初始化全局配置失败:", error);
    throw error;
  }
}

// 2. 创建余额管理器（金库）
async function createBalanceManager(
  globalConfigPda: PublicKey,
  userKeypair: Keypair = adminKeypair
): Promise<{ vaultPda: PublicKey, tx: string }> {
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
      VAULT_PDA = vaultPda;

      return { vaultPda, tx: "已存在，无需创建" };
    }

    console.log("📋 创建参数:");
    console.log("  用户地址:", userKeypair.publicKey.toString());
    console.log("  全局配置地址:", globalConfigPda.toString());

    // 创建余额管理器指令
    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: globalConfigPda, isSigner: false, isWritable: false },
            { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: serializeInstructionData("createBalanceManager"),
        })
      ),
      [userKeypair]
    );

    console.log("✅ 余额管理器创建成功!");
    console.log("  交易签名:", tx);
    console.log("  金库地址:", vaultPda.toString());

    // 保存金库地址到全局变量
    VAULT_PDA = vaultPda;

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return { vaultPda, tx };

  } catch (error) {
    console.error("❌ 创建余额管理器失败:", error);
    throw error;
  }
}

// 辅助函数：创建用户的代币账户（如果不存在）
async function ensureTokenAccount(
  mint: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<PublicKey> {
  try {
    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    // 获取关联代币账户地址
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      owner,
      false // 标准账户（非 PDA）
    );

    // 检查账户是否已存在
    const accountInfo = await connection.getAccountInfo(tokenAccount);

    if (accountInfo) {
      console.log("  ✅ 代币账户已存在:", tokenAccount.toString());
      return tokenAccount;
    }

    // 创建关联代币账户
    console.log("  🔨 创建代币账户:", tokenAccount.toString());
    const tx = await connection.sendTransaction(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          tokenAccount,
          owner,
          mint
        )
      ),
      [payer]
    );

    console.log("  ✅ 代币账户创建成功!");
    console.log("    交易签名:", tx);

    return tokenAccount;
  } catch (error) {
    console.error("❌ 创建代币账户失败:", error);
    throw error;
  }
}

// 3. 用户存款 (SPL 代币)
async function userDeposit(
  vaultPda: PublicKey,
  mint: PublicKey,
  amount: number,
  userKeypair: Keypair = user2Keypair // 默认使用 user2，可以传入其他用户
): Promise<string> {
  try {
    console.log("\n💰 用户存款...");
    console.log("  用户地址:", userKeypair.publicKey.toString());
    console.log("  代币地址:", mint.toString());
    console.log("  存款金额:", amount);

    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    // 获取用户的代币账户地址
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      userKeypair.publicKey
    );

    // 获取金库的代币账户地址
    const vaultTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultPda,
      true // 允许PDA作为代币账户所有者
    );

    console.log("  用户代币账户:", userTokenAccount.toString());
    console.log("  金库代币账户:", vaultTokenAccount.toString());

    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: userTokenAccount, isSigner: false, isWritable: true },
            { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: serializeInstructionData("userDeposit", amount),
        })
      ),
      [userKeypair]
    );

    console.log("✅ 存款成功!");
    console.log("  交易签名:", tx);

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error) {
    console.error("❌ 存款失败:", error);
    throw error;
  }
}

// 3a. 用户存入原生 SOL
async function userDepositSol(
  vaultPda: PublicKey,
  amount: number,
  userKeypair: Keypair = user2Keypair // 默认使用 user2，可以传入其他用户
): Promise<string> {
  try {
    console.log("\n💰 用户 SOL 存款...");
    console.log("  用户地址:", userKeypair.publicKey.toString());
    console.log("  存款金额:", amount.toLocaleString(), "lamports");
    console.log("  存款金额:", (amount / 1_000_000_000), "SOL");

    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: serializeInstructionData("userDepositSol", amount),
        })
      ),
      [userKeypair]
    );

    console.log("✅ SOL 存款成功!");
    console.log("  交易签名:", tx);

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error) {
    console.error("❌ SOL 存款失败:", error);
    throw error;
  }
}

// 4. 用户取款 (SPL 代币)
async function userWithdraw(
  vaultPda: PublicKey,
  mint: PublicKey,
  amount: number,
  userKeypair: Keypair = user2Keypair // 默认使用 user2，可以传入其他用户
): Promise<string> {
  try {
    console.log("\n💸 用户取款...");
    console.log("  用户地址:", userKeypair.publicKey.toString());
    console.log("  代币地址:", mint.toString());
    console.log("  取款金额:", amount);

    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    // 获取用户的代币账户地址
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      userKeypair.publicKey
    );

    // 获取金库的代币账户地址
    const vaultTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultPda,
      true // 允许PDA作为代币账户所有者
    );

    console.log("  用户代币账户:", userTokenAccount.toString());
    console.log("  金库代币账户:", vaultTokenAccount.toString());

    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: userTokenAccount, isSigner: false, isWritable: true },
            { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: serializeInstructionData("userWithdraw", amount),
        })
      ),
      [userKeypair]
    );

    console.log("✅ 取款成功!");
    console.log("  交易签名:", tx);

    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error) {
    console.error("❌ 取款失败:", error);
    throw error;
  }
}

// 4a. 用户取出原生 SOL
async function userWithdrawSol(
  vaultPda: PublicKey,
  amount: number,
  userKeypair: Keypair = user2Keypair // 默认使用 user2，可以传入其他用户
): Promise<string> {
  try {
    console.log("\n💸 用户 SOL 取款...");
    console.log("  用户地址:", userKeypair.publicKey.toString());
    console.log("  取款金额:", amount.toLocaleString(), "lamports");
    console.log("  取款金额:", (amount / 1_000_000_000), "SOL");

    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: serializeInstructionData("userWithdrawSol", amount),
        })
      ),
      [userKeypair]
    );

    console.log("✅ SOL 取款成功!");
    console.log("  交易签名:", tx);

    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error) {
    console.error("❌ SOL 取款失败:", error);
    throw error;
  }
}

// 5. 获取余额（View函数）
async function getBalance(vaultPda: PublicKey, token: PublicKey): Promise<BN> {
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
      return new BN(0);
    }

    console.log("✅ 获取金库账户信息成功");
    console.log("  账户数据长度:", vaultAccount.data.length);
    console.log("  账户所有者:", vaultAccount.owner.toString());

    // 解析账户数据
    const vaultData = parsePersonalVaultAccount(vaultAccount.data);

    if (!vaultData) {
      console.log("⚠️  账户数据解析失败");
      return new BN(0);
    }

    console.log("✅ 账户数据解析成功");
    console.log("  投资者:", vaultData.investor);
    console.log("  已初始化:", vaultData.isInitialized);
    console.log("  代币余额数量:", vaultData.balances.length);

    // 查找特定代币的余额
    const tokenStr = token.toString();
    console.log("🔍 查找代币:", tokenStr);
    console.log("🔍 现有代币余额:");
    vaultData.balances.forEach((balance: any, index: number) => {
      console.log(`  ${index + 1}. 代币: ${balance.token}, 余额: ${balance.amount} lamports`);
    });

    const balanceEntry = vaultData.balances.find((balance: any) =>
      balance.token === tokenStr
    );

    if (balanceEntry) {
      const balance = new BN(balanceEntry.amount);
      console.log("✅ 找到代币余额:", balance.toNumber().toLocaleString(), "lamports (" + (balance.toNumber() / 1_000_000_000) + " SOL)");
      return balance;
    } else {
      console.log("⚠️  未找到代币余额，返回0");
      return new BN(0);
    }

  } catch (error) {
    console.error("❌ 查询余额失败:", error);
    throw error;
  }
}

// 6. 设置机器人地址
async function setBot(globalConfigPda: PublicKey, newBotAddress: PublicKey): Promise<string> {
  try {
    console.log("\n🤖 设置机器人地址...");
    console.log("  新机器人地址:", newBotAddress.toString());

    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: globalConfigPda, isSigner: false, isWritable: true },
            { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
          ],
          data: serializeInstructionData("setBot", newBotAddress),
        })
      ),
      [adminKeypair]
    );

    console.log("✅ 机器人地址设置成功!");
    console.log("  交易签名:", tx);

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error) {
    console.error("❌ 设置机器人失败:", error);
    throw error;
  }
}

// 7. 设置管理员
async function setAdmin(globalConfigPda: PublicKey, newAdmin: PublicKey): Promise<string> {
  try {
    console.log("\n👤 设置管理员...");
    console.log("  新管理员地址:", newAdmin.toString());

    const connection = await checkConnection();
    if (!connection) {
      throw new Error("网络连接失败");
    }

    const tx = await connection.sendTransaction(
      new Transaction().add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: globalConfigPda, isSigner: false, isWritable: true },
            { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
          ],
          data: serializeInstructionData("setAdmin", newAdmin),
        })
      ),
      [adminKeypair]
    );

    console.log("✅ 管理员设置成功!");
    console.log("  交易签名:", tx);

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error) {
    console.error("❌ 设置管理员失败:", error);
    throw error;
  }
}

// 8. 发送交易信号 
async function sendTradeSignal(
  vaultPda: PublicKey,
  tokenIn: PublicKey,
  tokenOut: PublicKey,
  amountIn: number,
  slippageBps: number,
  signerKeypair: Keypair = adminKeypair, // 默认使用管理员，也可以传入机器人
  userKeypair: Keypair = user2Keypair // 金库所有者的 Keypair，用于签名
): Promise<string> {
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
    const [globalConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      PROGRAM_ID
    );
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

    const userAddress = new PublicKey(vaultData.investor);
    console.log("  金库所有者:", userAddress.toString());

    // 🚀 调用 Raydium 方法获取交换账户信息
    console.log("\n🔍 获取 Raydium 交换账户信息...");

    // 优先尝试 CLMM 池子
    let raydiumResult = await build_devnet_raydium_clmm_accountInfo(
      vaultPda,
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps
    );

    if (!raydiumResult.success || !raydiumResult.accounts?.swapAccounts) {
      throw new Error(`获取 Raydium 交换账户失败: ${raydiumResult.error || '未知错误'}`);
    }

    const swapAccounts = raydiumResult.accounts.swapAccounts;
    console.log("✅ 成功获取 Raydium 交换账户");
    console.log("  池子类型:", raydiumResult.poolType);
    console.log("  池状态账户:", swapAccounts.poolState);

    // 🎯 仅支持 CLMM 池子类型
    let remainingAccounts: any[] = [];
    let poolType: number; // 1=CLMM

    // 🔧 检测是否需要创建临时 WSOL 账户（方案 1）
    const WSOL_MINT = TEST_ADDRESSES.dwsolDevnet;
    const needsTempWsolAccount = tokenIn.equals(WSOL_MINT);
    let tempWsolKeypair: Keypair | null = null;
    let actualInputTokenAccount: PublicKey | null = null;

    // 如果需要临时账户，先创建它
    if (needsTempWsolAccount) {
      console.log("\n🔍 检测到 WSOL 输入，创建临时账户（模仿 SDK）...");
      tempWsolKeypair = Keypair.generate();
      actualInputTokenAccount = tempWsolKeypair.publicKey;
      console.log("  临时 WSOL 账户地址:", actualInputTokenAccount.toString());
    }

    if (raydiumResult.poolType === 'CLMM') {
      console.log("  🎯 构建 CLMM 账户列表...");

      poolType = 1; // CLMM

      // 🚀 使用官方 SDK 成功交易中的正确 tick_array 地址
      // 从官方 SDK 成功交易分析中获取的正确地址：
      // [13] HG4W3SEFK6KScAhbSnLdutTpHm1uptgUVruEXcTvzqDs - tickArray[0]
      // [14] 4KsoqL8QSkN9xWtNVGVpmziNbtiTN5Y2CkijeZRYEdvx - tickArray[1]  
      // [15] 5HHdAJUqZu6tebEm7VBggU6FPo35t2aSAq4Bwai1YPfQ - exBitmap
      const correctTickArrayAccounts = [
        { pubkey: new PublicKey("HG4W3SEFK6KScAhbSnLdutTpHm1uptgUVruEXcTvzqDs"), isSigner: false, isWritable: true }, // tickArray[0]
        { pubkey: new PublicKey("4KsoqL8QSkN9xWtNVGVpmziNbtiTN5Y2CkijeZRYEdvx"), isSigner: false, isWritable: true }, // tickArray[1]
        { pubkey: new PublicKey("5HHdAJUqZu6tebEm7VBggU6FPo35t2aSAq4Bwai1YPfQ"), isSigner: false, isWritable: true }, // exBitmap
      ];
      console.log(`  ✅ 使用官方 SDK 成功交易中的正确 tick_array 地址`);
      console.log(`  📋 正确的 tick_array 地址:`);
      correctTickArrayAccounts.forEach((acc, index) => {
        console.log(`    [${index}] ${acc.pubkey.toString()}`);
      });
      

      // === 建议的正确账户顺序 ===
      // 根据 Raydium 官方文档，正确的账户顺序应该是：
      //   [00] executor (payer, 签名者)
      //   [01] ammConfig
      //   [02] poolState
      //   [03] inputTokenAccount
      //   [04] outputTokenAccount
      //   [05] poolVaultA
      //   [06] poolVaultB
      //   [07] observationState
      //   [08] TOKEN_PROGRAM_ID
      //   [09] inputMint
      //   [10] outputMint
      //   [11+] tickArray[0]
      //   [12+] tickArray[1]
      //   [13+] tickArray[2]
      //   [14+] exBitmapAccount

      
      // 构建 remaining_accounts 列表 - CLMM 版本（根据官方 SDK 分析修复）
      // 🎯 根据官方 SDK 成功交易分析，正确的账户顺序应该是：
      // [8] TOKEN_PROGRAM_ID, [9] TOKEN_2022_PROGRAM_ID, [10] MEMO_PROGRAM_ID, [11] inputMint, [12] outputMint, [13+] tickArrays
      remainingAccounts = [
        // [0] payer (签名者) - 应该是金库所有者，不是管理员
        { pubkey: userAddress, isSigner: true, isWritable: false },
        // [1] ammConfigId
        { pubkey: new PublicKey((swapAccounts as any).ammConfig), isSigner: false, isWritable: false },
        // [2] poolId
        { pubkey: new PublicKey(swapAccounts.poolState), isSigner: false, isWritable: true },
        // [3] inputTokenAccount
        { pubkey: tempWsolKeypair ? (tempWsolKeypair as Keypair).publicKey : new PublicKey(swapAccounts.userInputTokenAccount), isSigner: tempWsolKeypair ? true : false, isWritable: true },
        // [4] outputTokenAccount
        { pubkey: new PublicKey(swapAccounts.userOutputTokenAccount), isSigner: false, isWritable: true },
        // [5] inputVault
        { pubkey: new PublicKey(swapAccounts.poolVaultA), isSigner: false, isWritable: true },
        // [6] outputVault
        { pubkey: new PublicKey(swapAccounts.poolVaultB), isSigner: false, isWritable: true },
        // [7] observationId
        { pubkey: new PublicKey((swapAccounts as any).observationState), isSigner: false, isWritable: true },
        // [8] TOKEN_PROGRAM_ID - 根据官方 SDK 分析
        { pubkey: new PublicKey(swapAccounts.tokenProgramId), isSigner: false, isWritable: false },
        // [9] TOKEN_2022_PROGRAM_ID - 根据官方 SDK 分析添加
        { pubkey: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"), isSigner: false, isWritable: false },
        // [10] MEMO_PROGRAM_ID - 根据官方 SDK 分析添加
        { pubkey: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), isSigner: false, isWritable: false },
        // [11] inputMint - 根据官方 SDK 分析，mint 在 tick_array 之前
        { pubkey: tokenIn, isSigner: false, isWritable: false },
        // [12] outputMint - 根据官方 SDK 分析，mint 在 tick_array 之前
        { pubkey: tokenOut, isSigner: false, isWritable: false },
        // [13+] remainingAccounts (exBitmapAccount + tickArrays) - 移动到最后
        ...correctTickArrayAccounts,
      ];
      
      // ⚠️ 注意：Raydium CLMM 程序账户现在作为单独的账户传递（不在 remainingAccounts 中）

    } else {
      throw new Error(`不支持的池子类型: ${raydiumResult.poolType}，当前仅支持 CLMM`);
    }

    console.log(`🔧 构建了 ${remainingAccounts.length} 个剩余账户:`);
    remainingAccounts.forEach((account, index) => {
      console.log(`  [${index.toString().padStart(2, '0')}] ${account.pubkey.toString()}`);
    });
    console.log(`📊 池子类型参数: ${poolType} (CLMM)`);
    console.log(`🎯 DEX 程序账户（独立传递）: ${RAYDIUM_PROGRAMS.clmm.toString()}`);

    const transaction = new Transaction()
      .add(
        // 增加计算单元预算到 1,000,000 CU
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
      )
      .add(
        // 设置计算单元价格（可选，提高交易优先级）
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
      );

    if (needsTempWsolAccount && tempWsolKeypair) {
      console.log("\n🔧 添加临时 WSOL 账户创建指令...");

      // 1. 计算租金（Token Account size = 165 bytes）
      const rent = await connection.getMinimumBalanceForRentExemption(165);
      console.log("  租金金额:", rent, "lamports");
      console.log("  转账金额:", amountIn, "lamports");
      console.log("  总金额:", rent + amountIn, "lamports");

      // 2. 创建账户指令
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: signerKeypair.publicKey,
          newAccountPubkey: tempWsolKeypair.publicKey,
          lamports: rent + amountIn, // 租金 + 要转账的 SOL
          space: 165,
          programId: TOKEN_PROGRAM_ID
        })
      );

      // 3. 初始化代币账户指令
      transaction.add(
        createInitializeAccountInstruction(
          tempWsolKeypair.publicKey,
          WSOL_MINT,
          signerKeypair.publicKey // owner 是管理员，这样管理员可以签名使用它
        )
      );

      console.log("  ✅ 添加了临时 WSOL 账户创建指令");
      console.log("  📝 架构说明：临时账户 owner = 管理员，交换后需要转移到 vault");
    }

    // 添加主要的 swap 指令
    transaction.add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          // 基本账户（来自 IDL）
          { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: false },     // executor (管理员或Bot)
          { pubkey: userAddress, isSigner: false, isWritable: false },                // user (金库所有者，用于账户推导)
          { pubkey: vaultPda, isSigner: false, isWritable: true },                    // vault (个人金库账户)
          { pubkey: globalConfigPda, isSigner: false, isWritable: false },            // global_config (全局配置账户)
          { pubkey: RAYDIUM_PROGRAMS.clmm, isSigner: false, isWritable: false },      // dex_program (Raydium CLMM 程序)
          // 剩余账户（Raydium 交换相关）
          ...remainingAccounts
        ],
        data: serializeTradeSignalData(tokenIn, tokenOut, amountIn, slippageBps, poolType),
      })
    );

    // ✅ 新架构：临时账户 owner = 管理员
    // 说明：临时账户属于管理员，交换后需要：
    // 1. 将获得的代币转移到 vault 的正式代币账户
    // 2. 关闭临时账户回收租金
    if (tempWsolKeypair) {
      console.log("\n✅ 创建了临时 WSOL 账户");
      console.log("  临时账户地址:", tempWsolKeypair.publicKey.toString());
      console.log("  临时账户 owner:", signerKeypair.publicKey.toString());
      console.log("  ⚠️  交换后需要手动转移代币到 vault 并关闭临时账户");
    }

    // 🔧 准备签名者列表
    const signers = [signerKeypair, userKeypair]; // 添加用户 Keypair 用于签名
    if (tempWsolKeypair) {
      signers.push(tempWsolKeypair);
      console.log("  ✅ 添加临时账户到签名者列表");
    }
    console.log("  ✅ 添加用户 Keypair 到签名者列表:", userKeypair.publicKey.toString());

    console.log("\n📤 发送交易...");
    console.log("  签名者数量:", signers.length);
    const tx = await connection.sendTransaction(transaction, signers);

    console.log("✅ 交易信号发送成功!");
    console.log("  交易签名:", tx);

    // 打印交易查看链接
    console.log("\n🔗 交易查看链接:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    return tx;

  } catch (error: any) {
    console.error("❌ 发送交易信号失败:", error.message || error);
    
    // 如果是 SendTransactionError，使用 getLogs() 获取完整日志
    if (error.getLogs && typeof error.getLogs === 'function') {
      try {
        const fullLogs = error.getLogs();
        console.log("\n📋 完整交易日志 (通过 getLogs()):");
        fullLogs.forEach((log: string, index: number) => {
          console.log(`[${index.toString().padStart(3, '0')}] ${log}`);
        });
      } catch (logError) {
        console.log("⚠️  无法获取完整日志:", logError);
      }
    }
    
    // 备用方案：直接从 transactionLogs 获取
    if (error.transactionLogs && Array.isArray(error.transactionLogs)) {
      console.log("\n📋 交易日志 (从 transactionLogs 属性):");
      error.transactionLogs.forEach((log: string, index: number) => {
        console.log(`[${index.toString().padStart(3, '0')}] ${log}`);
      });
    }
    
    throw error;
  }
}

// 序列化交易信号指令数据的辅助函数
function serializeTradeSignalData(
  tokenIn: PublicKey,
  tokenOut: PublicKey,
  amountIn: number,
  slippageBps: number,
  poolType: number // 新增：池子类型参数 (0=AMM V4, 1=CLMM)
): Buffer {
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

  // 添加 poolType (1字节)
  const poolTypeBuffer = Buffer.alloc(1);
  poolTypeBuffer.writeUInt8(poolType, 0);
  newData = Buffer.alloc(data.length + poolTypeBuffer.length);
  data.copy(newData, 0);
  poolTypeBuffer.copy(newData, data.length);
  data = newData;

  return data;
}

// 解析PersonalVault账户数据的辅助函数（更新版本）
function parsePersonalVaultAccount(data: Buffer): any {
  try {
    // 跳过8字节的账户标识符
    let offset = 8;

    // 读取investor (32字节)
    const investor = new PublicKey(data.slice(offset, offset + 32));
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
      const token = new PublicKey(data.slice(offset, offset + 32));
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
  } catch (error) {
    console.error("❌ 解析账户数据失败:", error);
    return null;
  }
}

// 解析GlobalConfig账户数据的辅助函数
function parseGlobalConfigAccount(data: Buffer): any {
  try {
    // 跳过8字节的账户标识符
    let offset = 8;

    // 读取admin (32字节)
    const admin = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // 读取bot (32字节)
    const bot = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // 读取is_initialized (1字节)
    const isInitialized = data[offset] === 1;
    offset += 1;

    return {
      admin: admin.toString(),
      bot: bot.toString(),
      isInitialized
    };
  } catch (error) {
    console.error("❌ 解析全局配置数据失败:", error);
    return null;
  }
}

// 获取金库信息函数（更新版本）
async function getVaultInfo(vaultPda: PublicKey) {
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
        vaultData.balances.forEach((balance: any, index: number) => {
          const amount = new BN(balance.amount);
          console.log(`    ${index + 1}. 代币: ${balance.token}, 余额: ${amount.toNumber().toLocaleString()} lamports (${(amount.toNumber() / 1_000_000_000)} SOL)`);
        });
      } else {
        console.log("  暂无代币余额");
      }
    } else {
      console.log("⚠️  账户数据解析失败");
    }

    return vaultAccount;

  } catch (error) {
    console.error("❌ 获取金库信息失败:", error);
    throw error;
  }
}

// 获取全局配置信息函数
async function getGlobalConfigInfo(globalConfigPda: PublicKey) {
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
    } else {
      console.log("⚠️  配置数据解析失败");
    }

    return configAccount;

  } catch (error) {
    console.error("❌ 获取全局配置信息失败:", error);
    throw error;
  }
}

// 验证余额变化函数 - 需要在操作前后分别调用
async function verifyBalanceChange(
  vaultPda: PublicKey,
  tokenMint: PublicKey,
  balanceBefore: BN,
  expectedChange: number,
  operation: string
): Promise<boolean> {
  try {
    console.log(`\n🔍 验证${operation}后的余额变化...`);

    console.log(`  操作前余额: ${balanceBefore.toNumber().toLocaleString()} lamports (${(balanceBefore.toNumber() / 1_000_000_000)} SOL)`);

    // 等待一段时间确保交易确认
    await new Promise(resolve => setTimeout(resolve, 2000));

    const balanceAfter = await getBalance(vaultPda, tokenMint);
    console.log(`  操作后余额: ${balanceAfter.toNumber().toLocaleString()} lamports (${(balanceAfter.toNumber() / 1_000_000_000)} SOL)`);

    const actualChange = balanceAfter.sub(balanceBefore).toNumber();
    console.log(`  实际变化: ${actualChange.toLocaleString()} lamports (${(actualChange / 1_000_000_000)} SOL)`);
    console.log(`  预期变化: ${expectedChange.toLocaleString()} lamports (${(expectedChange / 1_000_000_000)} SOL)`);

    const isCorrect = actualChange === expectedChange;
    if (isCorrect) {
      console.log(`✅ ${operation}余额变化验证成功`);
    } else {
      console.log(`❌ ${operation}余额变化验证失败`);
    }

    return isCorrect;

  } catch (error) {
    console.error(`❌ 验证${operation}余额变化失败:`, error);
    return false;
  }
}


// 主测试函数
async function testComplete() {
  try {
    console.log("🎯 开始完整测试流程...\n");

    console.log("=== 步骤 1: 初始化全局配置 ===");
    const { globalConfigPda } = await initializeGlobalConfig(
      TEST_ADDRESSES_WITH_BOT.bot
    );

    console.log("\n✅ 全局配置初始化完成!");
    console.log("全局配置地址:", globalConfigPda.toString());

    // 获取全局配置信息
    await getGlobalConfigInfo(globalConfigPda);

    console.log("\n=== 步骤 2: 创建余额管理器（为 user2） ===");
    console.log("User2 地址:", user2Keypair.publicKey.toString());
    const { vaultPda } = await createBalanceManager(globalConfigPda, user2Keypair);

    console.log("\n✅ 余额管理器创建完成!");
    console.log("金库地址:", vaultPda.toString());

    // 获取初始金库信息
    await getVaultInfo(vaultPda);


    // console.log("\n=== 步骤 3: SOL 存款 SOL 测试 ===");
    // try {
    //   const testToken = TEST_ADDRESSES.dwsolDevnet; // 原生 SOL (系统程序 ID)
    //   const depositAmount = 100000000; // 0.1 SOL

    //   console.log("💰 测试 SOL 存款功能...");
    //   console.log("  代币标识符:", testToken.toString());
    //   console.log("  存款金额:", depositAmount.toLocaleString(), "lamports");
    //   console.log("  存款金额:", (depositAmount / 1_000_000_000), "SOL");

    //   // 记录操作前余额
    //   const balanceBeforeDeposit = await getBalance(vaultPda, testToken);

    //   // 判断是否是原生SOL
    //   const isNativeSol = testToken.equals(TEST_ADDRESSES.solDevnet);
    //   let depositTx: string;

    //   if (isNativeSol) {
    //     console.log("  使用原生SOL存款...");
    //     depositTx = await userDepositSol(vaultPda, depositAmount, user2Keypair);
    //   } else {
    //     console.log("  使用包装SOL存款...");
    //     depositTx = await userDeposit(vaultPda, testToken, depositAmount, user2Keypair);
    //   }
    //   console.log("✅ SOL 存款测试成功");
    //   console.log("  交易签名:", depositTx);

    //   // 验证存款后的余额变化
    //   await verifyBalanceChange(vaultPda, testToken, balanceBeforeDeposit, depositAmount, "SOL 存款");

    // } catch (error) {
    //   console.error("❌ SOL 存款测试失败:", error);
    // }


    // console.log("\n=== 步骤 4: 取款 SOL 测试 ===");
    // try {
    //   const testToken = TEST_ADDRESSES.dwsolDevnet;
    //   const withdrawAmount = 100000000; // 0.1 SOL

    //   console.log("💸 测试取款功能...");
    //   console.log("  代币地址:", testToken.toString());
    //   console.log("  取款金额:", withdrawAmount.toLocaleString(), "lamports");

    //   // 记录操作前余额
    //   const balanceBeforeWithdraw = await getBalance(vaultPda, testToken);

    //   // 判断是否是原生SOL
    //   const isNativeSol = testToken.equals(TEST_ADDRESSES.solDevnet);
    //   let withdrawTx: string;

    //   if (isNativeSol) {
    //     // 原生 SOL 取款
    //     withdrawTx = await userWithdrawSol(vaultPda, withdrawAmount, user2Keypair);
    //   } else {
    //     // SPL Token 取款
    //     withdrawTx = await userWithdraw(vaultPda, testToken, withdrawAmount, user2Keypair);
    //   }
    //   console.log("✅ 取款测试成功");
    //   console.log("  交易签名:", withdrawTx);

    //   // 验证取款后的余额变化 (取款是负数变化)
    //   await verifyBalanceChange(vaultPda, testToken, balanceBeforeWithdraw, -withdrawAmount, "取款");

    // } catch (error) {
    //   console.error("❌ 取款测试失败:", error);
    // }


    // console.log("\n=== 步骤 5: USDC 存款 USDC 测试===");
    // try {
    //   const testToken = TEST_ADDRESSES.usdcDevnet;
    //   const depositAmount = 1000000; // 1 USDC (6 decimals)

    //   console.log("💰 测试 USDC 存款功能...");
    //   console.log("  代币标识符:", testToken.toString());
    //   console.log("  存款金额:", depositAmount.toLocaleString(), "lamports");
    //   console.log("  存款金额:", (depositAmount / 1_000_000), "USDC");

    //   // 确保用户拥有 USDC 代币账户
    //   console.log("  🔍 检查并创建用户的 USDC 代币账户...");
    //   await ensureTokenAccount(testToken, user2Keypair.publicKey, user2Keypair);

    //   // 记录操作前余额
    //   const balanceBeforeDeposit = await getBalance(vaultPda, testToken);

    //   // SPL Token 存款
    //   const depositTx = await userDeposit(vaultPda, testToken, depositAmount, user2Keypair);
    //   console.log("✅ USDC 存款测试成功");
    //   console.log("  交易签名:", depositTx);

    //   // 验证存款后的余额变化
    //   await verifyBalanceChange(vaultPda, testToken, balanceBeforeDeposit, depositAmount, "USDC 存款");

    // } catch (error) {
    //   console.error("❌ USDC 存款测试失败:", error);
    // }


    // console.log("\n=== 步骤 6: USDC 取款测试 ===");
    // try {
    //   const testToken = TEST_ADDRESSES.usdcDevnet;
    //   const withdrawAmount = 1000000; // 1 USDC (6 decimals)

    //   console.log("💸 测试 USDC 取款功能...");
    //   console.log("  代币地址:", testToken.toString());
    //   console.log("  取款金额:", withdrawAmount.toLocaleString(), "lamports");
    //   console.log("  取款金额:", (withdrawAmount / 1_000_000), "USDC");

    //   // 记录操作前余额
    //   const balanceBeforeWithdraw = await getBalance(vaultPda, testToken);

    //   // SPL Token 取款
    //   const withdrawTx = await userWithdraw(vaultPda, testToken, withdrawAmount, user2Keypair);
    //   console.log("✅ USDC 取款测试成功");
    //   console.log("  交易签名:", withdrawTx);

    //   // 验证取款后的余额变化 (取款是负数变化)
    //   await verifyBalanceChange(vaultPda, testToken, balanceBeforeWithdraw, -withdrawAmount, "USDC 取款");

    // } catch (error) {
    //   console.error("❌ USDC 取款测试失败:", error);
    // }


    console.log("\n=== 步骤 7: 交易信号测试 ===");
    try {
      console.log("\n🤖 测试机器人权限调用交易信号...");

      // ✅ 使用 Wrapped SOL (dwsolDevnet) 而不是原生 SOL
      // 因为存款时使用的是 dwsolDevnet，所以交换时也必须使用相同的 mint
      const tokenIn = TEST_ADDRESSES.dwsolDevnet; // Wrapped SOL 作为输入代币
      const tokenOut = TEST_ADDRESSES.usdcDevnet; // USDC Devnet 作为输出代币
      const amountIn = 100000000; // 0.1 SOL
      const slippageBps = 300; // 3% 滑点 (300 基点)

      console.log("使用机器人身份调用交易信号...");

      // 🔍 验证代币账户地址计算
      console.log("\n🔍 验证代币账户地址计算...");

      // 获取用户的代币账户地址
      const userTokenAccount = await getAssociatedTokenAddress(
        tokenIn,
        user2Keypair.publicKey
      );
      console.log("  用户代币账户:", userTokenAccount.toString());

      // 获取金库的代币账户地址（交换时将使用的账户）
      const vaultTokenAccount = await getAssociatedTokenAddress(
        tokenIn,
        vaultPda,
        true // 允许PDA作为代币账户所有者
      );
      console.log("  金库代币账户 (交换时):", vaultTokenAccount.toString());

      // 对比存款时的金库代币账户
      const depositTimeVaultAccount = "Cvjy63uiDC24anWJyF71tSefVNYntSkFLomqmjYeKAu8";
      console.log("  金库代币账户 (存款时):", depositTimeVaultAccount);

      if (vaultTokenAccount.toString() === depositTimeVaultAccount) {
        console.log("  ✅ 地址匹配！交换和存款使用相同的金库代币账户");
      } else {
        console.log("  ❌ 地址不匹配！这可能导致交换失败");
        console.log("  ⚠️  请检查代币 mint 是否一致");
      }
      console.log();

      const botTradeTx = await sendTradeSignal(
        vaultPda,
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps,
        adminKeypair,
        user2Keypair // 传入金库所有者的 Keypair
      );

      console.log("✅ 管理员交易信号测试成功");
      console.log("  交易签名:", botTradeTx);

    } catch (error) {
      console.error("❌ 管理员交易信号测试失败:", error);
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

  } catch (error) {
    console.error("❌ 测试流程失败:", error);
  }
}




// 导出函数
export {
  generateGlobalConfigPDA,
  generateVaultPDA,
  initializeGlobalConfig,
  createBalanceManager,
  userDeposit,
  userDepositSol,
  userWithdraw,
  userWithdrawSol,
  getBalance,
  setBot,
  setAdmin,
  sendTradeSignal,
  serializeTradeSignalData,
  getVaultInfo,
  getGlobalConfigInfo,
  verifyBalanceChange,
  testComplete,
  TEST_ADDRESSES,
  GLOBAL_CONFIG_PDA,
  VAULT_PDA,
  user1Keypair,
  user2Keypair,
  adminKeypair,
  botKeypair
};

// 注释掉原来的测试函数调用
testComplete();
