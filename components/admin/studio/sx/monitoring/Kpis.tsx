"use client";

import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2Icon, UsersIcon } from "lucide-react";
import { SxCount } from "../shared/Count";
import { ActivityIcon, SaveIcon, SendIcon, TimerIcon, glyph } from "../icons";
import { enterStyle } from "../hooks";
import type { SxIcon } from "../types";

export type MonKpiData = {
  users: number;
  online: number;
  sessions: number;
  short: number;
  sec: number;
  saves: number;
  savedObjects: number;
  objects: number | null;
  submitted: number | null;
};

function Tile({ icon, hue, label, value, hint, i }: { icon: SxIcon; hue: string; label: string; value: ReactNode; hint?: ReactNode; i: number }) {
  return (
    <div className="sx-mon-kpi sx-enter" data-hue={hue} style={enterStyle(i)}>
      <span className="sx-mon-kpi__icon" aria-hidden="true">
        {glyph(icon, { size: 18 })}
      </span>
      <span className="sx-mon-kpi__label">{label}</span>
      <span className="sx-mon-kpi__value">{value}</span>
      {hint ? <span className="sx-mon-kpi__hint">{hint}</span> : null}
    </div>
  );
}

export function MonKpis({ data, loading }: { data: MonKpiData; loading: boolean }): ReactElement {
  const t = useTranslations("studio");
  const v = (n: number) => (loading ? null : n);
  const h = Math.floor(Math.max(0, data.sec) / 3600);
  const m = Math.floor((Math.max(0, data.sec) % 3600) / 60);
  const avg = data.sessions > 0 ? Math.round(data.sec / data.sessions / 60) : 0;
  return (
    <div className="sx-mon-kpis" data-ai-id="admin.studio.monitoring.summary" data-ai-type="section" data-ai-label={t("monitoring.summary")}>
      <div className="sx-mon-kpis__grid">
        <Tile i={1} icon={UsersIcon} hue="blue" label={t("monitoring.kpi.users")} value={<SxCount value={v(data.users)} />} hint={loading ? null : t("sx.mon.kpi.usersHint", { n: data.online })} />
        <Tile
          i={2}
          icon={ActivityIcon}
          hue="violet"
          label={t("monitoring.kpi.sessions")}
          value={<SxCount value={v(data.sessions)} />}
          hint={loading ? null : data.short ? t("sx.mon.kpi.shortHint", { n: data.short }) : t("sx.mon.kpi.noShort")}
        />
        <Tile
          i={3}
          icon={TimerIcon}
          hue="jade"
          label={t("monitoring.kpi.duration")}
          value={
            <>
              {h > 0 ? (
                <>
                  <SxCount value={v(h)} />
                  <small>{t("sx.mon.unit.h")}</small>{" "}
                </>
              ) : null}
              <SxCount value={v(m)} />
              <small>{t("sx.mon.unit.m")}</small>
            </>
          }
          hint={loading ? null : t("sx.mon.kpi.avgHint", { m: avg })}
        />
        <Tile i={4} icon={SaveIcon} hue="amber" label={t("monitoring.kpi.saves")} value={<SxCount value={v(data.saves)} />} hint={loading ? null : t("sx.mon.kpi.savesHint", { n: data.savedObjects })} />
      </div>
      <div className="sx-mon-kpis__chips">
        <span className="sx-mon-chip sx-enter" data-hue="teal" style={enterStyle(5)}>
          {glyph(FilePlus2Icon, { size: 15 })}
          <span>{t("monitoring.kpi.objects")}</span>
          <b className="sx-num">{loading || data.objects === null ? "—" : data.objects}</b>
        </span>
        <span className="sx-mon-chip sx-enter" data-hue="orange" style={enterStyle(6)}>
          {glyph(SendIcon, { size: 15 })}
          <span>{t("monitoring.kpi.submitted")}</span>
          <b className="sx-num">{loading || data.submitted === null ? "—" : data.submitted}</b>
        </span>
      </div>
    </div>
  );
}
