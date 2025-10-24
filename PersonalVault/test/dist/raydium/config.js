"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.grpcToken = exports.grpcUrl = exports.fetchTokenAccountData = exports.initSdk = exports.txVersion = exports.connection = exports.owner = void 0;
const raydium_sdk_v2_1 = require("@raydium-io/raydium-sdk-v2");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// 从文件加载密钥对，如果文件不存在则生成新的
let owner;
try {
    const keypairPath = path.join(__dirname, '../admin-keypair.json');
    if (fs.existsSync(keypairPath)) {
        exports.owner = owner = web3_js_1.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))));
    }
    else {
        console.log('⚠️ 未找到密钥对文件');
    }
}
catch (error) {
    console.log('⚠️ 密钥对加载失败');
}
// 多个 RPC 端点配置，参考 Demo 的最佳实践
const RPC_ENDPOINTS = {
    devnet: [
        'https://api.devnet.solana.com',
        'https://devnet.solana.com',
        'https://solana-devnet.g.alchemy.com/v2/demo',
        'https://rpc.ankr.com/solana_devnet',
        'https://devnet.genesysgo.net'
    ],
    mainnet: [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana'
    ]
};
// 创建连接，使用多个端点
exports.connection = new web3_js_1.Connection(RPC_ENDPOINTS.devnet[0], // 主要端点
{
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
    // 添加重试配置
    httpHeaders: {
        'User-Agent': 'Raydium-SDK-Test'
    }
});
exports.txVersion = raydium_sdk_v2_1.TxVersion.V0; // or TxVersion.LEGACY
const cluster = 'devnet'; // 'mainnet' | 'devnet'
let raydium;
const initSdk = async (params) => {
    if (raydium)
        return raydium;
    // 检查 RPC 端点
    if (exports.connection.rpcEndpoint === (0, web3_js_1.clusterApiUrl)('mainnet-beta'))
        console.warn('using free rpc node might cause unexpected error, strongly suggest uses paid rpc node');
    console.log(`connect to rpc ${exports.connection.rpcEndpoint} in ${cluster}`);
    try {
        raydium = await raydium_sdk_v2_1.Raydium.load({
            owner,
            connection: exports.connection,
            cluster,
            disableFeatureCheck: true,
            disableLoadToken: true, // 完全禁用代币加载，避免 API 调用
            blockhashCommitment: 'finalized', // 使用最终确认的区块哈希
            // 注意：devnet 不支持 API 配置
        });
        console.log('✅ Raydium SDK 初始化成功');
        return raydium;
    }
    catch (error) {
        console.error('❌ Raydium SDK 初始化失败:', error);
        // 如果主要端点失败，尝试备用端点
        if (cluster === 'devnet' && RPC_ENDPOINTS.devnet.length > 1) {
            console.log('🔄 尝试使用备用 RPC 端点...');
            for (let i = 1; i < RPC_ENDPOINTS.devnet.length; i++) {
                try {
                    const backupConnection = new web3_js_1.Connection(RPC_ENDPOINTS.devnet[i], {
                        commitment: 'confirmed',
                        confirmTransactionInitialTimeout: 60000
                    });
                    console.log(`🔄 尝试端点 ${i + 1}: ${RPC_ENDPOINTS.devnet[i]}`);
                    raydium = await raydium_sdk_v2_1.Raydium.load({
                        owner,
                        connection: backupConnection,
                        cluster,
                        disableFeatureCheck: true,
                        disableLoadToken: true,
                        blockhashCommitment: 'finalized',
                    });
                    console.log(`✅ 使用备用端点 ${i + 1} 初始化成功`);
                    return raydium;
                }
                catch (backupError) {
                    console.log(`❌ 备用端点 ${i + 1} 失败:`, backupError instanceof Error ? backupError.message : String(backupError));
                    continue;
                }
            }
        }
        throw error;
    }
};
exports.initSdk = initSdk;
const fetchTokenAccountData = async () => {
    const solAccountResp = await exports.connection.getAccountInfo(owner.publicKey);
    const tokenAccountResp = await exports.connection.getTokenAccountsByOwner(owner.publicKey, { programId: spl_token_1.TOKEN_PROGRAM_ID });
    const token2022Req = await exports.connection.getTokenAccountsByOwner(owner.publicKey, { programId: spl_token_1.TOKEN_2022_PROGRAM_ID });
    const tokenAccountData = (0, raydium_sdk_v2_1.parseTokenAccountResp)({
        owner: owner.publicKey,
        solAccountResp,
        tokenAccountResp: {
            context: tokenAccountResp.context,
            value: [...tokenAccountResp.value, ...token2022Req.value],
        },
    });
    return tokenAccountData;
};
exports.fetchTokenAccountData = fetchTokenAccountData;
exports.grpcUrl = '<YOUR_GRPC_URL>';
exports.grpcToken = '<YOUR_GRPC_TOKEN>';
//# sourceMappingURL=config.js.map