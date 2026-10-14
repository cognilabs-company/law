"use client";

import type { StudioRoute } from "@/lib/services/studio";
import { useStudioHuman } from "./human";
import { IconArrowRight, IconShieldCheck } from "@/components/icons";

// A route read at a glance: each stage with who decides, how many of them it
// takes and by when; the primary superadmin's closing stage when the route
// asks for it; and, for a route with no stage at all, what happens instead.
export default function RouteChain({ route, superadmin = "" }: { route: StudioRoute; superadmin?: string }) {
  const { t, role, stepTitle, num } = useStudioHuman();
  const steps = route.steps;
  if (!steps.length && !route.requireSuperadmin) return <span className="stu-hint">{route.autoPublishWhenEmpty ? t("settings.routes.noStepsAuto") : t("settings.routes.noStepsWait")}</span>;
  return (
    <ol className="stu-schain">
      {steps.map((s, i) => {
        const names = s.approvers.map((p) => p.name).filter(Boolean);
        const who = names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${num(names.length - 3)}` : "") : s.role ? role(s.role) : s.approverIds.length ? "" : t("settings.routes.noApprovers");
        const count = s.approverIds.length;
        const mode = count > 1 ? (s.mode === "any" ? t("settings.routes.summaryAny") : s.mode === "quorum" ? t("settings.routes.summaryQuorum", { n: num(s.required), of: num(count) }) : t("settings.routes.summaryAll")) : "";
        const sla = s.deadlineValue ? t("settings.routes.summarySla", { n: num(s.deadlineValue), unit: t(`settings.routes.slaUnit.${s.deadlineUnit}`) }) : "";
        const sub = [who, mode, sla].filter(Boolean).join(" · ");
        return (
          <li key={i}>
            {i > 0 ? <IconArrowRight className="stu-schain__arr" aria-hidden /> : null}
            <span className="stu-schain__s">
              <em>{i + 1}</em>
              <span>
                <b>{stepTitle(s.title, s.role) || t("settings.routes.stepN", { n: i + 1 })}</b>
                {sub && sub !== stepTitle(s.title, s.role) ? <small>{sub}</small> : null}
              </span>
            </span>
          </li>
        );
      })}
      {route.requireSuperadmin ? (
        <li>
          {steps.length ? <IconArrowRight className="stu-schain__arr" aria-hidden /> : null}
          <span className="stu-schain__s is-final">
            <em>
              <IconShieldCheck aria-hidden />
            </em>
            <span>
              <b>{t("settings.routes.superadminStep")}</b>
              {superadmin ? <small>{superadmin}</small> : null}
            </span>
          </span>
        </li>
      ) : null}
    </ol>
  );
}
