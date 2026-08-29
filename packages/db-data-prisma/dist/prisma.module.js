"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPrismaModule = exports.DataPrismaProvider = void 0;
const common_1 = require("@nestjs/common");
const db_main_prisma_1 = require("@teable/db-main-prisma");
const nestjs_cls_1 = require("nestjs-cls");
const database_url_1 = require("./database-url");
const prisma_service_1 = require("./prisma.service");
const getSchema = (databaseUrl) => new URL(databaseUrl).searchParams.get('schema') ?? undefined;
exports.DataPrismaProvider = {
    provide: prisma_service_1.DataPrismaService,
    useFactory: async (cls, registry) => {
        const databaseUrl = (0, database_url_1.getDataDatabaseUrl)();
        return new prisma_service_1.DataPrismaService(cls, registry.acquire(databaseUrl), getSchema(databaseUrl));
    },
    inject: [nestjs_cls_1.ClsService, db_main_prisma_1.PgPoolRegistry],
};
let DataPrismaModule = class DataPrismaModule {
};
exports.DataPrismaModule = DataPrismaModule;
exports.DataPrismaModule = DataPrismaModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [db_main_prisma_1.PrismaModule],
        providers: [exports.DataPrismaProvider],
        exports: [exports.DataPrismaProvider],
    })
], DataPrismaModule);
