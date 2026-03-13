"use strict";
/*
 * SCRIPT DE MIGRAÇÃO ÚNICA
 *
 * Este script converte os resultados de pipeline do tipo 'consolidacao-entregas'
 * do formato antigo (array 'data' gigante) para o novo formato (subcoleção 'items').
 *
 * PARA EXECUTAR:
 * 1. Configure um arquivo .env na raiz do projeto com suas credenciais do Firebase Admin SDK.
 * 2. Compile e execute o script:
 *    - npx tsc src/lib/migration-scripts/migrate-entregas.ts
 *    - node src/lib/migration-scripts/migrate-entregas.js
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateConsolidacaoEntregas = migrateConsolidacaoEntregas;
var admin = require("firebase-admin");
var dotenv = require("dotenv"); // Alterado para require direto
// Carrega variáveis de ambiente
dotenv.config();
// ─── CONFIGURAÇÃO DO FIREBASE ADMIN ───────────────────────────────────────────
var serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
var db = admin.firestore();
// ─── FUNÇÃO DE MIGRAÇÃO ───────────────────────────────────────────────────────
function migrateConsolidacaoEntregas() {
    return __awaiter(this, void 0, void 0, function () {
        var pipelineResultsRef, querySnapshot, migratedCount, _i, _a, doc, docId, docData, oldDataArray, itemsSubcollectionRef, BATCH_LIMIT, batch, batchCount, i, item, newItemRef, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("Iniciando migração para 'consolidacao-entregas'...");
                    pipelineResultsRef = db.collection('pipeline_results');
                    return [4 /*yield*/, pipelineResultsRef
                            .where('pipelineType', '==', 'consolidacao-entregas')
                            .where('itemCount', '==', null)
                            .get()];
                case 1:
                    querySnapshot = _b.sent();
                    if (querySnapshot.empty) {
                        console.log("Nenhum documento no formato antigo encontrado. Migração não necessária.");
                        return [2 /*return*/];
                    }
                    console.log("Encontrados ".concat(querySnapshot.size, " documentos para migrar."));
                    migratedCount = 0;
                    _i = 0, _a = querySnapshot.docs;
                    _b.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 15];
                    doc = _a[_i];
                    docId = doc.id;
                    docData = doc.data();
                    oldDataArray = docData.data;
                    if (!(!Array.isArray(oldDataArray) || oldDataArray.length === 0)) return [3 /*break*/, 4];
                    console.log(" -> Documento ".concat(docId, " está no formato antigo mas não tem dados. Apenas atualizando o marcador."));
                    return [4 /*yield*/, pipelineResultsRef.doc(docId).update({ 
                        itemCount: 0,
                        data: admin.firestore.FieldValue.delete()
                    })];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 14];
                case 4:
                    console.log(" -> Migrando documento ".concat(docId, " (").concat(oldDataArray.length, " itens)..."));
                    itemsSubcollectionRef = pipelineResultsRef.doc(docId).collection('items');
                    BATCH_LIMIT = 500;
                    batch = db.batch();
                    batchCount = 0;
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 13, , 14]);
                    i = 0;
                    _b.label = 6;
                case 6:
                    if (!(i < oldDataArray.length)) return [3 /*break*/, 9];
                    item = oldDataArray[i];
                    newItemRef = itemsSubcollectionRef.doc();
                    batch.set(newItemRef, item);
                    batchCount++;
                    if (!(batchCount === BATCH_LIMIT)) return [3 /*break*/, 8];
                    return [4 /*yield*/, batch.commit()];
                case 7:
                    _b.sent();
                    console.log("    - Lote de ".concat(BATCH_LIMIT, " itens salvo."));
                    batch = db.batch();
                    batchCount = 0;
                    _b.label = 8;
                case 8:
                    i++;
                    return [3 /*break*/, 6];
                case 9:
                    if (!(batchCount > 0)) return [3 /*break*/, 11];
                    return [4 /*yield*/, batch.commit()];
                case 10:
                    _b.sent();
                    console.log("    - Lote final de ".concat(batchCount, " itens salvo."));
                    _b.label = 11;
                case 11: 
                return [4 /*yield*/, pipelineResultsRef.doc(docId).update({
                        itemCount: oldDataArray.length,
                        data: admin.firestore.FieldValue.delete(),
                    })];
                case 12:
                    _b.sent();
                    console.log(" -> Sucesso! Documento ".concat(docId, " migrado."));
                    migratedCount++;
                    return [3 /*break*/, 14];
                case 13:
                    error_1 = _b.sent();
                    console.error(" -> ERRO ao migrar documento ".concat(docId, ":"), error_1);
                    return [3 /*break*/, 14];
                case 14:
                    _i++;
                    return [3 /*break*/, 2];
                case 15:
                    console.log("\nMigração concluída. ".concat(migratedCount, " de ").concat(querySnapshot.size, " documentos foram migrados com sucesso."));
                    return [2 /*return*/];
            }
        });
    });
}
// Executa a função
migrateConsolidacaoEntregas().catch(console.error);
