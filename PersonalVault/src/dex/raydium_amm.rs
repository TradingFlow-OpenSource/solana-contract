use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token::spl_token;

use super::SwapResult;

/// # Raydium AMM V4 实现
/// 
/// ## 支持的池子类型
/// - ✅ **AMM V4** - 传统的恒定乘积做市商池子
/// 
/// ## 工作原理
/// 
/// ### 指令格式
/// AMM V4 使用简单的单字节指令 ID：
/// - **指令 ID**: 9 (swap fixed in)
/// - **数据格式**: `[9u8] + amount_in (u64) + amount_out_minimum (u64)`
/// - **程序 ID**: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` (mainnet)
/// 
/// ### 账户结构
/// AMM V4 需要 18 个账户（包括 Serum/OpenBook 市场账户）
/// 
/// ### TypeScript 端职责
/// - 根据 AMM V4 池子构建正确的 18 个账户列表
/// - 将账户列表传递给合约
/// - 最后一个账户必须是 Raydium AMM V4 程序 ID
/// 
/// ### 合约端职责
/// - 接收账户列表并原样传递给 Raydium AMM V4 程序（通过 CPI）
/// - 使用单字节指令 ID (9) 构建指令数据
/// 
/// ## 使用示例
/// ```rust
/// let dex = RaydiumAmmDex::new();
/// let result = dex.execute_swap(amount_in, amount_out_minimum, slippage_bps, account_infos)?;
/// ```
pub struct RaydiumAmmDex;

impl RaydiumAmmDex {
    pub fn new() -> Self {
        Self
    }

    /// 执行 Raydium AMM V4 交换（带 PDA 签名）
    pub     fn execute_swap_signed(
        &self,
        amount_in: u64,
        amount_out_minimum: u64,
        _slippage_bps: u16,
        account_infos: &[AccountInfo],
        signer_seeds: &[&[&[u8]]],
    ) -> Result<SwapResult> {
        msg!("🔄 执行 Raydium AMM V4 交换（带 PDA 签名）...");
        self.execute_swap_impl(amount_in, amount_out_minimum, _slippage_bps, account_infos, signer_seeds)
    }

    /// 执行 Raydium AMM V4 交换（内部实现）
    fn execute_swap_impl(
        &self,
        amount_in: u64,
        amount_out_minimum: u64,
        _slippage_bps: u16,
        account_infos: &[AccountInfo],
        signer_seeds: &[&[&[u8]]],
    ) -> Result<SwapResult> {
        msg!("🔄 执行 Raydium AMM V4 交换...");
        msg!("输入金额: {}", amount_in);
        msg!("最小输出金额: {}", amount_out_minimum);

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

        msg!("✅ 收到 {} 个账户用于交换", account_infos.len());

        // 🔧 构建 Raydium AMM V4 交换指令数据
        msg!("🔧 构建 Raydium AMM V4 交换指令数据...");
        let mut instruction_data = vec![];

        // ✅ Raydium AMM V4 交换指令标识符（instruction: 9）
        // AMM V4 是非 Anchor 程序，使用单字节指令 ID
        instruction_data.extend_from_slice(&[9u8]); // instruction = 9 (swap fixed in)

        // 交换参数（按照官方 SDK 的 struct 布局）
        instruction_data.extend_from_slice(&amount_in.to_le_bytes()); // amountIn: u64
        instruction_data.extend_from_slice(&amount_out_minimum.to_le_bytes()); // minAmountOut: u64

        msg!("✅ Raydium AMM V4 交换指令数据构建完成:");
        msg!("  指令ID: 9 (swap fixed in)");
        msg!(
            "  输入金额: {} ({} bytes)",
            amount_in,
            amount_in.to_le_bytes().len()
        );
        msg!(
            "  最小输出金额: {} ({} bytes)",
            amount_out_minimum,
            amount_out_minimum.to_le_bytes().len()
        );
        msg!("  总数据大小: {} bytes", instruction_data.len());

        // 🔧 从 account_infos 构建账户元数据
        let mut account_metas = Vec::new();
        for (i, account_info) in account_infos.iter().enumerate() {
            account_metas.push(AccountMeta {
                pubkey: *account_info.key,
                is_signer: account_info.is_signer,
                is_writable: account_info.is_writable,
            });
            msg!(
                "账户 {}: {} (签名者: {}, 可写: {})",
                i,
                account_info.key,
                account_info.is_signer,
                account_info.is_writable
            );
        }

        msg!("✅ 使用预先准备的数据执行交换...");
        msg!("✅ 指令数据大小: {} 字节", instruction_data.len());
        msg!("✅ 账户元数据数量: {}", account_metas.len());

        // 🔧 使用 constants.rs 中定义的 Raydium AMM 程序 ID
        let program_id = crate::constants::RAYDIUM_AMM_PROGRAM_ID;
        msg!("✅ 使用 Raydium AMM V4 程序 ID: {}", program_id);

        // 构建指令（使用所有传入的账户）
        let instruction = anchor_lang::solana_program::instruction::Instruction {
            program_id,
            accounts: account_metas,
            data: instruction_data.clone(),
        };

        msg!("📋 交换指令构建完成:");
        msg!("  程序 ID: {}", instruction.program_id);
        msg!("  账户数量: {}", instruction.accounts.len());
        msg!("  数据大小: {} 字节", instruction.data.len());

        // 🔧 验证 AccountInfo 数组
        msg!("🔧 验证 CPI 调用所需的 AccountInfo 数组...");
        
        if account_infos.len() < instruction.accounts.len() {
            msg!("❌ AccountInfo 数组长度不足");
            msg!("  需要: {} 个账户", instruction.accounts.len());
            msg!("  提供: {} 个账户", account_infos.len());
            return Err(error!(
                crate::constants::ErrorCode::InvalidAccountAddressFormat
            ));
        }

        msg!("✅ AccountInfo 数组验证通过");
        msg!("🚀 开始执行 Raydium AMM V4 交换（使用 PDA 签名）...");

        // 🎯 执行真正的 CPI 调用！
        // 🔐 使用 invoke_signed 来让 vault PDA 签名
        match anchor_lang::solana_program::program::invoke_signed(&instruction, account_infos, signer_seeds) {
            Ok(()) => {
                msg!("✅ Raydium AMM V4 交换执行成功！");

                // 🔧 检测并关闭临时 WSOL 账户
                // AMM V4 account_infos 结构（从 DEX 账户开始）：
                // [0] TOKEN_PROGRAM_ID
                // [1] poolState
                // [2] poolAuthority
                // [3] poolOpenOrders
                // [4] poolTargetOrders
                // [5] poolVaultA
                // [6] poolVaultB
                // [7] marketProgramId
                // [8] marketId
                // [9] marketBids
                // [10] marketAsks
                // [11] marketEventQueue
                // [12] marketBaseVault
                // [13] marketQuoteVault
                // [14] marketAuthority
                // [15] userInputTokenAccount  <-- 可能是临时 WSOL 账户
                // [16] userOutputTokenAccount
                // [17] raydium_program (已在 TypeScript 端添加)
                if account_infos.len() > 16 {
                    // vault PDA 不在这个列表中，需要从更早的位置获取
                    // 假设 vault PDA 在 account_infos 的开始位置（需要调用者正确传递）
                    // 实际上，我们需要从外部传入 vault PDA
                    // 暂时使用一个占位实现
                    msg!("ℹ️  AMM V4: 暂不支持自动关闭临时 WSOL 账户");
                    msg!("  需要从外部传入 vault PDA 引用");
                }
                
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
                msg!("❌ Raydium AMM V4 交换执行失败: {:?}", err);
                Err(error!(crate::constants::ErrorCode::SwapExecutionFailed))
            }
        }
    }

    /// 检测是否是临时 WSOL 账户
    /// 临时账户特征：owner 是 vault PDA，且 mint 是 WSOL
    fn is_temp_wsol_account<'info>(
        token_account: &AccountInfo<'info>,
        vault_pda: &AccountInfo<'info>,
    ) -> Result<bool> {
        // 解析代币账户数据
        let data = token_account.try_borrow_data()?;
        
        // Token Account 布局：
        // - mint: Pubkey (32 bytes, offset 0)
        // - owner: Pubkey (32 bytes, offset 32)
        // - amount: u64 (8 bytes, offset 64)
        
        if data.len() < 165 {
            return Ok(false);
        }
        
        // 检查 owner 是否是 vault PDA
        let owner = &data[32..64];
        let vault_key_bytes = vault_pda.key().to_bytes();
        if owner != vault_key_bytes {
            return Ok(false);
        }
        
        // 检查 mint 是否是 WSOL
        let mint = &data[0..32];
        let wsol_mint = crate::constants::WSOL_MINT.to_bytes();
        if mint != wsol_mint {
            return Ok(false);
        }
        
        msg!("  ✅ 检测到临时 WSOL 账户（owner = vault, mint = WSOL）");
        Ok(true)
    }

    /// 关闭临时 WSOL 账户
    fn close_temp_wsol_account<'info>(
        temp_account: &AccountInfo<'info>,
        destination: &AccountInfo<'info>,
        authority: &AccountInfo<'info>,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        msg!("🔧 开始关闭临时 WSOL 账户...");
        msg!("  临时账户: {}", temp_account.key());
        msg!("  租金接收者: {}", destination.key());
        msg!("  权限账户: {}", authority.key());

        // 构建 CloseAccount 指令
        let close_ix = spl_token::instruction::close_account(
            &spl_token::ID,
            temp_account.key,
            destination.key,
            authority.key,
            &[],
        )?;

        // 准备账户列表
        let account_infos = &[
            temp_account.clone(),
            destination.clone(),
            authority.clone(),
        ];

        // 使用 PDA 签名执行 CPI
        invoke_signed(&close_ix, account_infos, signer_seeds)?;

        msg!("✅ 临时账户关闭成功");
        Ok(())
    }
}

// 注意：不再实现 DexInterface trait，因为我们需要 PDA 签名
// 直接使用 execute_swap_signed 方法
