import { PublicKey } from '@solana/web3.js';
/**
 * 解析 BalanceManagerCreatedEvent 事件日志
 */
export declare function parseBalanceManagerCreatedEventLog(encodedData: string): {
    user: PublicKey;
    timestampMicroseconds: bigint;
};
/**
 * 解析 UserDepositEvent 事件日志
 */
export declare function parseUserDepositEventLog(encodedData: string): {
    user: PublicKey;
    assetMetadata: PublicKey;
    amount: bigint;
    timestampMicroseconds: bigint;
};
/**
 * 解析 UserWithdrawEvent 事件日志
 */
export declare function parseUserWithdrawEventLog(encodedData: string): {
    user: PublicKey;
    assetMetadata: PublicKey;
    amount: bigint;
    timestampMicroseconds: bigint;
};
//# sourceMappingURL=event_log.d.ts.map