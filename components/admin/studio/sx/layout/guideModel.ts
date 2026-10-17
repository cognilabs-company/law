import { WARN_IDS, normText } from "@/lib/studio/humanText";
import { normStudioRoute, type StudioConstructor, type StudioRoute, type StudioRouteStep, type StudioSchemaField } from "@/lib/services/studio";
import { isEnglishLooking } from "../labels";
import type { StudioLabels } from "../useStudioLabels";

export type SxGuideTranslate = (key: string, values?: Record<string, string | number>) => string;

export type SxGuidePlace = { key: string; title: string; what: string; route: string };
export type SxGuideDep = { code: string; name: string; group: string; done: boolean };
export type SxGuideList = { kind: "required" | "recommended" | "next"; items: SxGuideDep[] };

export type SxGuideModel = {
  what: string;
  result: string;
  places: SxGuidePlace[];
  surfaces: string;
  steps: string[];
  position: string;
  blocked: { text: string; first: SxGuideDep } | null;
  lists: SxGuideList[];
  noDeps: boolean;
  approval: string;
  route: string[];
  origin: string;
  risk: string;
  warnings: string[];
};

const LIST_MAX = 5;

function unique(items: readonly string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

export function guideRouteOf(ctor: Pick<StudioConstructor, "raw">): StudioRoute | null {
  const raw = ctor.raw?.approval_route;
  return raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length ? normStudioRoute(raw) : null;
}

export function isApprovalWarning(text: string): boolean {
  const n = normText(text);
  return (WARN_IDS[n] ?? WARN_IDS[n.replace(/\.$/, "")] ?? WARN_IDS[`${n}.`]) === "w1";
}

export function routeStepName(step: Pick<StudioRouteStep, "role" | "title">, labels: Pick<StudioLabels, "role">): string {
  const title = step.title.trim();
  const role = step.role.trim();
  const words = role.toLowerCase().split(/[_\s-]+/).filter(Boolean);
  const titleWords = title.toLowerCase().split(/[_\s-]+/).filter(Boolean);
  const sameAsRole = !!role && (titleWords.every((w) => words.includes(w)) || title === labels.role(role));
  if (title && !sameAsRole && !isEnglishLooking(title)) return title;
  return labels.role(role || title, title);
}

function fieldNames(fields: readonly StudioSchemaField[], code: string, labels: Pick<StudioLabels, "field">): string[] {
  return unique(fields.map((f) => labels.field(f.key, { ctor: code, backend: f.label })));
}

export function buildGuide(code: string, ctor: StudioConstructor, registry: readonly StudioConstructor[], route: StudioRoute | null, labels: StudioLabels, t: SxGuideTranslate): SxGuideModel {
  const x = ctor.experience;
  const titleOf = (c: string) => registry.find((r) => r.code === c)?.title;
  const reg = registry.find((r) => r.code === code) ?? null;

  const seen = new Set<string>();
  const places: SxGuidePlace[] = [];
  for (const s of x.whereUsed) {
    const p = labels.page(s);
    const key = `${p.title}|${s.route}`;
    if (!p.title || seen.has(key)) continue;
    seen.add(key);
    places.push({ key, title: p.title, what: p.what, route: s.route });
  }
  const where = unique(places.map((p) => p.title));
  const result = where.length ? t("sx.guide.result", { where: labels.list(where) }) : t("sx.guide.resultNone");
  const pageTitles = new Set(where.map((w) => w.toLowerCase()));
  const surfaceNames = unique(
    x.preview.surfaceKeys
      .map((key) => ({ key: key.trim(), name: labels.surface(key).trim() }))
      .filter((s) => s.key && s.name && s.name !== s.key && !pageTitles.has(s.name.toLowerCase()))
      .map((s) => s.name),
  );
  const surfaces = surfaceNames.length ? t("sx.guide.surfaces", { list: labels.list(surfaceNames, LIST_MAX) }) : "";

  const shown = ctor.typed.filter((f) => !f.hidden);
  const need = new Set(ctor.schema.required);
  const picks = shown.filter((f) => !!f.source || !!f.item?.source);
  const required = shown.filter((f) => f.required || need.has(f.key));
  const picked = new Set(fieldNames(picks, code, labels));
  const fill = fieldNames(required, code, labels).filter((name) => !picked.has(name));
  const steps: string[] = [];
  if (picks.length) steps.push(t("sx.guide.stepPick", { list: labels.list([...picked], LIST_MAX) }));
  if (fill.length) steps.push(t("sx.guide.stepFill", { list: labels.list(fill, LIST_MAX) }));
  else if (!required.length) steps.push(t("sx.guide.stepFillNone"));
  steps.push(t("sx.guide.stepSave"));
  steps.push(ctor.approvalRequired ? t("sx.guide.stepSend") : t("sx.guide.stepPublish"));

  const dep = (c: string): SxGuideDep => {
    const item = registry.find((r) => r.code === c);
    return { code: c, name: labels.ctorName(c, titleOf(c)), group: item?.navigation?.groupKey ?? "", done: !!item?.completed };
  };
  const nav = ctor.navigation ?? reg?.navigation ?? null;
  const position = nav && nav.step > 0 ? t("sx.guide.position", { group: labels.groupName(nav.groupKey, nav.groupTitle), n: nav.step }) : "";
  const missing = unique(reg?.missingRequired.length ? reg.missingRequired : ctor.missingRequired);
  const blockedNow = (reg?.availability || ctor.availability) === "blocked" || missing.length > 0;
  const blocked = blockedNow && missing.length ? { text: t("sx.guide.blocked", { list: labels.list(missing.map((c) => labels.ctorName(c, titleOf(c)))) }), first: dep(missing[0]) } : null;
  const lists: SxGuideList[] = nav
    ? (
        [
          { kind: "required", items: unique(nav.requiredBefore).map(dep) },
          { kind: "recommended", items: unique(nav.recommendedBefore).map(dep) },
          { kind: "next", items: unique(nav.nextSteps).map(dep) },
        ] as SxGuideList[]
      ).filter((l) => l.items.length)
    : [];
  const noDeps = !position && !blocked && !lists.length;

  const approval = ctor.approvalRequired ? t("sx.guide.approvalYes") : t("sx.guide.approvalNo");
  const routeLines: string[] = [];
  let origin = "";
  if (ctor.approvalRequired && route) {
    if (route.steps.length) routeLines.push(t("sx.guide.routeSteps", { list: labels.list(unique(route.steps.map((s) => routeStepName(s, labels))), LIST_MAX) }));
    else {
      if (route.requireSuperadmin) routeLines.push(t("sx.guide.routeSuper"));
      if (route.autoPublishWhenEmpty) routeLines.push(t("sx.guide.routeAuto"));
    }
    origin = t(`sx.routeFrom.${route.source}`);
  }

  const warnings = unique(x.warnings.filter((w) => !isApprovalWarning(w)).map((w) => labels.warning(w)));

  return {
    what: labels.ctorWhat(code, { purpose: x.purpose, description: ctor.description }),
    result,
    places,
    surfaces,
    steps,
    position,
    blocked,
    lists,
    noDeps,
    approval,
    route: routeLines,
    origin,
    risk: t("sx.guide.risk", { level: labels.risk(x.risk) }),
    warnings,
  };
}
