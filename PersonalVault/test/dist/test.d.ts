import { PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
declare const adminKeypair: Keypair;
declare const user1Keypair: Keypair;
declare const botKeypair: Keypair;
declare let GLOBAL_CONFIG_PDA: PublicKey | null;
declare let VAULT_PDA: PublicKey | null;
declare const TEST_ADDRESSES: {
    bot: PublicKey;
    testToken: PublicKey;
    usdcDevnet: PublicKey;
};
declare function generateGlobalConfigPDA(): [PublicKey, number];
declare function generateVaultPDA(userAddress: PublicKey): [PublicKey, number];
declare function initializeGlobalConfig(botAddress: PublicKey): Promise<{
    globalConfigPda: PublicKey;
    tx: string;
}>;
declare function createBalanceManager(globalConfigPda: PublicKey, userKeypair?: Keypair): Promise<{
    vaultPda: PublicKey;
    tx: string;
}>;
declare function userDeposit(vaultPda: PublicKey, mint: PublicKey, amount: number, userKeypair?: Keypair): Promise<string>;
declare function userDepositSol(vaultPda: PublicKey, amount: number, userKeypair?: Keypair): Promise<string>;
declare function userWithdraw(vaultPda: PublicKey, mint: PublicKey, amount: number, userKeypair?: Keypair): Promise<string>;
declare function userWithdrawSol(vaultPda: PublicKey, amount: number, userKeypair?: Keypair): Promise<string>;
declare function getBalance(vaultPda: PublicKey, token: PublicKey): Promise<BN>;
declare function setBot(globalConfigPda: PublicKey, newBotAddress: PublicKey): Promise<string>;
declare function setAdmin(globalConfigPda: PublicKey, newAdmin: PublicKey): Promise<string>;
declare function sendTradeSignal(vaultPda: PublicKey, tokenIn: PublicKey, tokenOut: PublicKey, amountIn: number, slippageBps: number, signerKeypair?: Keypair): Promise<string>;
declare function serializeTradeSignalData(tokenIn: PublicKey, tokenOut: PublicKey, amountIn: number, slippageBps: number): Buffer;
declare function getVaultInfo(vaultPda: PublicKey): Promise<import("@solana/web3.js").AccountInfo<Buffer<ArrayBufferLike>> | null>;
declare function getGlobalConfigInfo(globalConfigPda: PublicKey): Promise<import("@solana/web3.js").AccountInfo<Buffer<ArrayBufferLike>> | null>;
declare function verifyBalanceChange(vaultPda: PublicKey, tokenMint: PublicKey, balanceBefore: BN, expectedChange: number, operation: string): Promise<boolean>;
declare function testComplete(): Promise<void>;
declare function testRaydiumSwapAccounts(): Promise<void>;
export { generateGlobalConfigPDA, generateVaultPDA, initializeGlobalConfig, createBalanceManager, userDeposit, userDepositSol, userWithdraw, userWithdrawSol, getBalance, setBot, setAdmin, sendTradeSignal, serializeTradeSignalData, getVaultInfo, getGlobalConfigInfo, verifyBalanceChange, testComplete, // 新增导出
TEST_ADDRESSES, GLOBAL_CONFIG_PDA, VAULT_PDA, user1Keypair, adminKeypair, botKeypair };
//# sourceMappingURL=test.d.ts.map