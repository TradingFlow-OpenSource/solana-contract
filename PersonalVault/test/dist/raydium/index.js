"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPdaTickArrayAddress = exports.getTickArrayStartIndexByTick = exports.calculateRequiredTickArrays = exports.setUserTokenAccounts = exports.setSystemPrograms = exports.getCompleteRaydiumSwapAccounts = exports.grpcToken = exports.grpcUrl = exports.fetchTokenAccountData = exports.initSdk = exports.txVersion = exports.connection = exports.owner = void 0;
// 导出 config.ts 中的配置和函数
var config_1 = require("./config");
Object.defineProperty(exports, "owner", { enumerable: true, get: function () { return config_1.owner; } });
Object.defineProperty(exports, "connection", { enumerable: true, get: function () { return config_1.connection; } });
Object.defineProperty(exports, "txVersion", { enumerable: true, get: function () { return config_1.txVersion; } });
Object.defineProperty(exports, "initSdk", { enumerable: true, get: function () { return config_1.initSdk; } });
Object.defineProperty(exports, "fetchTokenAccountData", { enumerable: true, get: function () { return config_1.fetchTokenAccountData; } });
Object.defineProperty(exports, "grpcUrl", { enumerable: true, get: function () { return config_1.grpcUrl; } });
Object.defineProperty(exports, "grpcToken", { enumerable: true, get: function () { return config_1.grpcToken; } });
// 导出 raydium.ts 中的主要功能
var raydium_1 = require("./raydium");
Object.defineProperty(exports, "getCompleteRaydiumSwapAccounts", { enumerable: true, get: function () { return raydium_1.getCompleteRaydiumSwapAccounts; } });
Object.defineProperty(exports, "setSystemPrograms", { enumerable: true, get: function () { return raydium_1.setSystemPrograms; } });
Object.defineProperty(exports, "setUserTokenAccounts", { enumerable: true, get: function () { return raydium_1.setUserTokenAccounts; } });
Object.defineProperty(exports, "calculateRequiredTickArrays", { enumerable: true, get: function () { return raydium_1.calculateRequiredTickArrays; } });
Object.defineProperty(exports, "getTickArrayStartIndexByTick", { enumerable: true, get: function () { return raydium_1.getTickArrayStartIndexByTick; } });
Object.defineProperty(exports, "getPdaTickArrayAddress", { enumerable: true, get: function () { return raydium_1.getPdaTickArrayAddress; } });
//# sourceMappingURL=index.js.map