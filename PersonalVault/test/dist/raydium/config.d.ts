import { Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair } from '@solana/web3.js';
declare let owner: Keypair;
export { owner };
export declare const connection: Connection;
export declare const txVersion = TxVersion["V0"];
export declare const initSdk: (params?: {
    loadToken?: boolean;
}) => Promise<Raydium>;
export declare const fetchTokenAccountData: () => Promise<{
    tokenAccounts: import("@raydium-io/raydium-sdk-v2").TokenAccount[];
    tokenAccountRawInfos: import("@raydium-io/raydium-sdk-v2").TokenAccountRaw[];
}>;
export declare const grpcUrl = "<YOUR_GRPC_URL>";
export declare const grpcToken = "<YOUR_GRPC_TOKEN>";
//# sourceMappingURL=config.d.ts.map