"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const verifyWebhookIp_1 = require("./verifyWebhookIp");
// req.ip vient du proxy (trust proxy = 1) : c'est la seule source fiable.
// CF-Connecting-IP est envoyé par le client lui-même : il ne doit jamais être lu
// (le serveur n'est pas derrière Cloudflare).
const fakeReq = (ip, headers = {}) => ({ ip, headers });
(0, node_test_1.describe)("adresse réelle de l'appelant", () => {
    (0, node_test_1.test)("ignore CF-Connecting-IP, forgeable par le client", () => {
        strict_1.default.equal((0, verifyWebhookIp_1.clientIp)(fakeReq("172.68.1.1", { "cf-connecting-ip": "176.31.65.18" })), "172.68.1.1");
    });
    (0, node_test_1.test)("sans en-tête particulier : req.ip", () => {
        strict_1.default.equal((0, verifyWebhookIp_1.clientIp)(fakeReq("10.0.0.5")), "10.0.0.5");
    });
    (0, node_test_1.test)("retire le préfixe IPv4-mapped", () => {
        strict_1.default.equal((0, verifyWebhookIp_1.clientIp)(fakeReq("::ffff:176.31.65.18")), "176.31.65.18");
    });
    (0, node_test_1.test)("un callback MyPVit est reconnu par son IP réelle, pas par un en-tête forgé", () => {
        process.env.MYPVIT_WEBHOOK_ALLOWED_IPS = "176.31.65.18,176.31.65.20,176.31.65.21";
        strict_1.default.equal((0, verifyWebhookIp_1.isAllowlistedMypvitIp)(fakeReq("176.31.65.20")), true);
        strict_1.default.equal((0, verifyWebhookIp_1.isAllowlistedMypvitIp)(fakeReq("172.68.1.1", { "cf-connecting-ip": "176.31.65.20" })), false);
    });
});
