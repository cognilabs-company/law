import { describe, expect, it } from "vitest";
import { normRuntimeConfig, normServiceRules } from "@/lib/services/marketRuntime";
import { rulesOf } from "@/components/marketplace/runtime/facts";

// Service rules by audience (TSK-206001): the lawyer sees executor rules
// when turning the service on and while working; the client sees client
// rules before buying and during the order. Neither sees the other's.
describe("rule audiences", () => {
  const config = normRuntimeConfig({
    service_id: "s1",
    rules: [
      { id: "r1", title: "Javob 30 daqiqada", body: "Ijrochi 30 daqiqada javob beradi", audience: "executor" },
      { id: "r2", title: "Hujjatlarni yuklang", body: "Mijoz hujjatlarni o'zi yuklaydi", audience: "client" },
      { id: "r3", title: "Eski qoida", body: "Auditoriyasiz qoida" },
    ],
    client_rules: [{ id: "r4", title: "To'lov 10% oldindan", body: "Avans" }],
  });

  it("splits the runtime rules by side", () => {
    expect(rulesOf(config, "executor").map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(rulesOf(config, "client").map((r) => r.id)).toEqual(["r4", "r2"]);
  });

  it("never asks a seller to accept a client rule", () => {
    const r = normServiceRules({ items: [{ id: "r1", title: "A", audience: "executor" }, { id: "r2", title: "B", audience: "client" }] });
    expect(r.items.map((x) => x.id)).toEqual(["r1"]);
  });
});
