use anchor_lang::prelude::*;
use anchor_lang::solana_program;

/// SOL 相关常量
pub const SOL_DECIMALS: u8 = 9;
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// WSOL (Wrapped SOL) mint 地址
pub const WSOL_MINT: Pubkey =
    solana_program::pubkey!("So11111111111111111111111111111111111111112");

/// 用于标识原生 SOL 的特殊地址
pub const NATIVE_SOL_MINT: Pubkey = solana_program::system_program::ID;

/// SPL Memo 程序 ID
pub const MEMO_PROGRAM_ID: Pubkey =
    solana_program::pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/// Byreal CLMM 程序ID（根据环境选择）
#[cfg(feature = "devnet")]
pub const BYREAL_CLMM_PROGRAM_ID: Pubkey = solana_program::pubkey!("3NpR3NwmtFfAudZGhrVpzeLTAtnHTDeTao8vsUmEEEQs");
#[cfg(not(feature = "devnet"))]
pub const BYREAL_CLMM_PROGRAM_ID: Pubkey = solana_program::pubkey!("REALQqNEomY6cQGZJUGwywTBD2UmDT32rZcNnfxQ5N2");

/// Raydium CLMM 程序ID（根据环境选择）
#[cfg(feature = "devnet")]
pub const RAYDIUM_CLMM_PROGRAM_ID: Pubkey = solana_program::pubkey!("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH");
#[cfg(not(feature = "devnet"))]
pub const RAYDIUM_CLMM_PROGRAM_ID: Pubkey = solana_program::pubkey!("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");

/// Raydium AMM V4 程序ID（根据环境选择）
/// 注意：此程序支持 AMM V4 池子
#[cfg(feature = "devnet")]
pub const RAYDIUM_AMM_PROGRAM_ID: Pubkey = solana_program::pubkey!("HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8");
#[cfg(not(feature = "devnet"))]
pub const RAYDIUM_AMM_PROGRAM_ID: Pubkey = solana_program::pubkey!("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");

/// Raydium 相关常量
pub const RAYDIUM_AMM_CONFIG_INDEX: u8 = 0;
pub const RAYDIUM_AMM_DEFAULT_FEE_RATE: u64 = 2500; // 0.25% = 2500 / 1000000
pub const RAYDIUM_AMM_MIN_LIQUIDITY: u64 = 1000; // 最小流动性要求

/// DEX 选择配置
/// 修改这个常量来切换使用的 DEX
/// 注意："raydium_amm" 支持 AMM V4 和 CLMM 池子（程序会自动识别）
/// 可选值: "raydium_amm", "byreal"
pub const SELECTED_DEX: &str = "raydium_amm";

/// 当前使用的 DEX 类型（根据 SELECTED_DEX 自动选择）
pub const CURRENT_DEX: &str = SELECTED_DEX;

/// 获取当前选择的 DEX 类型枚举
pub fn get_selected_dex_type() -> &'static str {
    SELECTED_DEX
}

/// 检查是否使用指定的 DEX
pub fn is_using_dex(dex_name: &str) -> bool {
    SELECTED_DEX == dex_name
}

/// Byreal CLMM 指令标识符
pub const BYREAL_SWAP_INSTRUCTION_DISCRIMINATOR: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];
pub const BYREAL_SWAP_V2_INSTRUCTION_DISCRIMINATOR: [u8; 8] = [43, 4, 237, 11, 26, 201, 30, 98];

/// 费率分母常量
pub const FEE_RATE_DENOMINATOR: u32 = 1_000_000;

/// 获取默认费率（0.3%）
pub fn get_default_fee_rate() -> u64 {
    3000 // 0.3% = 3000 / 1000000
}

/// 错误代码定义
#[error_code]
pub enum ErrorCode {
    #[msg("无效的机器人地址")]
    InvalidBotAddress,
    #[msg("无效的管理员地址")]
    InvalidAdminAddress,
    #[msg("相同的机器人地址")]
    SameBotAddress,
    #[msg("相同的管理员地址")]
    SameAdminAddress,
    #[msg("只有投资者可以操作")]
    OnlyInvestor,
    #[msg("无效金额")]
    InvalidAmount,
    #[msg("输入和输出代币不能相同")]
    InvalidTokenPair,
    #[msg("余额不足")]
    InsufficientBalance,
    #[msg("金库未初始化")]
    VaultNotInitialized,
    #[msg("未授权操作")]
    Unauthorized,
    #[msg("只有机器人或管理员可以操作")]
    OnlyBotOrAdmin,
    #[msg("无效费率")]
    InvalidFeeRate,
    #[msg("输出金额不足")]
    InsufficientOutputAmount,
    #[msg("全局配置未初始化")]
    GlobalConfigNotInitialized,
    #[msg("检测到重入调用")]
    ReentrantCall,
    #[msg("无效的滑点设置")]
    InvalidSlippage,
    #[msg("无效的账户大小")]
    InvalidAccountSize,
    #[msg("无效的账户数据")]
    InvalidAccountData,
    #[msg("缺少全局配置账户")]
    MissingGlobalConfig,
    #[msg("无效的全局配置账户")]
    InvalidGlobalConfig,
    #[msg("无效的池子状态")]
    InvalidPoolState,
    #[msg("池子不存在")]
    PoolNotFound,
    #[msg("Raydium CLMM 程序调用失败")]
    RaydiumClmmCallFailed,
    #[msg("Raydium CLMM 账户推导失败")]
    RaydiumClmmAccountDerivationFailed,
    #[msg("Raydium CLMM 指令格式错误")]
    RaydiumClmmInstructionFormatError,
    // 新增的账户验证错误代码
    #[msg("无效的 AMM 配置账户")]
    InvalidAmmConfigAccount,
    #[msg("无效的池状态账户")]
    InvalidPoolStateAccount,
    #[msg("无效的代币账户")]
    InvalidTokenAccount,
    #[msg("无效的池子金库账户")]
    InvalidPoolVaultAccount,
    #[msg("无效的观察状态账户")]
    InvalidObservationStateAccount,
    #[msg("无效的代币 mint 地址")]
    InvalidTokenMintAddress,
    #[msg("发现重复的账户地址")]
    DuplicateAccountAddress,
    #[msg("账户地址格式无效")]
    InvalidAccountAddressFormat,
    #[msg("交换执行失败")]
    SwapExecutionFailed,
    #[msg("账户数量不足")]
    InsufficientAccounts,
    #[msg("无效的金库账户")]
    InvalidVaultAccount,
    #[msg("无效的全局配置账户")]
    InvalidGlobalConfigAccount,
    #[msg("无效的金库 PDA")]
    InvalidVaultPda,
    #[msg("数学运算溢出")]
    MathOverflow,
    #[msg("不支持的池子类型")]
    InvalidPoolType,
}
