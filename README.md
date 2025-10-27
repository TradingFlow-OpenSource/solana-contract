# PersonalVault Solana Contract

## Project Overview

PersonalVault is a decentralized personal asset management contract built on Solana, enabling users to securely store, manage, and trade multiple token assets. Developed using the Anchor framework, the contract provides comprehensive asset management and DEX integration capabilities.

## Core Features

### 1. Account Management
- **GlobalConfig**: Stores admin and bot addresses, controls system-level permissions
- **PersonalVault**: Independent asset management account for each user, supports multi-currency balance management

### 2. Asset Operations
- **Deposit Functions**: 
  - `user_deposit`: Deposit SPL tokens (e.g., USDC)
  - `user_deposit_sol`: Deposit native SOL
- **Withdrawal Functions**:
  - `user_withdraw`: Withdraw SPL tokens
  - `user_withdraw_sol`: Withdraw native SOL
- **Balance Query**: Real-time balance queries for all tokens

### 3. Trading Functions
- **Automated Trade Signal (send_trade_signal)**: 
  - Supports trade initiation by admins or authorized bots
  - Integrates Raydium CLMM DEX
  - Automatic token swap processing
  - Slippage protection support

### 4. Permission Management
- **Admin Permissions**: Can set bot addresses and initiate trade signals
- **Bot Permissions**: Can initiate automated trades on behalf of users
- **User Permissions**: Control their own asset deposits and withdrawals

## Test Script Features (test.ts)

### Testing Workflow

#### Step 1: Initialize Global Configuration
```typescript
initializeGlobalConfig(botAddress)
```
- Creates global configuration PDA account
- Sets admin and bot addresses
- Only needs to be executed once

#### Step 2: Create Balance Manager
```typescript
createBalanceManager(globalConfigPda, userKeypair)
```
- Creates independent vault PDA account for each user
- Initializes user's asset management structure
- Supports multi-currency balance tracking

#### Step 3: Asset Deposit and Withdrawal Testing
```typescript
// SOL deposit
userDepositSol(vaultPda, amount, userKeypair)

// SPL token deposit (e.g., USDC)
userDeposit(vaultPda, mint, amount, userKeypair)

// Balance query
getBalance(vaultPda, tokenMint)

// Withdrawal operations
userWithdrawSol(vaultPda, amount, userKeypair)
userWithdraw(vaultPda, mint, amount, userKeypair)
```

#### Step 4: DEX Trading Integration Testing
```typescript
sendTradeSignal(
  vaultPda,
  tokenIn,      // Input token (e.g., WSOL)
  tokenOut,     // Output token (e.g., USDC)
  amountIn,     // Input amount
  slippageBps,  // Slippage (basis points)
  signerKeypair, // Signer (admin or bot)
  userKeypair   // Vault owner
)
```

### Testing Features

1. **Automatic Connection Management**: 
   - Supports automatic switching between multiple RPC endpoints
   - Automatic retry on connection failure

2. **Account Verification**:
   - Automatically checks if accounts already exist
   - Avoids duplicate initialization

3. **Balance Validation**:
   - Automatically validates balance changes before and after operations
   - Ensures transactions execute correctly

4. **Detailed Logging**:
   - Complete transaction signature output
   - Automatic generation of Solana Explorer links
   - Detailed error logging

### Usage

```bash
# Install dependencies
npm install

# Run complete test workflow
npx ts-node test/test.ts

# Test Raydium integration separately
npx ts-node test/raydium/test_raydium_sdk_swap.ts
```

### Test Environment

- **Network**: Solana Devnet
- **Program ID**: `FFbZem3yLs4Pr4LoXJPuqFp7CJsDvaYj9xQEkYboTaoJ`
- **Test Users**: 
  - admin: Administrator account
  - user1/user2: Regular user accounts
  - bot: Automated bot account

### Key Files

- `test/test.ts`: Main test script
- `test/raydium/constants.ts`: Shared constants and addresses
- `test/raydium/raydium.ts`: Raydium DEX integration logic
- `test/raydium/event_log.ts`: Event log parsing
