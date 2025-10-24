use anchor_lang::prelude::*;
use anchor_lang::system_program::System;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{ErrorCode, WSOL_MINT};

/// 代币余额结构
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TokenBalance {
    pub token: Pubkey,
    pub amount: u64,
}

/// 全局配置结构体 - 存储所有用户共享的配置
#[account]
pub struct GlobalConfig {
    /// 管理员地址
    pub admin: Pubkey,
    /// 机器人地址 - 所有用户共享
    pub bot: Pubkey,
    /// 是否已初始化
    pub is_initialized: bool,
}

/// 个人金库账户结构
#[account]
pub struct PersonalVault {
    /// 投资者地址
    pub investor: Pubkey,
    /// 是否已初始化
    pub is_initialized: bool,
    /// 重入保护标志
    pub is_locked: bool,
    /// 代币余额列表
    pub balances: Vec<TokenBalance>,
    /// PDA bump seed
    pub bump: u8,
}

/// 初始化全局配置上下文
#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 32 + 32 + 1,
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// 创建余额管理器上下文
#[derive(Accounts)]
pub struct CreateBalanceManager<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 1 + 1 + 4 + 40 * 10 + 1,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(
        seeds = [b"global_config"],
        bump,
        constraint = global_config.is_initialized @ ErrorCode::GlobalConfigNotInitialized
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// 设置机器人地址上下文
#[derive(Accounts)]
pub struct SetBot<'info> {
    #[account(
        mut,
        seeds = [b"global_config"],
        bump,
        constraint = global_config.is_initialized @ ErrorCode::GlobalConfigNotInitialized
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub admin: Signer<'info>,
}

/// 设置管理员上下文
#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(
        mut,
        seeds = [b"global_config"],
        bump,
        constraint = global_config.is_initialized @ ErrorCode::GlobalConfigNotInitialized
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub admin: Signer<'info>,
}

/// 用户存款上下文
#[derive(Accounts)]
pub struct UserDeposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// 用户的代币账户
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// 金库的代币账户
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// 用户取款上下文
#[derive(Accounts)]
pub struct UserWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// 用户的代币账户
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// 金库的代币账户
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// 用户存入 SOL 上下文
#[derive(Accounts)]
pub struct UserDepositSol<'info> {
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// 用户取出 SOL 上下文
#[derive(Accounts)]
pub struct UserWithdrawSol<'info> {
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// SOL 包装为 WSOL 上下文
#[derive(Accounts)]
pub struct WrapSol<'info> {
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// WSOL 代币账户
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = wsol_mint,
        associated_token::authority = vault
    )]
    pub wsol_account: Account<'info, TokenAccount>,

    /// WSOL mint 账户
    #[account(address = WSOL_MINT)]
    pub wsol_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// WSOL 解包装为 SOL 上下文
#[derive(Accounts)]
pub struct UnwrapSol<'info> {
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// WSOL 代币账户
    #[account(
        mut,
        associated_token::mint = wsol_mint,
        associated_token::authority = vault
    )]
    pub wsol_account: Account<'info, TokenAccount>,

    /// WSOL mint 账户
    #[account(address = WSOL_MINT)]
    pub wsol_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// 获取余额上下文
#[derive(Accounts)]
pub struct GetBalance<'info> {
    pub vault: Account<'info, PersonalVault>,
}

/// 发送交易信号上下文
/// 优化版本：将常用账户移到结构体中，减少 remaining_accounts 的复杂性
#[derive(Accounts)]
#[instruction(
    token_in: Pubkey,
    token_out: Pubkey,
    amount_in: u64,
    slippage_bps: u16
)]
pub struct SendTradeSignal<'info> {
    /// 交易执行者（管理员或Bot）
    pub executor: Signer<'info>,

    /// 金库所有者（用于账户推导）
    /// CHECK: 这个账户仅用于推导其他账户，不需要验证
    pub user: UncheckedAccount<'info>,

    /// 个人金库账户
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PersonalVault>,

    /// 全局配置账户
    #[account(
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// DEX 程序账户（用于 CPI 调用）
    /// CHECK: 这个账户是 DEX 程序 ID，将用于 invoke_signed
    pub dex_program: UncheckedAccount<'info>,
}

/// 事件定义

/// 余额管理器创建事件
#[event]
pub struct BalanceManagerCreatedEvent {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub timestamp: i64,
    pub timestamp_microseconds: u64, // 微秒时间戳
}

/// 用户存款事件
#[event]
pub struct UserDepositEvent {
    pub user: Pubkey,
    pub token: Pubkey,
    pub asset_metadata: Pubkey, // 对应 Aptos 的 Object<Metadata
    pub amount: u64,
    pub timestamp: i64,
    pub timestamp_microseconds: u64, // 微秒时间戳
}

/// 用户取款事件
#[event]
pub struct UserWithdrawEvent {
    pub user: Pubkey,
    pub token: Pubkey,
    pub asset_metadata: Pubkey, // 对应 Aptos 的 Object<Metadata
    pub amount: u64,
    pub timestamp: i64,
    pub timestamp_microseconds: u64, // 微秒时间戳
}

/// 交易信号事件
#[event]
pub struct TradeSignalEvent {
    pub user: Pubkey,     // 金库所有者
    pub executor: Pubkey, // 交易执行者（管理员或Bot）
    pub token_in: Pubkey,
    pub token_out: Pubkey,
    pub from_asset_metadata: Pubkey,
    pub to_asset_metadata: Pubkey,
    pub amount_in: u64,
    pub amount_out_min: u64,
    pub amount_out: u64,
    pub slippage_bps: u16,
    pub fee_recipient: Pubkey,
    pub fee_amount: u64,
    pub timestamp: i64,
    pub timestamp_microseconds: u64, // 微秒时间戳
}
