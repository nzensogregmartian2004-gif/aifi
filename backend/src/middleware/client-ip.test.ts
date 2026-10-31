import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, isAllowlistedMypvitIp } from "./verifyWebhookIp";

const fakeReq = (ip: string, headers: Record<string, string> = {}) => ({ ip, headers } as any);

describe("adresse réelle de l'appelant derrière Cloudflare", () => {
  test("utilise CF-Connecting-IP quand il est présent", () => {
    assert.equal(clientIp(fakeReq("172.68.1.1", { "cf-connecting-ip": "176.31.65.18" })), "176.31.65.18");
  });
  test("sans en-tête Cloudflare : req.ip", () => {
    assert.equal(clientIp(fakeReq("10.0.0.5")), "10.0.0.5");
  });
  test("retire le préfixe IPv4-mapped", () => {
    assert.equal(clientIp(fakeReq("::ffff:176.31.65.18")), "176.31.65.18");
  });
  test("un callback MyPVit est reconnu via CF-Connecting-IP, pas via l'IP du proxy", () => {
    process.env.MYPVIT_WEBHOOK_ALLOWED_IPS = "176.31.65.18,176.31.65.20,176.31.65.21";
    assert.equal(isAllowlistedMypvitIp(fakeReq("172.68.1.1", { "cf-connecting-ip": "176.31.65.20" })), true);
    assert.equal(isAllowlistedMypvitIp(fakeReq("172.68.1.1", { "cf-connecting-ip": "203.0.113.9" })), false);
  });
});
