"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
const errors_1 = require("../../errors");
const client_1 = require("../../db/client");
const ceiling_service_1 = require("../ceilings/ceiling.service");
async function getSettings() {
    return client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" } });
}
async function updateSettings(data) {
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === "number" && value < 0) {
            throw new errors_1.AppError("INVALID_SETTING", `${key} ne peut pas être négatif`, { key });
        }
    }
    if (data.commissionPercent !== undefined && data.commissionPercent > 100) {
        throw new errors_1.AppError("INVALID_SETTING", "commissionPercent ne peut pas dépasser 100");
    }
    if (data.repaymentReceivingOperator !== undefined &&
        !["AIRTEL_MONEY", "MOOV_MONEY"].includes(data.repaymentReceivingOperator)) {
        throw new errors_1.AppError("INVALID_SETTING", "repaymentReceivingOperator doit être AIRTEL_MONEY ou MOOV_MONEY");
    }
    const { communityLinks, ...rest } = data;
    const updated = await client_1.prisma.appSettings.update({
        where: { id: "singleton" },
        data: {
            ...rest,
            ...(communityLinks !== undefined
                ? { communityLinks: communityLinks }
                : {}),
        },
    });
    // Le plafond est mis en cache sur chaque client : si le plafonnement des
    // non-abonnés change, on recalcule tout le monde immédiatement.
    if ("freePointsCap" in data) {
        await (0, ceiling_service_1.recomputeAllCeilings)();
    }
    return updated;
}
