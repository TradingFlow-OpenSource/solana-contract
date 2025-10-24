use crate::dex::SwapExecutor;
use anchor_lang::prelude::*;

/// 执行 DEX 交换（使用当前配置的 DEX）
/// pool_type: 0 = Raydium AMM V4, 1 = Raydium CLMM
/// signer_seeds: PDA 签名种子（用于 CPI 调用）
pub fn execute_dex_swap(
    remaining_accounts: &[AccountInfo],
    amount_in: u64,
    amount_out_minimum: u64,
    slippage_bps: u16,
    pool_type: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<u64> {
    msg!("🔄 执行 DEX 交换...");
    msg!("输入金额: {}", amount_in);
    msg!("最小输出金额: {}", amount_out_minimum);
    msg!("池子类型: {} (0=AMM V4, 1=CLMM)", pool_type);

    // 使用新的 DEX 抽象层执行交换
    let swap_result: crate::SwapResult = SwapExecutor::execute_swap_with_remaining_accounts(
        remaining_accounts,
        amount_in,
        amount_out_minimum,
        slippage_bps,
        pool_type,  // ✅ 传递池子类型参数
        signer_seeds,  // ✅ 传递 PDA 签名种子
    )?;

    msg!("✅ DEX 交换完成，输出金额: {}", swap_result.amount_out);
    Ok(swap_result.amount_out)
}
