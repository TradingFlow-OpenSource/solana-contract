# 🔧 Raydium CLMM WSOL Swap 修复指南

## 🎯 问题总结

通过对比 SDK 直接调用和合约调用，发现关键差异：

### ✅ SDK 成功的原因
```
指令 [3]: System Program - 创建临时 WSOL 账户 (7EEki7Wg...)
指令 [4]: Token Program - 初始化 WSOL 账户
指令 [5]: Raydium CLMM - swap（使用临时账户作为输入）
指令 [6]: Token Program - 关闭临时账户
```

### ❌ 合约失败的原因
```
只有 1 个指令：Raydium CLMM swap
使用 vault 的 ATA 账户（可能有状态问题）
```

---

## 💡 解决方案选择

我们有 3 个方案，推荐**方案 1**：

### 方案 1：修改 TypeScript 端（最简单，推荐） ⭐⭐⭐⭐⭐

**优点：**
- 不需要修改 Rust 合约代码
- 复用 SDK 的成功经验
- 灵活性高，易于测试

**缺点：**
- 需要在调用前预先创建临时账户

**实施步骤：**

#### Step 1.1：修改 `test/raydium/raydium.ts`

在 `build_devnet_raydium_clmm_accountInfo` 函数中添加临时 WSOL 账户创建逻辑：

```typescript
// 检测是否需要使用临时 WSOL 账户
const needsTempWsolAccount = 
  inputMint.toString() === WSOL_MINT || 
  outputMint.toString() === WSOL_MINT;

if (needsTempWsolAccount) {
  // 创建临时 keypair
  const tempWsolKeypair = Keypair.generate();
  
  // 返回额外的指令和账户信息
  return {
    ...result,
    tempWsolAccount: tempWsolKeypair.publicKey,
    preInstructions: [
      // 创建账户
      SystemProgram.createAccount({...}),
      // 初始化代币账户
      createInitializeAccountInstruction(...)
    ],
    postInstructions: [
      // 关闭账户
      createCloseAccountInstruction(...)
    ]
  };
}
```

#### Step 1.2：修改 `test/test.ts` 中的 `sendTradeSignal`

```typescript
async function sendTradeSignal(...) {
  // 获取 Raydium 账户信息
  const raydiumResult = await build_devnet_raydium_clmm_accountInfo(...);
  
  // 构建交易
  const transaction = new Transaction();
  
  // 添加预指令（如果有）
  if (raydiumResult.preInstructions) {
    raydiumResult.preInstructions.forEach(ix => transaction.add(ix));
  }
  
  // 添加主要的 swap 指令
  transaction.add(new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [...],
    data: serializeTradeSignalData(...)
  }));
  
  // 添加后指令（如果有）
  if (raydiumResult.postInstructions) {
    raydiumResult.postInstructions.forEach(ix => transaction.add(ix));
  }
  
  // 发送交易（需要额外的签名者）
  const signers = [signerKeypair];
  if (raydiumResult.tempWsolKeypair) {
    signers.push(raydiumResult.tempWsolKeypair);
  }
  
  const tx = await connection.sendTransaction(transaction, signers);
}
```

---

### 方案 2：修改合约端（最彻底）⭐⭐⭐

**优点：**
- 一次性解决，对外部调用者透明
- 更加健壮

**缺点：**
- 需要修改 Rust 代码
- 复杂度高
- 需要重新部署合约

**实施步骤：**

#### Step 2.1：在 `src/dex/raydium_clmm.rs` 中添加 WSOL 处理

```rust
use anchor_spl::token::{self, Token, TokenAccount};
use anchor_lang::solana_program::program::invoke_signed;

pub fn execute_swap_with_wsol_handling(
    amount_in: u64,
    amount_out_minimum: u64,
    input_mint: &Pubkey,
    account_infos: &[AccountInfo],
    signer_seeds: &[&[&[u8]]],
) -> Result<SwapResult> {
    
    // 检查是否是 WSOL
    let is_wsol_input = input_mint == &crate::constants::WSOL_MINT;
    
    if is_wsol_input {
        msg!("🔍 检测到 WSOL 输入，创建临时账户...");
        
        // 1. 生成临时账户（但在 Solana 中我们不能在运行时生成 keypair）
        // 所以需要从 TypeScript 传入一个空的未初始化账户
        
        // 2. 初始化临时 WSOL 账户
        // 3. 转账 SOL 到临时账户
        // 4. 执行 swap
        // 5. 关闭临时账户
        
        todo!("需要更复杂的实现")
    } else {
        // 正常的 token swap
        Self::execute_swap(amount_in, amount_out_minimum, slippage_bps, account_infos, signer_seeds)
    }
}
```

**问题：** Rust 合约无法在运行时生成 keypair（因为需要签名），所以这个方案实际上也需要 TypeScript 配合。

---

### 方案 3：混合方案（最实用）⭐⭐⭐⭐

结合方案 1 和 2 的优点：

1. **TypeScript 负责：**
   - 检测是否需要临时 WSOL 账户
   - 创建临时账户 keypair
   - 将临时账户作为额外账户传给合约

2. **合约负责：**
   - 检测第一个账户是否是临时账户
   - 初始化临时账户
   - 执行 swap
   - 关闭临时账户

---

## 🚀 快速实施（推荐方案 1 的简化版本）

### 最简单的修复：直接在 test.ts 中添加指令

```typescript
async function sendTradeSignal(...) {
  // ... 现有代码 ...
  
  const transaction = new Transaction();
  
  // 🔧 如果输入代币是 WSOL，添加临时账户创建指令
  let tempWsolKeypair: Keypair | null = null;
  let actualInputAccount = vaultInputTokenAccount;
  
  if (tokenIn.equals(WSOL_MINT)) {
    console.log("🔍 检测到 WSOL 输入，创建临时账户...");
    
    // 1. 生成临时 keypair
    tempWsolKeypair = Keypair.generate();
    actualInputAccount = tempWsolKeypair.publicKey;
    
    // 2. 计算租金
    const rent = await connection.getMinimumBalanceForRentExemption(165); // Token Account size
    
    // 3. 创建账户
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: signerKeypair.publicKey,
        newAccountPubkey: tempWsolKeypair.publicKey,
        lamports: rent + amountIn, // 租金 + 要转账的 SOL
        space: 165,
        programId: TOKEN_PROGRAM_ID
      })
    );
    
    // 4. 初始化代币账户
    transaction.add(
      createInitializeAccountInstruction(
        tempWsolKeypair.publicKey,
        WSOL_MINT,
        vaultPda // owner 是 vault PDA
      )
    );
  }
  
  // 5. 添加 compute budget
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
  );
  
  // 6. 添加主要的 swap 指令
  transaction.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: userAddress, isSigner: false, isWritable: false },
        ...remainingAccounts
      ],
      data: serializeTradeSignalData(...)
    })
  );
  
  // 7. 如果创建了临时账户，关闭它
  if (tempWsolKeypair) {
    transaction.add(
      createCloseAccountInstruction(
        tempWsolKeypair.publicKey,
        signerKeypair.publicKey, // 租金返回给 payer
        vaultPda // owner
      )
    );
  }
  
  // 8. 发送交易
  const signers = [signerKeypair];
  if (tempWsolKeypair) {
    signers.push(tempWsolKeypair);
  }
  
  const tx = await connection.sendTransaction(transaction, signers);
  return tx;
}
```

---

## ⚠️ 注意事项

### 1. 账户顺序很重要

在 `remainingAccounts` 中，确保临时 WSOL 账户替换原来的 vault ATA：

```typescript
// ❌ 错误
remainingAccounts = [
  { pubkey: vaultInputTokenAccount, ... }, // 旧的 ATA
  ...
];

// ✅ 正确
remainingAccounts = [
  { pubkey: actualInputAccount, ... }, // 临时账户（如果是 WSOL）
  ...
];
```

### 2. 签名者列表

临时账户 keypair 必须加入签名者列表：

```typescript
const signers = [signerKeypair, tempWsolKeypair];
```

### 3. 租金和余额

创建临时账户时，需要：
- 租金（约 0.002 SOL）
- + 要转账的金额

```typescript
lamports: rent + amountIn
```

### 4. 关闭账户

交易结束后关闭临时账户，回收租金：

```typescript
createCloseAccountInstruction(
  tempWsolKeypair.publicKey,
  signerKeypair.publicKey, // 租金接收者
  vaultPda // 账户 owner（需要签名）
)
```

---

## 🧪 测试步骤

1. 修改 `test/test.ts` 中的 `sendTradeSignal` 函数
2. 运行测试：
   ```bash
   npx ts-node test/test.ts
   ```
3. 检查交易日志，确认：
   - ✅ 创建了临时账户
   - ✅ swap 成功执行
   - ✅ 临时账户被关闭

---

## 📝 总结

**最简单的修复方案：**
1. 在 `test.ts` 的 `sendTradeSignal` 中添加临时 WSOL 账户创建逻辑
2. 不需要修改 Rust 合约代码
3. 完全模仿 SDK 的成功做法

**预期结果：**
- ✅ WSOL → USDC swap 成功
- ✅ 使用临时账户，状态干净
- ✅ 交易结构与 SDK 一致
