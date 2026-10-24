import { describe, expect, it } from "vitest";
import uz from "@/messages/uz.json";
import ru from "@/messages/ru.json";
import en from "@/messages/en.json";

// Time-unit select options read "Kun", "Soat", "Daqiqa" (TSK-856179); the
// backend's codes (day, hour, minute) stay as they are.
const groups = (m: typeof uz) => [m.studio.sx.opt.duration_unit, m.studio.sx.opt.review_duration_unit, m.studio.settings.routes.slaUnitOpt];

describe("unit select labels", () => {
  for (const [locale, m] of [["uz", uz], ["ru", ru], ["en", en]] as const) {
    it(`${locale}: every option starts with a capital`, () => {
      for (const g of groups(m as typeof uz)) {
        expect(Object.keys(g).sort()).toEqual(["day", "hour", "minute"]);
        for (const label of Object.values(g)) expect(label[0]).toBe(label[0].toLocaleUpperCase(locale));
      }
    });
  }
  it("uz reads Kun, Soat, Daqiqa", () => {
    expect(uz.studio.sx.opt.duration_unit).toEqual({ minute: "Daqiqa", hour: "Soat", day: "Kun" });
  });
});
