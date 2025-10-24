# 🔧 WSOL Swap 修复实施文档

## 📋 问题分析

### 原始问题
使用 WSOL 进行 swap 时，TypeScript 无法关闭临时 WSOL 账户，因为：
1. 临时账户的 owner 是 `vaultPda`（PDA）
2. 关闭账户需要 owner 签名
3. TypeScript 无法提供 PDA 签名

### 方案 1 的缺陷
`WSOL_FIX_GUIDE.md` 中提到的方案 1（纯 TypeScript 端处理）**无法工作**，因为：
- TypeScript 可以创建临时账户
- TypeScript 可以发送 swap 指令
- **但 TypeScript 无法关闭临时账户**（缺少 PDA 签名）

---

## ✅ 正确的解决方案：混合方案（Rust + TypeScript）

### 架构设计

```
TypeScript 端:
1. 检测 WSOL 输入
2. 创建临时账户 (CreateAccount + InitializeAccount)
3. 将临时账户地址传入 remaining_accounts
4. 发送 swap 指令

合约端（Rust）:
1. 接收临时账户地址
2. 使用临时账户执行 swap (CPI 到 Raydium)
3. swap 成功后，检测临时账户
4. 关闭临时账户（使用 PDA 签名）
5. 租金返回给 vault PDA
```

---

## 🔨 实施细节

### Part 1: Rust 合约修改（已完成）

#### 1.1 修改 `raydium_clmm.rs`

添加了两个辅助函数：
- `is_temp_wsol_account()` - 检测是否是临时 WSOL 账户
- `close_temp_wsol_account()` - 关闭临时账户

关键实现：
```rust
// swap 成功后
if account_infos.len() > 3 {
    let input_token_account = &account_infos[3]; // userInputTokenAccount
    let vault_pda = &account_infos[0]; // payer (vault PDA)
    
    if Self::is_temp_wsol_account(input_token_account, vault_pda)? {
        Self::close_temp_wsol_account(
            input_token_account,
            vault_pda,      // 租金接收者
            vault_pda,      // authority
            signer_seeds,
        )?;
    }
}
```

#### 1.2 修改 `raydium_amm.rs`

**问题：** AMM V4 的账户结构与 CLMM 不同，vault PDA 不在传递给 DEX 的账户列表中！

**账户结构对比：**

**CLMM:**
```
dex_accounts[0] = payer (vault PDA) ✅
dex_accounts[3] = userInputTokenAccount (可能是临时账户)
```

**AMM V4:**
```
dex_accounts[0] = TOKEN_PROGRAM_ID
dex_accounts[15] = userInputTokenAccount (可能是临时账户)
vault PDA 不在 dex_accounts 中 ❌
```

**解决方案：**  
需要修改 `send_trade_signal` 传递额外的 vault PDA 引用给 AMM。

---

### Part 2: TypeScript 修改（待完成）

#### 2.1 当前实现（test.ts L921-1016）

```typescript
// ✅ 已实现：创建临时 WSOL 账户
if (tokenIn.equals(WSOL_MINT)) {
  tempWsolKeypair = Keypair.generate();
  actualInputTokenAccount = tempWsolKeypair.publicKey;
  
  transaction.add(
    SystemProgram.createAccount({ ... }),
    createInitializeAccountInstruction(...)
  );
  
  // 替换 remainingAccounts 中的输入账户
  remainingAccounts[5 或 17] = actualInputTokenAccount;
}

// ❌ 不工作：尝试在 TypeScript 关闭账户
if (tempWsolKeypair) {
  transaction.add(
    createCloseAccountInstruction(
      tempWsolKeypair.publicKey,
      signerKeypair.publicKey,
      vaultPda  // ❌ TypeScript 无法提供 PDA 签名！
    )
  );
}
```

#### 2.2 需要的修改

**移除 TypeScript 端的关闭指令：**
```typescript
// 🔧 暂时不关闭临时账户
// TODO: 需要合约支持在 swap 后关闭临时账户
// 因为关闭账户需要 vault PDA 签名，TypeScript 端无法提供
if (tempWsolKeypair) {
  console.log("\n⚠️  注意：临时 WSOL 账户不会被关闭（需要合约支持）");
  console.log("  临时账户地址:", tempWsolKeypair.publicKey.toString());
}
```

**改为：**
```typescript
// ✅ 合约端会自动关闭临时账户
if (tempWsolKeypair) {
  console.log("\n✅ 创建了临时 WSOL 账户");
  console.log("  临时账户地址:", tempWsolKeypair.publicKey.toString());
  console.log("  合约会在 swap 后自动关闭此账户并回收租金");
}
```

---

## 📊 完整流程图

```
┌─────────────────────────────────────────────────────────┐
│ TypeScript (test.ts)                                    │
├─────────────────────────────────────────────────────────┤
│ 1. 检测 tokenIn == WSOL                                  │
│ 2. 生成临时 keypair                                      │
│ 3. 添加 createAccount 指令                              │
│ 4. 添加 initializeAccount 指令                          │
│ 5. 替换 remainingAccounts[X] 为临时账户                 │
│ 6. 添加 sendTradeSignal 指令                            │
│ 7. 发送交易（签名者：signer + tempKeypair）             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 合约 (send_trade_signal)                                │
├─────────────────────────────────────────────────────────┤
│ 1. 验证权限                                             │
│ 2. 检查余额                                             │
│ 3. 调用 DEX 集成层                                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ CLMM/AMM (execute_swap_signed)                          │
├─────────────────────────────────────────────────────────┤
│ 1. 构建 swap 指令                                       │
│ 2. 执行 CPI 到 Raydium (invoke_signed)                  │
│ 3. ✅ swap 成功                                         │
│ 4. 检测临时 WSOL 账户                                   │
│    - 检查 owner == vault PDA                            │
│    - 检查 mint == WSOL                                  │
│ 5. 关闭临时账户 (invoke_signed)                         │
│    - 使用 vault PDA 签名                                │
│    - 租金返回给 vault PDA                               │
└─────────────────────────────────────────────────────────┘
```

---

## 🧪 测试步骤

### 1. 编译合约
```bash
cd PersonalVault
anchor build
```

### 2. 部署合约（如果需要）
```bash
./dev_deploy.sh  # 或 ./dev_update.sh
```

### 3. 运行测试
```bash
cd test
npx ts-node test.ts
```

### 4. 验证结果

检查交易日志中的关键信息：
```
✅ 创建了临时 WSOL 账户
  临时账户地址: 7EEki7Wg...
  合约会在 swap 后自动关闭此账户并回收租金
  
... swap 执行 ...

🔍 检测到临时 WSOL 账户，准备关闭...
  临时账户地址: 7EEki7Wg...
  Vault PDA: 5X4zZ8...
✅ 临时 WSOL 账户已关闭，租金已返回
```

---

## ⚠️ 已知限制

### 1. AMM V4 暂不支持自动关闭
由于 AMM V4 的账户结构，vault PDA 不在传递给 DEX 的账户列表中。

**临时解决方案：**
1. 优先使用 CLMM 池子进行 WSOL swap
2. 如果必须使用 AMM V4，需要修改合约架构

**长期解决方案：**
修改 `send_trade_signal` 的 `remaining_accounts` 结构，确保 vault PDA 始终可访问。

### 2. 租金回收
临时账户的租金（约 0.002 SOL）会返回给 vault PDA，而不是原始交易发起者。

**影响：**
- 对用户透明，vault 余额略微增加
- 不影响交易的正确性

---

## 📝 后续 TODO

1. ✅ 修改 `raydium_clmm.rs` - 添加关闭逻辑
2. ⏳ 修改 `raydium_amm.rs` - 需要架构调整
3. ⏳ 更新 `test.ts` - 移除 TypeScript 端的关闭指令
4. ⏳ 测试 WSOL swap - 验证自动关闭
5. ⏳ 更新文档 - 记录最终方案

---

## 🎯 总结

**方案 1（纯 TypeScript）** ❌ 不可行
- 原因：无法提供 PDA 签名来关闭临时账户

**混合方案（Rust + TypeScript）** ✅ 可行
- TypeScript：创建临时账户
- Rust：关闭临时账户（使用 PDA 签名）
- 已在 CLMM 中实现
- AMM V4 需要进一步调整

**关键洞察：**
PDA 签名只能在合约端提供，因此任何需要 PDA 签名的操作（如关闭 PDA 拥有的账户）都必须在 Rust 端完成。
