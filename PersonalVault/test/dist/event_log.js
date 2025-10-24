"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBalanceManagerCreatedEventLog = parseBalanceManagerCreatedEventLog;
exports.parseUserDepositEventLog = parseUserDepositEventLog;
exports.parseUserWithdrawEventLog = parseUserWithdrawEventLog;
const web3_js_1 = require("@solana/web3.js");
/**
 * 解析 BalanceManagerCreatedEvent 事件日志
 */
function parseBalanceManagerCreatedEventLog(encodedData) {
    const decodedBytes = Buffer.from(encodedData, 'base64');
    const eventData = decodedBytes.slice(8); // 跳过 discriminator
    const user = new web3_js_1.PublicKey(eventData.slice(0, 32));
    const timestampMicroseconds = eventData.readBigUInt64LE(32);
    console.log('BalanceManagerCreatedEvent 事件解析结果:');
    console.log('  User     :', user.toString());
    console.log('  Timestamp:', timestampMicroseconds.toString());
    return { user, timestampMicroseconds };
}
/**
 * 解析 UserDepositEvent 事件日志
 */
function parseUserDepositEventLog(encodedData) {
    const decodedBytes = Buffer.from(encodedData, 'base64');
    const eventData = decodedBytes.slice(8); // 跳过 discriminator
    const user = new web3_js_1.PublicKey(eventData.slice(0, 32));
    const assetMetadata = new web3_js_1.PublicKey(eventData.slice(32, 64));
    const amount = eventData.readBigUInt64LE(64);
    const timestampMicroseconds = eventData.readBigUInt64LE(72);
    console.log('UserDepositEvent 事件解析结果:');
    console.log('  User         :', user.toString());
    console.log('  AssetMetadata:', assetMetadata.toString());
    console.log('  Amount       :', amount.toString());
    console.log('  Timestamp    :', timestampMicroseconds.toString());
    return { user, assetMetadata, amount, timestampMicroseconds };
}
/**
 * 解析 UserWithdrawEvent 事件日志
 */
function parseUserWithdrawEventLog(encodedData) {
    const decodedBytes = Buffer.from(encodedData, 'base64');
    const eventData = decodedBytes.slice(8); // 跳过 discriminator
    const user = new web3_js_1.PublicKey(eventData.slice(0, 32));
    const assetMetadata = new web3_js_1.PublicKey(eventData.slice(32, 64));
    const amount = eventData.readBigUInt64LE(64);
    const timestampMicroseconds = eventData.readBigUInt64LE(72);
    console.log('UserWithdrawEvent 事件解析结果:');
    console.log('  User         :', user.toString());
    console.log('  AssetMetadata:', assetMetadata.toString());
    console.log('  Amount       :', amount.toString());
    console.log('  Timestamp    :', timestampMicroseconds.toString());
    return { user, assetMetadata, amount, timestampMicroseconds };
}
//# sourceMappingURL=event_log.js.map