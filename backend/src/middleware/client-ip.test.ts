import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, isAllowlistedMypvitIp } from "./verifyWebhookIp";

// req.ip vient du proxy (trust proxy = 1) : c'est la seule source fiable.
// CF-Connecting-IP est envoyé par le client lui-même : il ne doit jamais être lu
// (le serveur n'est pas derrière Cloudflare).
const fakeReq = (ip: string, headers: Record<string, string> = {}) => ({ ip, headers } as any);

describe("adresse réelle de l'appelant", () => {
  test("ignore CF-Connecting-IP, forgeable par le client", () => {
    assert.equal(clientIp(fakeReq("172.68.1.1", { "cf-connecting-ip": "176.31.65.18" })), "172.68.1.1");
  });

  test("sans en-tête particulier : req.ip", () => {
    assert.equal(clientIp(fakeReq("10.0.0.5")), "10.0.0.5");
  });

  test("retire le préfixe IPv4-mapped", () => {
    assert.equal(clientIp(fakeReq("::ffff:176.31.65.18")), "176.31.65.18");
  });

  test("un callback MyPVit est reconnu par son IP réelle, pas par un en-tête forgé", () => {
    process.env.MYPVIT_WEBHOOK_ALLOWED_IPS = "176.31.65.18,176.31.65.20,176.31.65.21";
    assert.equal(isAllowlistedMypvitIp(fakeReq("176.31.65.20")), true);
    assert.equal(isAllowlistedMypvitIp(fakeReq("172.68.1.1", { "cf-connecting-ip": "176.31.65.20" })), false);
  });
});
