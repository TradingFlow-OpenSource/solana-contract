# 🔍 Raydium CLMM 调用对比分析

## ✅ SDK 直接调用（成功）

通过 `test_sdk_direct_swap.ts`，我们成功使用 SDK 执行了 swap：

```typescript
const { execute, transaction } = await raydium.clmm.swap({
  poolInfo: poolInfo.poolInfo,
  poolKeys: poolInfo.poolKeys,
  inputMint: inputMint.toString(),
  amountIn,
  amountOutMin: result.minAmountOut.amount.raw,
  observationId: poolInfo.computePoolInfo.observationId,
  ownerInfo: {
    useSOLBalance: true  // ✅ 关键：使用临时 WSOL 账户
  },
  remainingAccounts: result.remainingAccounts,
});
```

### SDK 生成的交易结构（6 个指令）：

1. **ComputeBudget** - 设置计算单元
2. **ComputeBudget** - 设置优先费用
3. **System Program** - **创建临时 WSOL 账户** ✅
4. **Token Program** - **初始化 WSOL 账户** ✅
5. **Raydium CLMM** - 执行 swap（使用临时账户）
6. **Token Program** - 关闭临时账户

**关键发现：SDK 创建了临时的 WSOL 账户（`7EEki7WgTtY85ySkw7YpN3uuEmudYRaUEKi3SZJ6h9rP`）**

---

## ❌ 合约调用（失败）

通过 `test.ts` 调用合约的 `send_trade_signal`：

### 问题 1：使用已存在的 ATA 账户

```typescript
// test.ts 中通过 raydium.ts 获取的账户
userInputTokenAccount: vault 的 ATA (Cvjy63uiDC24anWJyF71tSefVNYntSkFLomqmjYeKAu8)
```

这个账户是 vault PDA 的关联代币账户（ATA），可能存在以下问题：
- 账户状态不干净（有 delegate、close authority 等）
- Raydium CLMM 对账户状态有严格要求

### 问题 2：合约无法创建临时 WSOL 账户

合约代码中没有创建临时 WSOL 账户的逻辑，只是直接使用传入的账户：

```rust
// src/dex/raydium_clmm.rs
// 直接使用 account_infos 构建指令
let mut account_metas = Vec::new();
for (i, account_info) in account_infos.iter().enumerate() {
    account_metas.push(AccountMeta {
        pubkey: *account_info.key,
        is_signer,
        is_writable,
    });
}
```

---

## 🎯 解决方案

### 方案 1：在合约中创建临时 WSOL 账户（推荐）

模仿 SDK 的做法，在执行 swap 前创建临时 WSOL 账户：

```rust
// 伪代码
if input_mint == WSOL {
    // 1. 创建临时账户
    // 2. 初始化为 WSOL 账户
    // 3. 转账 SOL 进去
    // 4. 执行 swap（使用临时账户）
    // 5. 关闭临时账户
}
```

### 方案 2：确保 ATA 处于干净状态

在调用前检查并清理 ATA 账户状态：
- 移除 delegate
- 移除 close authority
- 确保账户余额正确

### 方案 3：修改 TypeScript 端逻辑

在 `raydium.ts` 中，当检测到输入代币是 WSOL 时：
1. 不使用 vault 的 ATA
2. 生成一个临时账户地址
3. 在合约调用前创建并初始化它

---

## 📊 账户对比

| 账户类型 | SDK 方式 | 合约方式 | 状态 |
|---------|---------|---------|-----|
| 输入账户 | 临时 WSOL (新创建) | Vault ATA (已存在) | ❌ 不匹配 |
| 输出账户 | Vault ATA | Vault ATA | ✅ 匹配 |
| Payer | User | Vault PDA | ✅ 可以不同 |

---

## 🔧 推荐实施步骤

### Step 1：修改合约代码

在 `src/dex/raydium_clmm.rs` 中添加 WSOL 处理逻辑：

```rust
pub fn handle_wsol_swap(
    amount_in: u64,
    amount_out_minimum: u64,
    account_infos: &[AccountInfo],
    signer_seeds: &[&[&[u8]]],
) -> Result<u64> {
    // 1. 创建临时 WSOL 账户
    let temp_wsol_keypair = Keypair::new();
    
    // 2. 创建账户指令
    // 3. 初始化代币账户指令
    // 4. 转账 SOL 指令
    // 5. 执行 swap（替换 account_infos 中的输入账户为临时账户）
    // 6. 关闭临时账户指令
    
    Ok(amount_out)
}
```

### Step 2：修改 `send_trade_signal` 指令

在 `src/instructions.rs` 中检测 WSOL：

```rust
// 检测是否是 WSOL swap
if token_in == crate::constants::WSOL_MINT {
    msg!("检测到 WSOL 输入，使用临时账户方案");
    amount_out = handle_wsol_swap(...)?;
} else {
    // 正常的 token swap
    amount_out = execute_dex_swap(...)?;
}
```

### Step 3：测试

运行 `test.ts` 验证修复是否成功。

---

## 🎉 总结

**根本原因：**
- SDK 使用**临时创建的 WSOL 账户**（干净状态）✅
- 合约使用**已存在的 vault ATA**（可能有状态问题）❌

**最佳解决方案：**
在合约中模仿 SDK 的行为，当输入代币是 WSOL 时，创建临时账户来执行 swap。

这样可以确保账户状态干净，符合 Raydium CLMM 的要求。
