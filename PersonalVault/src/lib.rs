use anchor_lang::prelude::*;

// 程序 ID 声明 - 必须在这里，不能在子模块中
declare_id!("FFbZem3yLs4Pr4LoXJPuqFp7CJsDvaYj9xQEkYboTaoJ");

// 导入模块
mod constants;
mod dex;
mod dex_integration;
mod instructions;
mod structs;
pub use constants::*;
pub use structs::*;
pub use dex::*;
pub use dex_integration::*;
pub use instructions::{get_token_balance, set_token_balance};

// 项目入口
/// 个人金库程序
#[program]
pub mod personal_vault {
    use super::*;
    use instructions::instructions;

    /// 初始化全局配置
    pub fn initialize_global_config(
        ctx: Context<InitializeGlobalConfig>,
        bot_address: Pubkey,
    ) -> Result<()> {
        instructions::initialize_global_config(ctx, bot_address)
    }

    /// 设置机器人地址
    pub fn set_bot(ctx: Context<SetBot>, new_bot_address: Pubkey) -> Result<()> {
        instructions::set_bot(ctx, new_bot_address)
    }

    /// 设置管理员
    pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
        instructions::set_admin(ctx, new_admin)
    }

    /// 创建余额管理器
    pub fn create_balance_manager(ctx: Context<CreateBalanceManager>) -> Result<()> {
        instructions::create_balance_manager(ctx)
    }

    /// 用户存款
    pub fn user_deposit(ctx: Context<UserDeposit>, amount: u64) -> Result<()> {
        instructions::user_deposit(ctx, amount)
    }

    /// 用户存入原生 SOL
    pub fn user_deposit_sol(ctx: Context<UserDepositSol>, amount: u64) -> Result<()> {
        instructions::user_deposit_sol(ctx, amount)
    }

    /// 用户取款
    pub fn user_withdraw(ctx: Context<UserWithdraw>, amount: u64) -> Result<()> {
        instructions::user_withdraw(ctx, amount)
    }

    /// 用户取出原生 SOL
    pub fn user_withdraw_sol(ctx: Context<UserWithdrawSol>, amount: u64) -> Result<()> {
        instructions::user_withdraw_sol(ctx, amount)
    }

    /// 获取代币余额
    pub fn get_balance(ctx: Context<GetBalance>, token: Pubkey) -> Result<u64> {
        instructions::get_balance(ctx, token)
    }

    /// 将 SOL 包装为 WSOL
    pub fn wrap_sol(ctx: Context<WrapSol>, amount: u64) -> Result<()> {
        instructions::wrap_sol(ctx, amount)
    }

    /// 将 WSOL 解包装为 SOL
    pub fn unwrap_sol(ctx: Context<UnwrapSol>, amount: u64) -> Result<()> {
        instructions::unwrap_sol(ctx, amount)
    }

    /// 发送交易信号并执行 DEX 交易
    /// pool_type: 0 = Raydium AMM V4, 1 = Raydium CLMM
    pub fn send_trade_signal(
        ctx: Context<SendTradeSignal>,
        token_in: Pubkey,
        token_out: Pubkey,
        amount_in: u64,
        slippage_bps: u16,
        pool_type: u8,
    ) -> Result<u64> {
        instructions::send_trade_signal(ctx, token_in, token_out, amount_in, slippage_bps, pool_type)
    }
}
