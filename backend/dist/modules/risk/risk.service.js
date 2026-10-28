"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RISK_LEVELS = void 0;
exports.getUserRisk = getUserRisk;
exports.getRiskOverview = getRiskOverview;
const client_1 = require("../../db/client");
const rules_1 = require("../finance/rules");
/**
 * Niveaux de risque, selon l'état de la demande la plus en retard :
 * Sursis (jour de grâce), Majoré (1 à 7 jours de majoration), Élevé (plus de 7 jours).
 * Il n'y a plus de blocage automatique : seul un admin suspend un compte.
 */
exports.RISK_LEVELS = ["Aucun", "Sursis", "Majoré", "Élevé"];
/** Demandes ouvertes pour lesquelles un remboursement est attendu. */
const OPEN_STATUSES = ["ACCEPTED", "DISBURSED", "LATE"];
function levelOf(state) {
    if (state.phase === "ON_TIME")
        return exports.RISK_LEVELS[0];
    if (state.phase === "GRACE")
        return exports.RISK_LEVELS[1];
    return state.lateDays > 7 ? exports.RISK_LEVELS[3] : exports.RISK_LEVELS[2];
}
/** Situation de risque d'un client, calculée à partir de ses demandes ouvertes. */
async function getUserRisk(userId) {
    const now = new Date();
    const [user, open] = await Promise.all([
        client_1.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { status: true, points: true, ceiling: true },
        }),
        client_1.prisma.aidRequest.findMany({
            where: { userId, status: { in: [...OPEN_STATUSES] }, dueDate: { not: null } },
            select: {
                id: true,
                amount: true,
                dueDate: true,
                graceDays: true,
                interestAmount: true,
                gridDurationDays: true,
                lateSurchargeAmount: true,
            },
        }),
    ]);
    const settings = await client_1.prisma.appSettings.findUniqueOrThrow({ where: { id: "singleton" }, select: { latePenaltyPoints: true } });
    let worst = null;
    let overdueCount = 0;
    let overdueAmount = 0;
    let surchargeTotal = 0;
    for (const r of open) {
        const state = (0, rules_1.lateState)(r.dueDate, now, r.graceDays);
        if (state.phase === "ON_TIME")
            continue;
        overdueCount++;
        overdueAmount += r.amount;
        surchargeTotal += r.lateSurchargeAmount;
        if (!worst || state.daysAfterDue > worst.state.daysAfterDue) {
            worst = { state, request: r };
        }
    }
    return {
        level: worst ? levelOf(worst.state) : exports.RISK_LEVELS[0],
        suspended: user.status === "SUSPENDED",
        points: user.points,
        ceiling: user.ceiling,
        overdueCount,
        overdueAmount,
        daysLate: worst?.state.lateDays ?? 0,
        graceDaysLeft: worst?.state.graceDaysLeft ?? 0,
        graceDays: worst?.request.graceDays ?? 0,
        surchargeTotal,
        dailyAmount: worst ? Math.round((0, rules_1.dailyInterest)(worst.request.interestAmount, worst.request.gridDurationDays)) : 0,
        pointsPerDay: settings.latePenaltyPoints,
    };
}
/** Vue globale du risque : répartition par niveau, tranches de retard, plus gros dossiers en retard. */
async function getRiskOverview() {
    const now = new Date();
    const [activeClients, open] = await Promise.all([
        client_1.prisma.user.count({ where: { role: "CLIENT", status: "ACTIVE" } }),
        client_1.prisma.aidRequest.findMany({
            where: { status: { in: [...OPEN_STATUSES] }, dueDate: { not: null } },
            select: {
                userId: true,
                amount: true,
                dueDate: true,
                graceDays: true,
                user: { select: { name: true, status: true } },
            },
        }),
    ]);
    const buckets = { Sursis: 0, "1 à 7 j": 0, "8 à 15 j": 0, "Plus de 15 j": 0 };
    const perUser = new Map();
    for (const r of open) {
        const state = (0, rules_1.lateState)(r.dueDate, now, r.graceDays);
        if (state.phase === "ON_TIME")
            continue;
        const key = state.phase === "GRACE"
            ? "Sursis"
            : state.lateDays <= 7
                ? "1 à 7 j"
                : state.lateDays <= 15
                    ? "8 à 15 j"
                    : "Plus de 15 j";
        buckets[key] += r.amount;
        const level = levelOf(state);
        const current = perUser.get(r.userId) || {
            name: r.user.name,
            suspended: r.user.status === "SUSPENDED",
            level,
            overdueAmount: 0,
            daysLate: 0,
            count: 0,
        };
        // Le niveau retenu pour un client est celui de son dossier le plus en retard.
        if (state.daysAfterDue > 0 && levelRank(level) > levelRank(current.level))
            current.level = level;
        current.overdueAmount += r.amount;
        current.daysLate = Math.max(current.daysLate, state.lateDays);
        current.count += 1;
        perUser.set(r.userId, current);
    }
    const levelCounts = { Aucun: 0 };
    for (const label of exports.RISK_LEVELS.slice(1))
        levelCounts[label] = 0;
    const topClients = [...perUser.entries()]
        .map(([userId, u]) => {
        const level = u.suspended ? "Suspendu" : u.level;
        levelCounts[level] = (levelCounts[level] || 0) + 1;
        return { userId, name: u.name, level, overdueAmount: u.overdueAmount, daysLate: u.daysLate, count: u.count };
    })
        .sort((a, b) => b.overdueAmount - a.overdueAmount)
        .slice(0, 20);
    levelCounts.Aucun = Math.max(0, activeClients - perUser.size);
    return {
        activeClients,
        overdueClients: perUser.size,
        totalOverdueAmount: Object.values(buckets).reduce((s, v) => s + v, 0),
        buckets: Object.entries(buckets).map(([label, amount]) => ({ label, amount })),
        levels: Object.entries(levelCounts).map(([label, count]) => ({ label, count })),
        topClients,
    };
}
function levelRank(label) {
    return exports.RISK_LEVELS.indexOf(label);
}
