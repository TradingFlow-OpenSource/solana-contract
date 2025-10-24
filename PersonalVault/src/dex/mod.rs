pub mod raydium_amm;
pub mod raydium_clmm;

use anchor_lang::prelude::*;

// 重导出 Raydium DEX 类型
pub use raydium_amm::RaydiumAmmDex;
pub use raydium_clmm::RaydiumClmmDex;

/// DEX 交换结果
#[derive(Debug, Clone)]
pub struct SwapResult {
    pub amount_out: u64,
    pub fee_amount: u64,
}

/// DEX 抽象接口
pub trait DexInterface {
    /// 获取 DEX 名称
    fn name(&self) -> &'static str;

    /// 执行交换
    /// 注意：程序 ID 应该作为 account_infos 的最后一个账户传递
    fn execute_swap(
        &self,
        amount_in: u64,
        amount_out_minimum: u64,
        slippage_bps: u16,
        account_infos: &[AccountInfo],
    ) -> Result<SwapResult>;
}

/// 通用的交换执行器
pub struct SwapExecutor;

impl SwapExecutor {
    /// 执行交换（使用 remaining_accounts）
    /// pool_type: 0 = AMM V4, 1 = CLMM
    /// signer_seeds: PDA 签名种子（用于 CPI 调用）
    pub fn execute_swap_with_remaining_accounts(
        remaining_accounts: &[AccountInfo],
        amount_in: u64,
        amount_out_minimum: u64,
        slippage_bps: u16,
        pool_type: u8,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<SwapResult> {
        msg!("🔄 SwapExecutor: 池子类型 = {}", pool_type);
        
        match pool_type {
            0 => {
                msg!("✅ 使用 Raydium AMM V4");
                let dex = raydium_amm::RaydiumAmmDex::new();
                dex.execute_swap_signed(
                    amount_in,
                    amount_out_minimum,
                    slippage_bps,
                    remaining_accounts,
                    signer_seeds,
                )
            }
            1 => {
                msg!("✅ 使用 Raydium CLMM");
                let dex = raydium_clmm::RaydiumClmmDex::new();
                dex.execute_swap_signed(
                    amount_in,
                    amount_out_minimum,
                    slippage_bps,
                    remaining_accounts,
                    signer_seeds,
                )
            }
            _ => {
                msg!("❌ 不支持的池子类型: {}", pool_type);
                Err(error!(crate::constants::ErrorCode::InvalidPoolType))
            }
        }
    }
}

/// DEX 类型枚举
#[derive(Debug, Clone, Copy)]
pub enum DexType {
    /// Raydium AMM V4（传统恒定乘积池子）
    RaydiumAmm,
    /// Raydium CLMM（集中流动性池子）
    RaydiumClmm,
}
