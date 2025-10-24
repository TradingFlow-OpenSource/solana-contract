# Raydium CLMM 集成修复方案

## 问题诊断

测试失败的根本原因：
```
Program log: AnchorError occurred. Error Code: InstructionFallbackNotFound. Error Number: 101. 
Error Message: Fallback functions are not supported.
```

### 核心问题

1. **Raydium CLMM 是 Anchor 程序**，使用 8 字节 discriminator 识别指令
2. **我们的实现使用单字节指令 ID (9)**，这在非 Anchor 程序（如 AMM V4）中有效
3. **Anchor discriminator 计算方式**：`sha256("global:instruction_name")[0..8]`

## 解决方案选项

### 选项 1：手动计算 Anchor Discriminator（不推荐）
```rust
// 需要为每个指令计算 discriminator
// 例如：sha256("global:swap_base_input")[0..8]
let discriminator = [0x8e, 0x3d, 0x9c, 0x18, 0x6e, 0x2f, 0x7a, 0x4b]; // 示例
```

**问题**：
- Raydium CLMM IDL 不完全公开
- 指令名称可能随版本变化
- 维护成本高

### 选项 2：使用 Raydium SDK 构建指令（推荐）
```typescript
// 在 TypeScript 端使用官方 SDK
import { Raydium, SwapCompute } from '@raydium-io/raydium-sdk-v2';

const raydium = await Raydium.load({...});
const { execute } = await raydium.clmm.swap({
  poolInfo: clmmPoolInfo,
  inputMint: tokenIn,
  amountIn: amount,
  slippage: slippage / 10000,
  txVersion: TxVersion.V0,
});

// SDK 会生成正确的指令数据和账户
```

### 选项 3：直接使用原始 CPI 调用（当前方法的改进）

由于我们在链上程序中，最好的方法是：

1. **让 TypeScript 端负责构建完整的指令数据**
2. **Rust 端只负责转发 CPI 调用**

## 推荐实现

###  TypeScript 端（test.ts）

```typescript
// 使用 Raydium SDK V2 构建 swap 指令
const raydium = await initSdk();
const clmmData = await raydium.clmm.getPoolInfoFromRpc(poolId);

// 获取 swap 指令的完整数据
const { execute } = await raydium.clmm.swap({
  poolInfo: clmmData.poolInfo,
  poolKeys: clmmData.poolKeys,
  inputMint: tokenIn,
  amountIn: amountIn,
  slippage: slippageBps / 10000,
  computeBudgetConfig: {
    units: 1_000_000,
    microLamports: 1,
  },
});

// 提取指令数据和账户
const swapIx = execute.transaction.instructions[0];
const instructionData = swapIx.data;
const accountMetas = swapIx.keys;
```

### Rust 端（src/dex/raydium_amm_clmm.rs）

```rust
// 不再手动构建指令数据，而是接收预构建的数据
pub fn execute_swap_with_prebuilt_data(
    &self,
    instruction_data: Vec<u8>,  // 从 SDK 获取的完整指令数据
    account_infos: &[AccountInfo],
) -> Result<SwapResult> {
    // 直接使用提供的数据执行 CPI
    let instruction = Instruction {
        program_id: *account_infos[account_infos.len() - 1].key,
        accounts: account_metas,
        data: instruction_data,  // 使用 SDK 生成的数据
    };
    
    invoke(&instruction, account_infos)?;
    
    Ok(SwapResult { amount_out: 0, fee_amount: 0 })
}
```

## 当前状态总结

- ✅ AMM V4 池子：使用简单的指令 ID (9) 可以工作
- ❌ CLMM 池子：需要 Anchor discriminator，当前实现失败
- 🔄 临时方案：暂时禁用 CLMM 支持，只支持 AMM V4
- 🎯 最终方案：集成 Raydium SDK V2 在 TypeScript 端构建正确的指令

## 下一步行动

1. **短期**：修改代码仅支持 AMM V4 池子
2. **中期**：研究 Raydium CLMM 的 CPI 示例代码
3. **长期**：使用 Raydium SDK 在客户端构建指令，链上程序只负责转发

## 参考资料

- [Raydium CLMM GitHub](https://github.com/raydium-io/raydium-clmm)
- [Raydium SDK V2](https://github.com/raydium-io/raydium-sdk-V2)
- [Raydium CPI 示例](https://github.com/raydium-io/raydium-cpi)
- [Anchor Discriminator 文档](https://www.anchor-lang.com/docs/the-accounts-struct)
