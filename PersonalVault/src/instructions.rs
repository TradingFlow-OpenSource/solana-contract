use crate::constants::{ErrorCode, LAMPORTS_PER_SOL, NATIVE_SOL_MINT, WSOL_MINT};
use crate::structs::{
    BalanceManagerCreatedEvent, CreateBalanceManager, GetBalance, InitializeGlobalConfig,
    PersonalVault, SendTradeSignal, SetAdmin, SetBot, TokenBalance, TradeSignalEvent, UnwrapSol,
    UserDeposit, UserDepositEvent, UserDepositSol, UserWithdraw, UserWithdrawEvent,
    UserWithdrawSol, WrapSol,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke,
    system_instruction,
};
use anchor_spl::token::{self, Transfer};


/// 获取代币余额
pub fn get_token_balance(vault: &PersonalVault, token: Pubkey) -> u64 {
    for balance in vault.balances.iter() {
        if balance.token == token {
            return balance.amount;
        }
    }
    0
}

/// 设置代币余额
pub fn set_token_balance(vault: &mut PersonalVault, token: Pubkey, amount: u64) {
    for balance in vault.balances.iter_mut() {
        if balance.token == token {
            balance.amount = amount;
            return;
        }
    }
    // 如果代币不存在，添加新条目
    vault.balances.push(TokenBalance { token, amount });
}

/// 根据滑点计算最小输出金额（简化版本）
fn calculate_min_output_amount(amount_in: u64, slippage_bps: u16) -> Result<u64> {
    if slippage_bps > 10000 {
        return Err(ErrorCode::InvalidSlippage.into());
    }

    // 计算：1% 基础滑点 + 用户设置的滑点
    let base_slippage_bps = 100u16; // 1% 基础滑点
    let total_slippage_bps = base_slippage_bps.checked_add(slippage_bps)
        .ok_or(ErrorCode::InvalidSlippage)?;
    let min_output = amount_in
        .checked_mul(10000 - total_slippage_bps as u64)
        .and_then(|v| v.checked_div(10000))
        .ok_or(ErrorCode::MathOverflow)?;

    msg!(
        "计算最小输出: 输入={}, 滑点={}bps, 最小输出={}",
        amount_in,
        total_slippage_bps,
        min_output
    );

    Ok(min_output)
}

/// 个人金库程序指令实现
pub mod instructions {
    use super::*;

    /// 初始化全局配置
    pub fn initialize_global_config(
        ctx: Context<InitializeGlobalConfig>,
        bot_address: Pubkey,
    ) -> Result<()> {
        msg!("开始初始化全局配置...");
        msg!("管理员地址: {}", ctx.accounts.admin.key());
        msg!("机器人地址: {}", bot_address);

        // 验证参数
        require!(
            bot_address != Pubkey::default(),
            ErrorCode::InvalidBotAddress
        );

        msg!("参数验证通过，设置全局配置...");

        let config = &mut ctx.accounts.global_config;

        // 设置全局配置数据
        config.admin = ctx.accounts.admin.key();
        config.bot = bot_address;
        config.is_initialized = true;

        msg!("全局配置初始化完成!");
        msg!("配置地址: {}", ctx.accounts.global_config.key());

        Ok(())
    }

    /// 设置机器人地址
    pub fn set_bot(ctx: Context<SetBot>, new_bot_address: Pubkey) -> Result<()> {
        msg!("开始设置机器人地址...");
        msg!("管理员地址: {}", ctx.accounts.admin.key());
        msg!("新机器人地址: {}", new_bot_address);

        require!(
            new_bot_address != Pubkey::default(),
            ErrorCode::InvalidBotAddress
        );

        let config = &mut ctx.accounts.global_config;
        let old_bot_address = config.bot;

        msg!("当前机器人地址: {}", old_bot_address);

        require!(
            new_bot_address != old_bot_address,
            ErrorCode::SameBotAddress
        );
        require!(
            ctx.accounts.admin.key() == config.admin,
            ErrorCode::Unauthorized
        );

        msg!("验证通过，更新机器人地址...");

        config.bot = new_bot_address;

        msg!("机器人地址更新完成!");

        Ok(())
    }

    /// 设置管理员
    pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
        msg!("开始设置管理员...");
        msg!("当前管理员地址: {}", ctx.accounts.admin.key());
        msg!("新管理员地址: {}", new_admin);

        require!(
            new_admin != Pubkey::default(),
            ErrorCode::InvalidAdminAddress
        );

        let config = &mut ctx.accounts.global_config;
        let old_admin = config.admin;

        msg!("当前管理员地址: {}", old_admin);

        require!(new_admin != old_admin, ErrorCode::SameAdminAddress);
        require!(
            ctx.accounts.admin.key() == config.admin,
            ErrorCode::Unauthorized
        );

        msg!("验证通过，更新管理员地址...");

        config.admin = new_admin;

        msg!("管理员地址更新完成!");

        Ok(())
    }

    /// 创建余额管理器
    pub fn create_balance_manager(ctx: Context<CreateBalanceManager>) -> Result<()> {
        msg!("开始创建余额管理器...");
        msg!("用户地址: {}", ctx.accounts.user.key());

        // 验证全局配置已初始化
        require!(
            ctx.accounts.global_config.is_initialized,
            ErrorCode::GlobalConfigNotInitialized
        );

        let vault = &mut ctx.accounts.vault;

        // 设置金库数据
        vault.investor = ctx.accounts.user.key();
        vault.is_initialized = true;
        vault.is_locked = false; // 初始化重入保护标志
        vault.balances = Vec::new(); // 初始化余额列表
        vault.bump = ctx.bumps.vault; // 保存 PDA bump

        msg!("余额管理器创建完成!");
        msg!("金库地址: {}", ctx.accounts.vault.key());

        emit!(BalanceManagerCreatedEvent {
            user: ctx.accounts.user.key(),
            vault: ctx.accounts.vault.key(),
            timestamp: Clock::get()?.unix_timestamp,
            timestamp_microseconds: Clock::get()?.unix_timestamp as u64 * 1_000_000, // 转换为微秒
        });

        Ok(())
    }

    /// 用户存款
    pub fn user_deposit(ctx: Context<UserDeposit>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        msg!("开始用户存款操作...");
        msg!("用户地址: {}", ctx.accounts.user.key());
        msg!("代币地址: {}", ctx.accounts.mint.key());
        msg!("存款金额: {}", amount);

        // 验证调用者是投资者
        require!(
            ctx.accounts.user.key() == vault.investor,
            ErrorCode::OnlyInvestor
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(vault.is_initialized, ErrorCode::VaultNotInitialized);

        msg!("验证通过，检查用户代币余额...");

        // 检查用户代币账户余额是否足够
        require!(
            ctx.accounts.user_token_account.amount >= amount,
            ErrorCode::InsufficientBalance
        );

        msg!("用户余额足够，开始转移代币...");

        // 实际转移代币：从用户账户转移到金库账户
        let transfer_instruction = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );

        token::transfer(cpi_ctx, amount)?;

        msg!("代币转移成功，更新内部余额记录...");

        // 更新内部余额记录
        let current_balance = get_token_balance(vault, ctx.accounts.mint.key());
        msg!("当前余额记录: {}", current_balance);

        let new_balance = current_balance.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        set_token_balance(vault, ctx.accounts.mint.key(), new_balance);
        msg!("更新后余额记录: {}", new_balance);

        emit!(UserDepositEvent {
            user: ctx.accounts.user.key(),
            token: ctx.accounts.mint.key(),
            asset_metadata: ctx.accounts.mint.key(), // 对应 Aptos 的 Object<Metadata
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            timestamp_microseconds: Clock::get()?.unix_timestamp as u64 * 1_000_000, // 转换为微秒
        });

        msg!("用户存款操作完成!");
        Ok(())
    }

    /// 用户存入原生 SOL
    pub fn user_deposit_sol(ctx: Context<UserDepositSol>, amount: u64) -> Result<()> {
        msg!("开始用户 SOL 存款操作...");
        msg!("用户地址: {}", ctx.accounts.user.key());
        msg!(
            "存款金额: {} lamports ({} SOL)",
            amount,
            amount as f64 / LAMPORTS_PER_SOL as f64
        );

        // 验证调用者是投资者
        require!(
            ctx.accounts.user.key() == ctx.accounts.vault.investor,
            ErrorCode::OnlyInvestor
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.vault.is_initialized,
            ErrorCode::VaultNotInitialized
        );

        // 检查用户 SOL 余额是否足够（需要考虑租金豁免）
        let user_balance = ctx.accounts.user.to_account_info().lamports();
        let rent_exempt_minimum = Rent::get()?.minimum_balance(0); // 用户账户的最小租金豁免

        require!(
            user_balance >= amount + rent_exempt_minimum,
            ErrorCode::InsufficientBalance
        );

        msg!("用户 SOL 余额: {} lamports", user_balance);
        msg!("需要保留的最小余额: {} lamports", rent_exempt_minimum);
        msg!("验证通过，开始转移 SOL...");

        // 从用户账户转移 SOL 到金库账户
        let user_key = ctx.accounts.user.key();
        let vault_key = ctx.accounts.vault.key();
        let transfer_instruction = system_instruction::transfer(&user_key, &vault_key, amount);

        invoke(
            &transfer_instruction,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        msg!("SOL 转移成功，更新内部余额记录...");

        // 更新内部余额记录（使用特殊的 NATIVE_SOL_MINT 标识）
        let current_balance = get_token_balance(&ctx.accounts.vault, NATIVE_SOL_MINT);
        msg!("当前 SOL 余额记录: {}", current_balance);

        let new_balance = current_balance.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        set_token_balance(
            &mut ctx.accounts.vault,
            NATIVE_SOL_MINT,
            new_balance,
        );
        msg!("更新后 SOL 余额记录: {}", new_balance);

        emit!(UserDepositEvent {
            user: ctx.accounts.user.key(),
            token: NATIVE_SOL_MINT,
            asset_metadata: NATIVE_SOL_MINT, // 使用特殊标识符表示原生 SOL
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            timestamp_microseconds: Clock::get()?.unix_timestamp as u64 * 1_000_000,
        });

        msg!("用户 SOL 存款操作完成!");
        Ok(())
    }

    /// 用户取款
    pub fn user_withdraw(ctx: Context<UserWithdraw>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        msg!("开始用户取款操作...");
        msg!("用户地址: {}", ctx.accounts.user.key());
        msg!("代币地址: {}", ctx.accounts.mint.key());
        msg!("取款金额: {}", amount);

        // 验证调用者是投资者
        require!(
            ctx.accounts.user.key() == vault.investor,
            ErrorCode::OnlyInvestor
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(vault.is_initialized, ErrorCode::VaultNotInitialized);

        // 🔒 重入保护：检查并设置锁定状态
        require!(!vault.is_locked, ErrorCode::ReentrantCall);
        vault.is_locked = true;

        msg!("验证通过，检查内部余额记录...");

        // 检查内部余额记录
        let current_balance = get_token_balance(vault, ctx.accounts.mint.key());
        msg!("当前余额记录: {}", current_balance);
        msg!("需要取款金额: {}", amount);

        require!(current_balance >= amount, ErrorCode::InsufficientBalance);

        msg!("检查金库代币账户实际余额...");

        // 检查金库代币账户的实际余额
        require!(
            ctx.accounts.vault_token_account.amount >= amount,
            ErrorCode::InsufficientBalance
        );

        msg!("余额充足，先更新内部余额记录防止重入攻击...");

        // 🔒 关键安全修复：先更新内部余额记录，防止重入攻击
        // 这遵循 "Checks-Effects-Interactions" 模式
        let new_balance = current_balance.checked_sub(amount)
            .ok_or(ErrorCode::InsufficientBalance)?;
        set_token_balance(vault, ctx.accounts.mint.key(), new_balance);
        msg!("更新后余额记录: {}", new_balance);

        msg!("开始转移代币...");

        // 创建金库的签名种子
        msg!("🔐 构建 PDA seeds:");
        msg!("  - investor: {}", vault.investor);
        msg!("  - bump: {}", vault.bump);
        msg!("  - vault PDA 地址: {}", vault.key());
        
        let seeds = &[b"vault".as_ref(), vault.investor.as_ref(), &[vault.bump]];
        let signer_seeds = &[&seeds[..]];

        // 验证 PDA 是否正确
        let (derived_vault, derived_bump) = Pubkey::find_program_address(
            &[b"vault", vault.investor.as_ref()],
            ctx.program_id
        );
        msg!("  - 派生的 vault 地址: {}", derived_vault);
        msg!("  - 派生的 bump: {}", derived_bump);
        
        require!(
            derived_vault == vault.key(),
            ErrorCode::InvalidVaultPda
        );

        // 实际转移代币：从金库账户转移到用户账户
        let transfer_instruction = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: vault.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            signer_seeds,
        );

        token::transfer(cpi_ctx, amount)?;

        msg!("代币转移成功!");

        // 🔒 解锁重入保护
        vault.is_locked = false;

        emit!(UserWithdrawEvent {
            user: ctx.accounts.user.key(),
            token: ctx.accounts.mint.key(),
            asset_metadata: ctx.accounts.mint.key(), // 对应 Aptos 的 Object<Metadata>
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            timestamp_microseconds: Clock::get()?.unix_timestamp as u64 * 1_000_000, // 转换为微秒
        });

        msg!("用户取款操作完成!");
        Ok(())
    }

    /// 用户取出原生 SOL
    pub fn user_withdraw_sol(ctx: Context<UserWithdrawSol>, amount: u64) -> Result<()> {
        msg!("开始用户 SOL 取款操作...");
        msg!("用户地址: {}", ctx.accounts.user.key());
        msg!(
            "取款金额: {} lamports ({} SOL)",
            amount,
            amount as f64 / LAMPORTS_PER_SOL as f64
        );

        // 验证调用者是投资者
        require!(
            ctx.accounts.user.key() == ctx.accounts.vault.investor,
            ErrorCode::OnlyInvestor
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.vault.is_initialized,
            ErrorCode::VaultNotInitialized
        );

        // 🔒 重入保护：检查并设置锁定状态
        require!(!ctx.accounts.vault.is_locked, ErrorCode::ReentrantCall);
        ctx.accounts.vault.is_locked = true;

        msg!("验证通过，检查内部 SOL 余额记录...");

        // 检查内部余额记录
        let current_balance = get_token_balance(&ctx.accounts.vault, NATIVE_SOL_MINT);
        msg!("当前 SOL 余额记录: {}", current_balance);
        msg!("需要取款金额: {}", amount);

        require!(current_balance >= amount, ErrorCode::InsufficientBalance);

        msg!("检查金库账户实际 SOL 余额...");

        // 检查金库账户的实际 SOL 余额
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        let vault_rent_exempt =
            Rent::get()?.minimum_balance(ctx.accounts.vault.to_account_info().data_len());

        require!(
            vault_balance >= amount + vault_rent_exempt,
            ErrorCode::InsufficientBalance
        );

        msg!("金库 SOL 余额: {} lamports", vault_balance);
        msg!("金库需要保留的最小余额: {} lamports", vault_rent_exempt);
        msg!("余额充足，先更新内部余额记录防止重入攻击...");

        // 🔒 关键安全修复：先更新内部余额记录，防止重入攻击
        let new_balance = current_balance.checked_sub(amount)
            .ok_or(ErrorCode::InsufficientBalance)?;
        set_token_balance(
            &mut ctx.accounts.vault,
            NATIVE_SOL_MINT,
            new_balance,
        );
        msg!("更新后 SOL 余额记录: {}", new_balance);

        msg!("开始转移 SOL...");

        // 从金库账户转移 SOL 到用户账户
        **ctx
            .accounts
            .vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .user
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        msg!("SOL 转移成功!");

        // 🔒 解锁重入保护
        ctx.accounts.vault.is_locked = false;

        emit!(UserWithdrawEvent {
            user: ctx.accounts.user.key(),
            token: NATIVE_SOL_MINT,
            asset_metadata: NATIVE_SOL_MINT, // 使用特殊标识符表示原生 SOL
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            timestamp_microseconds: Clock::get()?.unix_timestamp as u64 * 1_000_000,
        });

        msg!("用户 SOL 取款操作完成!");
        Ok(())
    }

    /// 获取代币余额
    pub fn get_balance(ctx: Context<GetBalance>, token: Pubkey) -> Result<u64> {
        let vault = &ctx.accounts.vault;
        msg!("查询代币余额...");
        msg!("代币地址: {}", token);

        let balance = get_token_balance(vault, token);
        msg!("查询到的余额: {}", balance);

        Ok(balance)
    }

    /// 将 SOL 包装为 WSOL
    pub fn wrap_sol(ctx: Context<WrapSol>, amount: u64) -> Result<()> {
        msg!("开始 SOL 包装操作...");
        msg!("用户地址: {}", ctx.accounts.user.key());
        msg!("包装金额: {} lamports", amount);

        // 验证调用者是投资者
        require!(
            ctx.accounts.user.key() == ctx.accounts.vault.investor,
            ErrorCode::OnlyInvestor
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.vault.is_initialized,
            ErrorCode::VaultNotInitialized
        );

        // 检查 SOL 余额是否足够
        let sol_balance = get_token_balance(&ctx.accounts.vault, NATIVE_SOL_MINT);
        require!(sol_balance >= amount, ErrorCode::InsufficientBalance);

        // 检查金库实际 SOL 余额
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        let vault_rent_exempt =
            Rent::get()?.minimum_balance(ctx.accounts.vault.to_account_info().data_len());

        require!(
            vault_balance >= amount + vault_rent_exempt,
            ErrorCode::InsufficientBalance
        );

        msg!("验证通过，开始包装 SOL...");

        // 创建金库的签名种子
        let vault_investor = ctx.accounts.vault.investor;
        let vault_bump = ctx.accounts.vault.bump;
        let seeds = &[b"vault".as_ref(), vault_investor.as_ref(), &[vault_bump]];
        let _signer_seeds = &[&seeds[..]];

        // 从金库账户转移 SOL 到 WSOL 账户
        let vault_key = ctx.accounts.vault.key();
        let wsol_key = ctx.accounts.wsol_account.key();
        let transfer_to_wsol_instruction =
            system_instruction::transfer(&vault_key, &wsol_key, amount);

        invoke(
            &transfer_to_wsol_instruction,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.wsol_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // 同步 WSOL 账户
        let token_program_key = ctx.accounts.token_program.key();
        let wsol_account_key = ctx.accounts.wsol_account.key();
        let sync_native_instruction = anchor_spl::token::spl_token::instruction::sync_native(
            &token_program_key,
            &wsol_account_key,
        )?;

        invoke(
            &sync_native_instruction,
            &[
                ctx.accounts.wsol_account.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;

        msg!("SOL 包装成功，更新余额记录...");

        // 更新内部余额记录
        set_token_balance(
            &mut ctx.accounts.vault,
            NATIVE_SOL_MINT,
            sol_balance - amount,
        );
        let wsol_balance = get_token_balance(&ctx.accounts.vault, WSOL_MINT);
        set_token_balance(&mut ctx.accounts.vault, WSOL_MINT, wsol_balance + amount);

        msg!("SOL 包装操作完成!");
        Ok(())
    }

    /// 将 WSOL 解包装为 SOL
    pub fn unwrap_sol(ctx: Context<UnwrapSol>, amount: u64) -> Result<()> {
        msg!("开始 WSOL 解包装操作...");
        msg!("用户地址: {}", ctx.accounts.user.key());
        msg!("解包装金额: {} lamports", amount);

        // 验证调用者是投资者
        require!(
            ctx.accounts.user.key() == ctx.accounts.vault.investor,
            ErrorCode::OnlyInvestor
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.vault.is_initialized,
            ErrorCode::VaultNotInitialized
        );

        // 检查 WSOL 余额是否足够
        let wsol_balance = get_token_balance(&ctx.accounts.vault, WSOL_MINT);
        require!(wsol_balance >= amount, ErrorCode::InsufficientBalance);

        // 检查 WSOL 账户实际余额
        require!(
            ctx.accounts.wsol_account.amount >= amount,
            ErrorCode::InsufficientBalance
        );

        msg!("验证通过，开始解包装 WSOL...");

        // 创建金库的签名种子
        let vault_investor = ctx.accounts.vault.investor;
        let vault_bump = ctx.accounts.vault.bump;
        let seeds = &[b"vault".as_ref(), vault_investor.as_ref(), &[vault_bump]];
        let _signer_seeds = &[&seeds[..]];

        // 关闭 WSOL 账户，将 SOL 转回金库
        let token_program_key = ctx.accounts.token_program.key();
        let wsol_key = ctx.accounts.wsol_account.key();
        let vault_key = ctx.accounts.vault.key();
        let close_account_instruction = anchor_spl::token::spl_token::instruction::close_account(
            &token_program_key,
            &wsol_key,
            &vault_key,
            &vault_key,
            &[],
        )?;

        invoke(
            &close_account_instruction,
            &[
                ctx.accounts.wsol_account.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;

        msg!("WSOL 解包装成功，更新余额记录...");

        // 更新内部余额记录
        set_token_balance(&mut ctx.accounts.vault, WSOL_MINT, wsol_balance - amount);
        let sol_balance = get_token_balance(&ctx.accounts.vault, NATIVE_SOL_MINT);
        set_token_balance(
            &mut ctx.accounts.vault,
            NATIVE_SOL_MINT,
            sol_balance + amount,
        );

        msg!("WSOL 解包装操作完成!");
        Ok(())
    }

    /// 发送交易信号并执行 DEX 交易
    pub fn send_trade_signal(
        ctx: Context<SendTradeSignal>,
        token_in: Pubkey,
        token_out: Pubkey,
        amount_in: u64,
        slippage_bps: u16,
        pool_type: u8,
    ) -> Result<u64> {
        msg!("🚀 开始发送交易信号操作...");
        msg!("执行者地址: {}", ctx.accounts.executor.key());
        msg!("目标金库所有者: {}", ctx.accounts.user.key());
        msg!("输入代币: {}", token_in);
        msg!("输出代币: {}", token_out);
        msg!("输入金额: {}", amount_in);
        msg!(
            "滑点容忍度: {} bps ({}%)",
            slippage_bps,
            slippage_bps as f64 / 100.0
        );
        msg!("池子类型: {} (0=AMM V4, 1=CLMM)", pool_type);

        // 📋 现在直接使用结构体中的账户，不需要从 remaining_accounts 获取
        msg!("收到 {} 个额外账户", ctx.remaining_accounts.len());

        // 🎯 直接访问结构体中的账户
        let mut vault_data = ctx.accounts.vault.clone();
        let global_config = ctx.accounts.global_config.clone();
        
        msg!("✅ 账户验证通过");
        msg!("金库地址: {}", ctx.accounts.vault.key());
        msg!("全局配置地址: {}", ctx.accounts.global_config.key());

        // 🔐 验证 vault 已初始化
        require!(vault_data.is_initialized, ErrorCode::VaultNotInitialized);
        
        // 🔐 验证 global_config 已初始化
        require!(global_config.is_initialized, ErrorCode::GlobalConfigNotInitialized);

        // 🔐 验证执行者是机器人或管理员
        require!(
            ctx.accounts.executor.key() == global_config.bot
                || ctx.accounts.executor.key() == global_config.admin,
            ErrorCode::OnlyBotOrAdmin
        );

        require!(amount_in > 0, ErrorCode::InvalidAmount);
        require!(token_in != token_out, ErrorCode::InvalidTokenPair);

        // 验证代币地址格式 - 检查是否为全零地址（无效地址）
        let token_in_bytes = token_in.to_bytes();
        let token_out_bytes = token_out.to_bytes();
        
        let token_in_all_zero = token_in_bytes.iter().all(|&b| b == 0);
        let token_out_all_zero = token_out_bytes.iter().all(|&b| b == 0);
        
        if token_in_all_zero || token_out_all_zero {
            msg!("❌ 代币地址格式无效，检测到全零地址");
            msg!("输入代币地址: {}", token_in);
            msg!("输出代币地址: {}", token_out);
            return Err(ErrorCode::InvalidAccountAddressFormat.into());
        }
        
        msg!("✅ 代币地址格式验证通过");
        msg!("输入代币: {}", token_in);
        msg!("输出代币: {}", token_out);

        require!(slippage_bps <= 10000, ErrorCode::InvalidSlippage); // 最大滑点100%

        // 检查输入代币余额
        let current_balance = get_token_balance(&vault_data, token_in);
        require!(current_balance >= amount_in, ErrorCode::InsufficientBalance);

        msg!("当前输入代币余额: {}", current_balance);

        msg!("✅ 验证通过，开始处理账户...");

        // 计算最小输出金额
        let amount_out_minimum = calculate_min_output_amount(amount_in, slippage_bps)?;
        msg!("计算得出的最小输出金额: {}", amount_out_minimum);

        // 获取默认费率
        let fee_rate = crate::constants::get_default_fee_rate();
        msg!("使用的费率: {} (百万分之一)", fee_rate);

        // 扣除输入代币
        let new_token_in_balance = current_balance.checked_sub(amount_in)
            .ok_or(ErrorCode::InsufficientBalance)?;
        set_token_balance(
            &mut vault_data,
            token_in,
            new_token_in_balance,
        );

        // 🔄 执行 DEX 交换（使用抽象层）
        msg!("🔄 开始执行 DEX 交换...");

        // 🔐 构建 vault PDA 的签名种子
        msg!("🔐 构建 vault PDA 签名种子...");
        msg!("  - investor: {}", vault_data.investor);
        msg!("  - bump: {}", vault_data.bump);
        let vault_seeds = &[b"vault".as_ref(), vault_data.investor.as_ref(), &[vault_data.bump]];
        let signer_seeds = &[&vault_seeds[..]];

        // 🎯 关键修复：直接传递 remaining_accounts，并在 DEX 集成中处理 executor
        msg!("🔧 传递 DEX 账户列表给交换函数...");
        msg!("  - executor (payer): {}", ctx.accounts.executor.key());
        msg!("  - remaining_accounts 数量: {}", ctx.remaining_accounts.len());
        
        let amount_out = crate::dex_integration::execute_dex_swap(
            ctx.remaining_accounts,  // ✅ 直接传递 remaining_accounts
            amount_in,
            amount_out_minimum,
            slippage_bps,
            pool_type,  // ✅ 传递池子类型参数
            signer_seeds,  // ✅ 传递 vault PDA 签名种子
        )?;

        msg!("✅ 交换完成，输出金额: {}", amount_out);
        require!(
            amount_out >= amount_out_minimum,
            ErrorCode::InsufficientOutputAmount
        );

        // 计算费用
        let fee_amount = amount_out.checked_mul(fee_rate)
            .and_then(|v| v.checked_div(1000000))
            .ok_or(ErrorCode::MathOverflow)?;
        let user_amount = amount_out.checked_sub(fee_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        msg!("💰 费用金额: {}", fee_amount);
        msg!("👤 用户获得金额: {}", user_amount);

        // 更新输出代币余额
        let current_out_balance = get_token_balance(&vault_data, token_out);
        let new_out_balance = current_out_balance.checked_add(user_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        set_token_balance(
            &mut vault_data,
            token_out,
            new_out_balance,
        );

        // 发出事件
        emit!(TradeSignalEvent {
            user: vault_data.investor,     // 金库所有者
            executor: ctx.accounts.executor.key(), // 交易执行者
            token_in,
            token_out,
            from_asset_metadata: token_in,
            to_asset_metadata: token_out,
            amount_in,
            amount_out_min: amount_out_minimum,
            amount_out,
            slippage_bps,
            fee_recipient: global_config.admin, // 使用管理员作为费用接收者
            fee_amount,
            timestamp: Clock::get()?.unix_timestamp,
            timestamp_microseconds: Clock::get()?.unix_timestamp as u64 * 1_000_000,
        });

        // 保存更新后的 vault_data
        let vault_account = &ctx.remaining_accounts[0];
        let mut data = vault_account.try_borrow_mut_data()?;
        vault_data.try_serialize(&mut &mut **data)?;  // try_serialize 会自动处理鉴别器

        msg!("🎉 交易信号发送完成!");
        Ok(amount_out)
    }
}
