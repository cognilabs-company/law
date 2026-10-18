"use client";

import "../sx-tones.css";
import "./sx-settings.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { exportStudioVersionsXlsx, exportStudioXlsx, listStudioObjects, useStudioRegistry, type StudioObject } from "@/lib/services/studio";
import { toast } from "@/lib/toast";
import { SxButton } from "../Button";
import { SxDialogError } from "../editor/SxDialog";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { Field } from "../form/Field";
import { Picker } from "../form/Picker";
import { CheckIcon, ClockIcon, DownloadIcon, HistoryIcon, InfoIcon, STATUS_ICON, ctorIcon, glyph } from "../icons";
import { sxStatus } from "../status";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { SET_AI, TAB_HUE, TAB_ICON, byCtorRank, groupKeyOf } from "./model";
import { SectionHead, Squircle } from "./parts";
import { FileSpreadsheetIcon } from "lucide-react";

const AI = `${SET_AI}.export`;
const LIMIT = 200;
const MEMO = "sx-set-export";

type Objs = { code: string; items: StudioObject[]; total: number; error: unknown };
type Kind = "all" | "versions";
type Memo = Partial<Record<Kind, string>>;

function readMemo(): Memo {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(MEMO);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Memo) : {};
  } catch {
    return {};
  }
}

function writeMemo(m: Memo): void {
  try {
    window.sessionStorage.setItem(MEMO, JSON.stringify(m));
  } catch {}
}

export function ExportSection(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const reg = useStudioRegistry();
  const [allBusy, setAllBusy] = useState(false);
  const [verBusy, setVerBusy] = useState(false);
  const [code, setCode] = useState("");
  const [objs, setObjs] = useState<Objs | null>(null);
  const [objId, setObjId] = useState("");
  const [memo, setMemo] = useState<Memo>(readMemo);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    listStudioObjects({ constructorCode: code, limit: LIMIT })
      .then((r) => {
        if (alive) setObjs({ code, items: r.items, total: r.total, error: null });
      })
      .catch((e) => {
        if (alive) setObjs({ code, items: [], total: 0, error: e });
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const remember = (k: Kind) => {
    const next = { ...memo, [k]: new Date().toISOString() };
    setMemo(next);
    writeMemo(next);
  };

  const groupOrder = new Map(reg.groups.map((g) => [g.key, g.order]));
  const codeOpts: SxOption[] = reg.items
    .map((c) => ({ c, gk: groupKeyOf(c.code, reg.groups, reg.items) }))
    .sort((a, b) => (groupOrder.get(a.gk) ?? 999) - (groupOrder.get(b.gk) ?? 999) || byCtorRank(a.c.code, b.c.code))
    .map(({ c, gk }) => {
      const g = reg.groups.find((x) => x.key === gk);
      return { value: c.code, label: labels.ctorName(c.code, c.title), code: c.code, icon: ctorIcon(c.code, gk), group: gk ? labels.groupName(gk, g?.title) : t("sx.set.reg.otherGroup") };
    });

  const live = objs && objs.code === code ? objs : null;
  const loading = Boolean(code) && !live;
  const list = live?.items ?? [];
  const objOpts: SxOption[] = list.map((o) => {
    const st = sxStatus(o.statusRaw || o.status);
    return {
      value: o.id,
      label: o.title || o.id,
      description: [labels.status(o.statusRaw || o.status), o.currentVersion ? `v${o.currentVersion}` : "", o.updatedAt ? labels.date(o.updatedAt) : ""].filter(Boolean).join(" · "),
      icon: STATUS_ICON[st.key],
    };
  });
  const picked = list.find((o) => o.id === objId) ?? null;

  async function exportAll() {
    setAllBusy(true);
    try {
      await exportStudioXlsx();
      remember("all");
      toast(t("shell.exportOk"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.export.all", e);
      toast(errText(e).text || t("shell.exportFail"), { tone: "err" });
    } finally {
      setAllBusy(false);
    }
  }

  async function exportVersions() {
    if (!picked) return;
    setVerBusy(true);
    try {
      await exportStudioVersionsXlsx(picked.id, picked.title);
      remember("versions");
      toast(t("shell.exportOk"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.export.versions", e);
      toast(errText(e).text || t("shell.exportFail"), { tone: "err" });
    } finally {
      setVerBusy(false);
    }
  }

  const last = (k: Kind) =>
    memo[k] ? (
      <span className="sx-st-last">
        {glyph(ClockIcon, { size: 14 })}
        {t("sx.set.exp.last", { at: labels.dateTime(memo[k] ?? "") })}
      </span>
    ) : (
      <span className="sx-st-last" data-none="">
        {glyph(ClockIcon, { size: 14 })}
        {t("sx.set.exp.never")}
      </span>
    );

  const objHint = !code ? "" : loading ? t("sx.ui.loading") : live && !live.error && !list.length ? t("settings.export.noObjects") : live && live.total > list.length ? t("sx.set.exp.shownOf", { n: labels.num(list.length), total: labels.num(live.total) }) : "";

  return (
    <div className="sx-st-stack">
      <SectionHead icon={TAB_ICON.export} hue={TAB_HUE.export} title={t("sx.set.nav.export.title")} lead={t("sx.set.exp.lead")} titleId="sx-set-export-title" />

      <div className="sx-st-exgrid">
        <section className="sx-st-ex sx-lift sx-enter" data-hue="jade" style={{ ["--i" as string]: 0 }} aria-labelledby="sx-set-ex-all" data-ai-id={`${AI}.all`} data-ai-type="section" data-ai-label={t("settings.export.allTitle")}>
          <div className="sx-st-ex__top">
            <Squircle icon={FileSpreadsheetIcon} hue="jade" size="lg" />
            <span className="sx-st-ex__fmt">XLSX</span>
          </div>
          <h3 id="sx-set-ex-all" className="sx-st-ex__title">
            {t("settings.export.allTitle")}
          </h3>
          <p className="sx-st-ex__text">{t("settings.export.allText")}</p>
          <p className="sx-st-ex__sub">{t("sx.set.exp.inside")}</p>
          <ul className="sx-st-ex__list">
            {[t("settings.export.allP1"), t("settings.export.allP2"), t("settings.export.allP3")].map((p) => (
              <li key={p}>
                <span className="sx-st-ex__tick" aria-hidden="true">
                  {glyph(CheckIcon, { size: 12, strokeWidth: 2.5 })}
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="sx-st-ex__foot">
            {last("all")}
            <SxButton variant="primary" icon={DownloadIcon} busy={allBusy} onClick={() => void exportAll()} aiId={`${AI}.all.download`}>
              {t("settings.export.allBtn")}
            </SxButton>
          </div>
        </section>

        <section className="sx-st-ex sx-lift sx-enter" data-hue="violet" style={{ ["--i" as string]: 1 }} aria-labelledby="sx-set-ex-ver" data-ai-id={`${AI}.versions`} data-ai-type="section" data-ai-label={t("settings.export.verTitle")}>
          <div className="sx-st-ex__top">
            <Squircle icon={HistoryIcon} hue="violet" size="lg" />
            <span className="sx-st-ex__fmt">XLSX</span>
          </div>
          <h3 id="sx-set-ex-ver" className="sx-st-ex__title">
            {t("settings.export.verTitle")}
          </h3>
          <p className="sx-st-ex__text">{t("settings.export.verText")}</p>
          <div className="sx-st-ex__steps">
            <Field id="sx-set-ex-ctor" label={t("settings.export.pickCtor")} className="sx-st-ex__step" labelAside={<span className="sx-st-ex__n">1</span>}>
              {(a) => (
                <Picker
                  {...a}
                  label={t("settings.export.pickCtor")}
                  placeholder={t("settings.export.pickCtorPh")}
                  options={codeOpts}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setObjId("");
                  }}
                  searchable
                  aiId={`${AI}.versions.constructor`}
                />
              )}
            </Field>
            <Field id="sx-set-ex-obj" label={t("settings.export.pickObj")} hint={objHint} className="sx-st-ex__step" labelAside={<span className="sx-st-ex__n">2</span>}>
              {(a) => (
                <Picker
                  {...a}
                  label={t("settings.export.pickObj")}
                  placeholder={t("settings.export.pickObjPh")}
                  options={objOpts}
                  value={objId}
                  onChange={setObjId}
                  disabled={!code || loading || !list.length}
                  searchable
                  aiId={`${AI}.versions.object`}
                />
              )}
            </Field>
          </div>
          {live?.error ? <SxDialogError error={errText(live.error)} /> : null}
          {!code ? (
            <p className="sx-st-ex__note">
              {glyph(InfoIcon, { size: 14 })}
              {t("sx.set.exp.verNote")}
            </p>
          ) : null}
          <div className="sx-st-ex__foot">
            {last("versions")}
            <SxButton variant="primary" icon={DownloadIcon} busy={verBusy} disabled={!picked} onClick={() => void exportVersions()} aiId={`${AI}.versions.download`}>
              {t("settings.export.verBtn")}
            </SxButton>
          </div>
        </section>
      </div>
    </div>
  );
}
