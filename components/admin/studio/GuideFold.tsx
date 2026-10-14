"use client";

import { useId, useState } from "react";
import type { StudioConstructor } from "@/lib/services/studio";
import { IconAlert, IconChevronDown, IconLightbulb, IconShieldCheck } from "@/components/icons";
import { ConstructorGuide, RiskBadge } from "./guide";
import { useStudioHuman } from "./human";

export default function GuideFold({ ctor, defaultOpen }: { ctor: StudioConstructor; defaultOpen: boolean }) {
  const hm = useStudioHuman();
  const { t } = hm;
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen);
  const x = ctor.experience;
  const nav = ctor.navigation;
  const loud = x.risk === "high" || x.warnings.length > 0;
  return (
    <section className={`stu-gfold${open ? " is-open" : ""}`} aria-label={t("ux.whatTitle")}>
      <div className="stu-gfold__head">
        <span className="stu-gfold__ic" aria-hidden>
          <IconLightbulb />
        </span>
        <div className="stu-gfold__t">
          <b>{t("ux.whatTitle")}</b>
          <small>{hm.what(ctor)}</small>
        </div>
        <div className="stu-gfold__chips">
          <RiskBadge risk={x.risk} compact />
          {ctor.approvalRequired ? (
            <span className="stu-gfold__chip">
              <IconShieldCheck aria-hidden />
              {t("ux.approvalYes")}
            </span>
          ) : null}
          {nav && nav.steps ? <span className="stu-gfold__chip">{t("ux.stepOf", { n: nav.step, of: nav.steps, group: hm.groupTitle(nav.groupKey, nav.groupTitle) })}</span> : null}
        </div>
        <button type="button" className="stu-gfold__tg" aria-expanded={open} aria-controls={`${uid}-body`} onClick={() => setOpen((v) => !v)} data-ai-id="admin.studio.editor.guide.toggle" data-ai-type="button" data-ai-label={t("ux.whatTitle")}>
          {open ? t("ux.guideHide") : t("ux.guideShow")}
          <IconChevronDown aria-hidden />
        </button>
      </div>
      {!open && loud ? (
        <p className={`stu-gfold__warn stu-gfold__warn--${x.risk}`} role={x.risk === "high" ? "alert" : "note"}>
          <IconAlert aria-hidden />
          <b>{x.risk === "high" ? t("ux.highTitle") : t("ux.warnTitle")}</b>
          <span>{x.warnings.map((w) => hm.warn(w)).join(" · ")}</span>
        </p>
      ) : null}
      <div id={`${uid}-body`} className="stu-gfold__body" hidden={!open}>
        {open ? <ConstructorGuide ctor={ctor} /> : null}
      </div>
    </section>
  );
}
