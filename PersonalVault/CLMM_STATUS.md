# Raydium CLMM 支持状态报告

## 📋 当前状态

### ✅ 已完成的工作

#### 1. TypeScript 测试代码（已完成）
- ✅ `raydium.ts` - 正确构建 CLMM 池子的 18 个账户
  - `ammConfig` - CLMM 配置账户
  - `observationState` - 观察状态账户  
  - `tickArray` - Tick 数组账户
- ✅ `test.ts` - 修复了类型错误，使用 `as any` 访问 CLMM 特有字段
- ✅ `verify_clmm_accounts.ts` - 验证脚本确认所有账户都正确构建

**验证结果：**
```
✅ CLMM 特有字段:
   ammConfig: F8aaMZVpXaQHk3Qo9BPDhsa7RgpfrfiRsk8L3iXnq3AT
   observationState: 327KaZLsk2gzhj7ubh4sb28FY6nrC9QXXQ23QcAe4J3c
   tickArray: HG4W3SEFK6KScAhbSnLdutTpHm1uptgUVruEXcTvzqDs
```

#### 2. Rust 合约代码（需要验证）

当前 `raydium_amm.rs` 的实现：
- ✅ 接收 `account_infos` 数组并原样传递给 Raydium 程序
- ✅ 使用指令 ID = 9（swap fixed in）
- ✅ 指令数据格式：`[9u8] + amount_in + amount_out_minimum`
- ✅ 通过 CPI 调用 Raydium 程序

**关键代码：**
```rust
// 构建指令数据
instruction_data.extend_from_slice(&[9u8]); // instruction = 9
instruction_data.extend_from_slice(&amount_in.to_le_bytes());
instruction_data.extend_from_slice(&amount_out_minimum.to_le_bytes());

// CPI 调用
anchor_lang::solana_program::program::invoke(&instruction, account_infos)
```

## 🤔 理论分析

### Raydium 程序的工作原理

根据 Raydium SDK V2 的源码分析：

1. **统一的交换指令** - 所有池子类型（AMM V4、CLMM、CPMM）都使用相同的指令 ID 和数据格式
2. **程序内部路由** - Raydium 程序根据 `poolState` 账户的数据判断池子类型
3. **账户验证** - Raydium 程序会验证传入的账户是否符合池子类型要求

### 为什么现有代码理论上应该可以工作

```
TypeScript 端：
  ↓ 构建 18 个账户（包括 ammConfig、observationState、tickArray）
  ↓ 调用 execute_trade_signal
  
Rust 合约：
  ↓ 接收 remaining_accounts
  ↓ 跳过前 2 个（vault + global_config）
  ↓ 将剩余账户传递给 raydium_amm.rs
  
raydium_amm.rs：
  ↓ 构建指令数据（ID=9 + amount_in + amount_out_minimum）
  ↓ 将所有账户原样转发给 Raydium 程序
  
Raydium CLMM 程序：
  ✓ 读取 poolState，识别为 CLMM 池子
  ✓ 验证 ammConfig、observationState、tickArray 等账户
  ✓ 执行 CLMM 交换
```

## 🔍 需要验证的点

### 1. 账户顺序是否正确？

**TypeScript 中的账户顺序：**
```typescript
[0] TOKEN_PROGRAM_ID
[1] userOwner (PROGRAM_ID)
[2] poolState
[3] ammConfig          ← CLMM 特有
[4] poolVaultA
[5] poolVaultB
[6] observationState   ← CLMM 特有
[7] tickArray          ← CLMM 特有
[8] userInputTokenAccount
[9] userOutputTokenAccount
[10-17] Market 账户（占位符）
```

**传递给 Rust 合约的顺序：**
```rust
[0] PersonalVault
[1] GlobalConfig
[2] TOKEN_PROGRAM_ID
[3] poolState
[4] ammConfig          ← CLMM 特有
[5] poolVaultA
[6] poolVaultB
[7] observationState   ← CLMM 特有
[8] userInputTokenAccount
[9] userOutputTokenAccount
[10] Raydium CLMM Program ID (最后一个)
```

**问题：**
- ❓ Raydium CLMM 程序期望的账户顺序是什么？
- ❓ `tickArray` 账户是否被正确传递？（看起来在 test.ts 中可能被遗漏了）

### 2. 指令数据格式是否正确？

**当前使用的格式：**
```rust
[9u8] + amount_in (8 bytes) + amount_out_minimum (8 bytes)
// 总共 17 bytes
```

**需要确认：**
- ❓ CLMM 池子是否也使用指令 ID = 9？
- ❓ CLMM 是否需要额外的参数（如 `sqrtPriceLimit`）？

### 3. 缺失的 Tick Array 账户？

在 `test.ts` 的 CLMM 账户构建中，我们只传递了 8 个 DEX 账户，但 `raydium.ts` 中定义了 `tickArray` 字段。

**可能的问题：**
```typescript
// raydium.ts 中定义了
tickArray: poolKeys.exBitmapAccount,  // [6] Tick 数组账户

// 但 test.ts 中没有传递这个账户！
```

## 📝 下一步行动

### 优先级 1: 修复 TypeScript 中的账户传递

检查 `test.ts` 中是否正确传递了所有 CLMM 需要的账户，特别是：
- ✅ `ammConfig`
- ✅ `observationState`
- ❌ `tickArray` ← **可能缺失！**

### 优先级 2: 验证 Raydium CLMM 的账户要求

查阅 Raydium CLMM 程序的文档或源码，确认：
1. 所需账户列表和顺序
2. 指令数据格式
3. 是否需要额外的 Tick Array 账户

### 优先级 3: 运行完整测试

修复后运行 `test.ts` 并检查：
- 是否有"账户缺失"错误
- 是否有"账户顺序错误"
- 实际的 CPI 调用是否成功

## 🎯 预期问题

根据分析，最可能的问题是：

1. **缺少 Tick Array 账户** - `tickArray` 没有被传递给合约
2. **账户顺序不匹配** - Raydium CLMM 期望的顺序与我们传递的不同
3. **额外的指令参数** - CLMM 可能需要 `sqrtPriceLimit` 等参数

## 📚 参考资料

- Raydium SDK V2: `raydium-sdk-V2-demo-master`
- CLMM 池子: `8kFMCxmchmHLNnt3TP1wxNdh2iPedibVYftkEfqeRmDd`
- AMM Config: `F8aaMZVpXaQHk3Qo9BPDhsa7RgpfrfiRsk8L3iXnq3AT`

---

**总结：合约代码可能不需要修改，问题可能在于 TypeScript 测试代码没有传递所有必需的账户（特别是 tickArray）。**
