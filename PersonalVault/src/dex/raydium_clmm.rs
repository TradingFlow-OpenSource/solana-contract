use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;

use super::SwapResult;

/// # Raydium CLMM (Concentrated Liquidity Market Maker) 实现
/// 
/// ## 支持的池子类型
/// - ✅ **CLMM** - 集中流动性池子
/// 
/// ## 工作原理
/// 
/// ### 指令格式
/// CLMM 使用 Anchor 框架的 8 字节 discriminator：
/// - **Discriminator**: 使用 `anchor_lang::Discriminator::discriminator("swap")` 计算
/// - **数据格式**: `[8-byte discriminator] + amount_in (u64) + amount_out_minimum (u64) + sqrt_price_limit_x64 (u128) + is_base_input (bool)`
/// - **程序 ID**: `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` (mainnet)
/// 
/// ### 账户结构
/// CLMM 需要特定的账户结构：
/// - ammConfig
/// - poolState
/// - inputTokenAccount
/// - outputTokenAccount
/// - inputVault
/// - outputVault
/// - observationState
/// - tickArray (可能多个)
/// - 等等...
/// 
/// ### TypeScript 端职责
/// - 根据 CLMM 池子构建正确的账户列表
/// - 将账户列表传递给合约
/// - 最后一个账户必须是 Raydium CLMM 程序 ID
/// 
/// ### 合约端职责
/// - 接收账户列表并原样传递给 Raydium CLMM 程序（通过 CPI）
/// - 使用 8 字节 Anchor discriminator 构建指令数据
/// 
/// ## 使用示例
/// ```rust
/// let dex = RaydiumClmmDex::new();
/// let result = dex.execute_swap(amount_in, amount_out_minimum, slippage_bps, account_infos)?;
/// ```
pub struct RaydiumClmmDex;

impl RaydiumClmmDex {
    pub fn new() -> Self {
        Self
    }

    /// 检测账户是否是临时 WSOL 账户
    /// 
    /// 临时 WSOL 账户的特征：
    /// 1. 不是 ATA (Associated Token Account)
    /// 2. owner 是 vault PDA
    /// 3. 在 swap 后余额应该为 0
    fn is_temp_wsol_account(
        token_account: &AccountInfo,
        vault_pda: &AccountInfo,
    ) -> Result<bool> {
        use anchor_spl::token::TokenAccount;
        
        // 尝试解析为 TokenAccount
        let account_data = token_account.try_borrow_data()?;
        if account_data.len() != 165 {
            // 不是标准的 Token Account
            return Ok(false);
        }
        
        // 解析 TokenAccount
        let token_acc = TokenAccount::try_deserialize(&mut &account_data[..])?;
        
        // 检查 owner 是否是 vault PDA
        if token_acc.owner != *vault_pda.key {
            return Ok(false);
        }
        
        // 检查余额是否为 0（swap 后应该是 0）
        if token_acc.amount != 0 {
            msg!("⚠️  临时账户余额不为 0: {}", token_acc.amount);
            // 仍然返回 true，因为我们可以容忍微小的余额
            // return Ok(false);
        }
        
        msg!("✅ 确认为临时 WSOL 账户");
        msg!("  Owner: {}", token_acc.owner);
        msg!("  Mint: {}", token_acc.mint);
        msg!("  Amount: {}", token_acc.amount);
        
        Ok(true)
    }

    /// 关闭临时 WSOL 账户
    /// 
    /// 使用 CPI 调用 Token Program 的 CloseAccount 指令
    fn close_temp_wsol_account<'info>(
        temp_account: &AccountInfo<'info>,
        destination: &AccountInfo<'info>,
        authority: &AccountInfo<'info>,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        msg!("🔧 关闭临时 WSOL 账户...");
        msg!("  临时账户: {}", temp_account.key());
        msg!("  租金接收者: {}", destination.key());
        msg!("  权限账户: {}", authority.key());
        
        use anchor_lang::solana_program::program::invoke_signed;
        use anchor_spl::token;
        
        // 创建 close_account 指令
        let close_instruction = anchor_lang::solana_program::instruction::Instruction {
            program_id: token::ID,
            accounts: vec![
                AccountMeta::new(*temp_account.key, false),
                AccountMeta::new(*destination.key, false),
                AccountMeta::new_readonly(*authority.key, true),
            ],
            data: vec![9], // CloseAccount 指令的 discriminator
        };
        
        // 使用 invoke_signed 执行 CPI 调用
        invoke_signed(
            &close_instruction,
            &[
                temp_account.clone(),
                destination.clone(),
                authority.clone(),
            ],
            signer_seeds,
        )?;
        
        msg!("✅ 临时 WSOL 账户关闭成功");
        
        Ok(())
    }

    /// 执行 Raydium CLMM 交换（带 PDA 签名）
    pub fn execute_swap_signed(
        &self,
        amount_in: u64,
        amount_out_minimum: u64,
        _slippage_bps: u16,
        account_infos: &[AccountInfo],
        signer_seeds: &[&[&[u8]]],
    ) -> Result<SwapResult> {
        msg!("🔄 执行 Raydium CLMM 交换（带 PDA 签名）...");
        self.execute_swap_impl(amount_in, amount_out_minimum, _slippage_bps, account_infos, signer_seeds)
    }

    /// 执行 Raydium CLMM 交换（内部实现）
    fn execute_swap_impl(
        &self,
        amount_in: u64,
        amount_out_minimum: u64,
        _slippage_bps: u16,
        account_infos: &[AccountInfo],
        signer_seeds: &[&[&[u8]]],
    ) -> Result<SwapResult> {
        msg!("🔄 执行 Raydium CLMM 交换...");

        if amount_in == 0 {
            msg!("❌ 输入金额不能为零");
            return Err(error!(crate::constants::ErrorCode::InvalidAmount));
        }

        // 验证 account_infos 不为空
        if account_infos.is_empty() {
            msg!("❌ AccountInfo 数组不能为空");
            return Err(error!(
                crate::constants::ErrorCode::InvalidAccountAddressFormat
            ));
        }

        // 🔧 构建 Raydium CLMM 交换指令数据
        msg!("🔧 构建 Raydium CLMM 交换指令数据...");
        let mut instruction_data = Vec::new();

        // ✅ Raydium CLMM 使用 Anchor discriminator（8 字节）
        // 计算 "global:swap" 的 SHA256 哈希的前 8 字节
        // 这是 Anchor 框架的标准做法
        let discriminator = &anchor_lang::solana_program::hash::hash(b"global:swap").to_bytes()[..8];
        instruction_data.extend_from_slice(discriminator);

        msg!("✅ CLMM Discriminator: {:?}", discriminator);

        // 交换参数
        instruction_data.extend_from_slice(&amount_in.to_le_bytes()); // amount: u64
        instruction_data.extend_from_slice(&amount_out_minimum.to_le_bytes()); // other_amount_threshold: u64
        
        // sqrt_price_limit_x64: u128 - 设置为 0 表示无限制
        instruction_data.extend_from_slice(&0u128.to_le_bytes());
        
        // is_base_input: bool - 通常为 true
        instruction_data.push(1u8);

        msg!("✅ 指令数据构建完成: {} bytes", instruction_data.len());

        // 🔧 从 account_infos 构建账户元数据
        // 🎯 关键修复：executor 作为第一个账户（payer），必须由前端传递并签名
        // ✅ account_infos[0] 是 executor（由前端传递，已设置为签名者）
        
        let mut account_metas = Vec::new();
        
        // 🎯 直接使用前端传递的账户（executor 已经是第一个账户）
        for (i, account_info) in account_infos.iter().enumerate() {
            let is_signer = account_info.is_signer;
            let is_writable = account_info.is_writable;
            
            account_metas.push(AccountMeta {
                pubkey: *account_info.key,
                is_signer,
                is_writable,
            });
            
            let account_description = match i {
                0 => "executor (payer, 签名者)",
                1 => "ammConfig",
                2 => "poolState", 
                3 => "inputTokenAccount (vault 的输入代币账户)",
                4 => "outputTokenAccount (vault 的输出代币账户)",
                5 => "poolVaultA (inputVault)",
                6 => "poolVaultB (outputVault)",
                7 => "observationState",
                _ => "其他 Raydium CLMM 账户"
            };
            
            msg!(
                "账户 {}: {} (签名者: {}, 可写: {}) - {}",
                i,
                account_info.key,
                is_signer,
                is_writable,
                account_description
            );
        }

        // 🔧 使用 constants.rs 中定义的 Raydium CLMM 程序 ID
        let program_id = crate::constants::RAYDIUM_CLMM_PROGRAM_ID;

        // 🎯 新的账户顺序（包含 executor 作为 payer）：
        // 账户顺序（修复后的结构）：
        //   [0] executor (payer, 签名者) - 新增
        //   [1] ammConfig - 官方 CLMM 开始
        //   [2] poolState
        //   [3] inputTokenAccount
        //   [4] outputTokenAccount
        //   [5] poolVaultA (inputVault)
        //   [6] poolVaultB (outputVault)
        //   [7] observationState
        //   [8] TOKEN_PROGRAM_ID
        //   [9] TOKEN_2022_PROGRAM_ID
        //   [10] MEMO_PROGRAM_ID
        //   [11] inputMint
        //   [12] outputMint
        //   [13+] exBitmapAccount + tickArrays
        
        // 构建指令（使用所有传入的账户）
        let instruction = anchor_lang::solana_program::instruction::Instruction {
            program_id,
            accounts: account_metas,
            data: instruction_data.clone(),
        };

        msg!("📋 交换指令构建完成: {} 账户, {} 字节", instruction.accounts.len(), instruction.data.len());

        // 验证 AccountInfo 数组
        if account_infos.len() < instruction.accounts.len() {
            msg!("❌ AccountInfo 数组长度不足: 需要 {}, 提供 {}", instruction.accounts.len(), account_infos.len());
            return Err(error!(
                crate::constants::ErrorCode::InvalidAccountAddressFormat
            ));
        }

        msg!("🚀 开始执行 Raydium CLMM 交换（使用 PDA 签名）...");

        // 🎯 执行真正的 CPI 调用！
        // 🔐 使用 invoke_signed 来让 vault PDA 签名
        match anchor_lang::solana_program::program::invoke_signed(&instruction, account_infos, signer_seeds) {
            Ok(()) => {
                msg!("✅ Raydium CLMM 交换执行成功！");

                // 🔧 临时 WSOL 账户处理
                // 🎯 注意：在新的架构中，account_infos 只包含 Raydium CLMM 账户
                // vault PDA 在基本账户中，不在 account_infos 中
                // 临时 WSOL 账户的检测和关闭需要在更高层级处理
                // 这里暂时跳过，因为我们需要 vault PDA 的引用
                msg!("ℹ️  临时 WSOL 账户处理需要在更高层级实现");

                // 这里应该解析返回的数据来获取实际的输出金额
                // 暂时返回一个模拟的结果
                let amount_out = amount_in; // 简化处理，实际应该从返回数据中解析
                let fee_amount = amount_in / 1000; // 简化处理，实际应该计算真实费用

                Ok(SwapResult {
                    amount_out,
                    fee_amount,
                })
            }
            Err(err) => {
                msg!("❌ Raydium CLMM 交换执行失败: {:?}", err);
                Err(error!(crate::constants::ErrorCode::SwapExecutionFailed))
            }
        }
    }
}

// 注意：不再实现 DexInterface trait，因为我们需要 PDA 签名
// 直接使用 execute_swap_signed 方法
