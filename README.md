# PersonalVault Solana 合约

## 项目概述

PersonalVault 是一个基于 Solana 的去中心化个人资产管理合约，允许用户安全地存储、管理和交易多种代币资产。合约采用 Anchor 框架开发，提供了完整的资产管理和 DEX 集成功能。

## 核心功能

### 1. 账户管理
- **全局配置 (GlobalConfig)**: 存储管理员和机器人地址，控制系统级权限
- **个人金库 (PersonalVault)**: 每个用户独立的资产管理账户，支持多币种余额管理

### 2. 资产操作
- **存款功能**: 
  - `user_deposit`: 存入 SPL 代币（如 USDC）
  - `user_deposit_sol`: 存入原生 SOL
- **取款功能**:
  - `user_withdraw`: 取出 SPL 代币
  - `user_withdraw_sol`: 取出原生 SOL
- **余额查询**: 实时查询各代币余额

### 3. 交易功能
- **自动交易信号 (send_trade_signal)**: 
  - 支持管理员或授权机器人发起交易
  - 集成 Raydium CLMM DEX
  - 自动处理代币交换
  - 支持滑点保护

### 4. 权限管理
- **管理员权限**: 可以设置机器人地址、发起交易信号
- **机器人权限**: 可以代表用户发起自动交易
- **用户权限**: 控制自己的资产存取

## 测试脚本功能 (test.ts)

### 测试流程

#### 步骤 1: 初始化全局配置
```typescript
initializeGlobalConfig(botAddress)
```
- 创建全局配置 PDA 账户
- 设置管理员和机器人地址
- 只需执行一次

#### 步骤 2: 创建余额管理器
```typescript
createBalanceManager(globalConfigPda, userKeypair)
```
- 为每个用户创建独立的金库 PDA 账户
- 初始化用户的资产管理结构
- 支持多币种余额追踪

#### 步骤 3: 资产存取测试
```typescript
// SOL 存款
userDepositSol(vaultPda, amount, userKeypair)

// SPL 代币存款（如 USDC）
userDeposit(vaultPda, mint, amount, userKeypair)

// 余额查询
getBalance(vaultPda, tokenMint)

// 取款操作
userWithdrawSol(vaultPda, amount, userKeypair)
userWithdraw(vaultPda, mint, amount, userKeypair)
```

#### 步骤 4: DEX 交易集成测试
```typescript
sendTradeSignal(
  vaultPda,
  tokenIn,      // 输入代币（如 WSOL）
  tokenOut,     // 输出代币（如 USDC）
  amountIn,     // 输入金额
  slippageBps,  // 滑点（基点）
  signerKeypair, // 签名者（管理员或机器人）
  userKeypair   // 金库所有者
)
```

### 测试特性

1. **自动连接管理**: 
   - 支持多个 RPC 端点自动切换
   - 连接失败自动重试

2. **账户检查**:
   - 自动检查账户是否已存在
   - 避免重复初始化

3. **余额验证**:
   - 操作前后自动验证余额变化
   - 确保交易正确执行

4. **详细日志**:
   - 完整的交易签名输出
   - Solana Explorer 链接自动生成
   - 错误日志详细记录

### 使用方式

```bash
# 安装依赖
npm install

# 运行完整测试流程
npx ts-node test/test.ts

# 单独测试 Raydium 集成
npx ts-node test/raydium/test_raydium_sdk_swap.ts
```

### 测试环境

- **网络**: Solana Devnet
- **程序 ID**: `FFbZem3yLs4Pr4LoXJPuqFp7CJsDvaYj9xQEkYboTaoJ`
- **测试用户**: 
  - admin: 管理员账户
  - user1/user2: 普通用户账户
  - bot: 自动化机器人账户

### 关键文件

- `test/test.ts`: 主测试脚本
- `test/raydium/constants.ts`: 共享常量和地址
- `test/raydium/raydium.ts`: Raydium DEX 集成逻辑
- `test/raydium/event_log.ts`: 事件日志解析
