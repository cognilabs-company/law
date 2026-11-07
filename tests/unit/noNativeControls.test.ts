import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Owner's law: dates, times, dropdowns and checkboxes are handmade
// (components/Select, DatePicker, TimePicker, CheckBox). A browser control is
// only allowed where it can never be seen: a hidden input under a fully drawn
// control. Each entry below says why that holds, and a new one needs its own.
const ALLOWED: Record<string, { types: string[]; why: string }> = {
  "components/CheckBox.tsx": { types: ["checkbox"], why: "the handmade control: input.cbx__in clipped, .cbx__box drawn" },
  "components/support/SupportHub.tsx": { types: ["checkbox"], why: ".supnew__switch drawn; input 1px, opacity 0" },
  "components/admin/LostReasonDialog.tsx": { types: ["radio"], why: ".lrsn__chip is the control; input opacity 0" },
  "components/admin/QualityComplaints.tsx": { types: ["radio"], why: ".ccpick__in hidden; .ccpick__dot drawn" },
  "components/admin/UrgentAdvocateQueue.tsx": { types: ["radio"], why: ".ccpick__in hidden; .ccpick__dot drawn" },
  "components/admin/studio/sx/settings/GrantDrawer.tsx": { types: ["checkbox"], why: ".sx-vh; .sx-st-rcard__box drawn" },
  "components/admin/policies/MarketplacePricingCard.tsx": { types: ["checkbox"], why: ".mpp__sw i switch drawn" },
  "components/admin/studio/sx/form/ChoiceCards.tsx": { types: ["radio", "checkbox"], why: ".sx-vh; .sx-choice card drawn" },
  "components/portal/SellerProfileEditor.tsx": { types: ["checkbox"], why: ".vac pill; input size 0" },
  "components/portal/SellerMetrics.tsx": { types: ["checkbox"], why: ".vac pill; input size 0" },
  "components/portal/CalendarPanel.tsx": { types: ["checkbox"], why: ".vac pill; input size 0" },
  "components/services/LegacyServicePicker.tsx": { types: ["checkbox"], why: ".vac pill; input size 0" },
  "components/portal/dash/FeedbackPage.tsx": { types: ["radio"], why: ".lfb-kind__dot drawn; input opacity 0" },
  "components/services/ServiceFormModal.tsx": { types: ["checkbox"], why: ".svform__box drawn; input opacity 0" },
  "components/services/RuleChoice.tsx": { types: ["checkbox"], why: ".svform__box drawn; input opacity 0" },
  "components/complaints/NewComplaintForm.tsx": { types: ["radio"], why: ".shkf__radio drawn; input opacity 0" },
  "components/marketplace/PriceOptions.tsx": { types: ["checkbox"], why: ".pxo__box drawn; input opacity 0" },
  "app/[locale]/admin/pipeline/LegacyPipeline.tsx": { types: ["radio"], why: ".lstg-clr__sw swatch drawn; input opacity 0" },
  "app/[locale]/admin/notifications/page.tsx": { types: ["checkbox"], why: ".nrcp__cb drawn; input size 0" },
  "app/[locale]/admin/policies/page.tsx": { types: ["radio"], why: ".unvmode__dot drawn; input size 0" },
  "components/ccx/CcxAppearance.tsx": { types: ["checkbox"], why: ".opx-look__toggle drawn; input opacity 0" },
  "components/ccx/profile/WorkPrefs.tsx": { types: ["checkbox"], why: ".opx-look__toggle drawn; input opacity 0" },
  "components/ccx/panel/bits.tsx": { types: ["radio"], why: ".opx-choice__opt card drawn; input opacity 0" },
  "components/ccx/queues/decide/WcSwitch.tsx": { types: ["checkbox"], why: ".opx-wsw__tg drawn; input opacity 0" },
  "components/ccx/queues/decide/SellerPick.tsx": { types: ["radio"], why: ".opx-sp__row card drawn; input opacity 0" },
};

const ROOTS = ["components", "app"];
const CODE = /\.tsx?$/;
// The real <input> tags, across lines; data-ai-type="checkbox" and the like are not inputs.
const INPUT_TAG = /<input\b(?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*>/g;
const TYPE = /(?<![-\w])type=(?:"([a-z-]+)"|\{"([a-z-]+)"\})/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return CODE.test(name) ? [path] : [];
  });
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const sources = ROOTS.flatMap(files).map((path) => ({ path: relative(".", path).split(sep).join("/"), code: stripComments(readFileSync(path, "utf8")) }));

describe("no browser controls in the UI", () => {
  it("has no native <select> or date/time input", () => {
    const found = sources.flatMap(({ path, code }) => {
      const bad = [...(code.match(/<select\b/g) ?? []), ...[...code.matchAll(INPUT_TAG)].map((m) => TYPE.exec(m[0])).flatMap((t) => (t && ["date", "time", "datetime-local", "month", "week", "color"].includes(t[1] ?? t[2]) ? [t[1] ?? t[2]] : []))];
      return bad.map((b) => `${path}: ${b}`);
    });
    expect(found).toEqual([]);
  });

  it("has no window.prompt, confirm or alert", () => {
    const found = sources.filter(({ code }) => /\bwindow\.(prompt|confirm|alert)\s*\(/.test(code)).map((s) => s.path);
    expect(found).toEqual([]);
  });

  it("shows a checkbox or radio input only under a fully drawn control on the short list", () => {
    const found = sources.flatMap(({ path, code }) =>
      [...code.matchAll(INPUT_TAG)].flatMap((m) => {
        const t = TYPE.exec(m[0]);
        const type = t?.[1] ?? t?.[2];
        if (type !== "checkbox" && type !== "radio") return [];
        return ALLOWED[path]?.types.includes(type) ? [] : [`${path}: ${type}`];
      }),
    );
    expect(found).toEqual([]);
  });

  it("keeps the short list honest: every entry still has its input", () => {
    const stale = Object.entries(ALLOWED).flatMap(([path, { types }]) => {
      const code = sources.find((s) => s.path === path)?.code ?? "";
      const seen = [...code.matchAll(INPUT_TAG)].map((m) => {
        const t = TYPE.exec(m[0]);
        return t?.[1] ?? t?.[2];
      });
      return types.filter((type) => !seen.includes(type)).map((type) => `${path}: ${type}`);
    });
    expect(stale).toEqual([]);
  });
});
