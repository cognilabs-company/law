"use client";

import { useEffect, useState } from "react";
import Select from "@/components/Select";
import { logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { exportStudioVersionsXlsx, exportStudioXlsx, listStudioObjects, useStudioRegistry, type StudioObject } from "@/lib/services/studio";
import { STUDIO_CODES, ctorOrder } from "@/lib/studio/constructors";
import { StudioErrorNote, useStudioErrorText, useStudioText } from "../bits";
import { PanelHead } from "./ui";
import { IconDownload, IconHistory, IconLayers } from "@/components/icons";

type Objs = { code: string; items: StudioObject[]; total: number; error: unknown };

const AI = "admin.studio.settings.export";
const LIMIT = 200;

export default function ExportPanel() {
  const { t, ctorName, status, num } = useStudioText();
  const errText = useStudioErrorText();
  const reg = useStudioRegistry();
  const [allBusy, setAllBusy] = useState(false);
  const [code, setCode] = useState("");
  const [objs, setObjs] = useState<Objs | null>(null);
  const [objId, setObjId] = useState("");
  const [verBusy, setVerBusy] = useState(false);

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

  const codes = (reg.items.length ? reg.items.map((c) => c.code) : [...STUDIO_CODES]).sort((a, b) => ctorOrder(a) - ctorOrder(b));
  const codeOpts = codes.map((c) => ({ value: c, label: `${c} · ${ctorName(c)}` }));
  const live = objs && objs.code === code ? objs : null;
  const loading = Boolean(code) && !live;
  const list = live?.items ?? [];
  const objOpts = list.map((o) => ({ value: o.id, label: `${o.title || o.id} · ${status(o.status, o.statusRaw)}${o.currentVersion ? ` · v${o.currentVersion}` : ""}` }));
  const picked = list.find((o) => o.id === objId) ?? null;

  async function exportAll() {
    setAllBusy(true);
    try {
      await exportStudioXlsx();
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
      toast(t("shell.exportOk"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.export.versions", e);
      toast(errText(e).text || t("shell.exportFail"), { tone: "err" });
    } finally {
      setVerBusy(false);
    }
  }

  return (
    <div className="stu-set__stack stu-sexp">
      <section className="stu-card stu-sexp__card" data-ai-id={`${AI}.all`} data-ai-type="section" data-ai-label={t("settings.export.allTitle")}>
        <PanelHead icon={IconLayers} title={t("settings.export.allTitle")} text={t("settings.export.allText")} />
        <ul className="stu-sexp__list">
          <li>{t("settings.export.allP1")}</li>
          <li>{t("settings.export.allP2")}</li>
          <li>{t("settings.export.allP3")}</li>
        </ul>
        <button type="button" className="btn btn--grad btn--sm stu-sexp__go" onClick={() => void exportAll()} disabled={allBusy} data-ai-id={`${AI}.all.download`} data-ai-type="button" data-ai-label={t("settings.export.allBtn")}>
          {allBusy ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
          {t("settings.export.allBtn")}
        </button>
      </section>

      <section className="stu-card stu-sexp__card" data-ai-id={`${AI}.versions`} data-ai-type="section" data-ai-label={t("settings.export.verTitle")}>
        <PanelHead icon={IconHistory} title={t("settings.export.verTitle")} text={t("settings.export.verText")} />
        <div className="stu-sform__grid">
          <div className="stu-fld" data-ai-id={`${AI}.versions.constructor`} data-ai-type="select" data-ai-label={t("settings.export.pickCtor")}>
            <span className="stu-fld__l">{t("settings.export.pickCtor")}</span>
            <Select
              value={code}
              onChange={(v) => {
                setCode(v);
                setObjId("");
              }}
              options={codeOpts}
              placeholder={t("settings.export.pickCtorPh")}
              ariaLabel={t("settings.export.pickCtor")}
            />
          </div>
          <div className="stu-fld" data-ai-id={`${AI}.versions.object`} data-ai-type="select" data-ai-label={t("settings.export.pickObj")}>
            <span className="stu-fld__l">
              {t("settings.export.pickObj")}
              {live && live.total > list.length ? <small>{t("settings.export.shownOf", { n: num(list.length), total: num(live.total) })}</small> : null}
            </span>
            {!code ? (
              <p className="stu-hint stu-sexp__wait">{t("settings.export.pickCtorFirst")}</p>
            ) : loading ? (
              <p className="stu-hint stu-sexp__wait">
                <span className="stu-spin" aria-hidden />
                {t("common.loading")}
              </p>
            ) : live?.error ? null : !list.length ? (
              <p className="stu-hint stu-sexp__wait">{t("settings.export.noObjects")}</p>
            ) : (
              <Select value={objId} onChange={setObjId} options={objOpts} placeholder={t("settings.export.pickObjPh")} ariaLabel={t("settings.export.pickObj")} />
            )}
          </div>
        </div>
        {live?.error ? <StudioErrorNote error={live.error} compact /> : null}
        <button
          type="button"
          className="btn btn--line btn--sm stu-sexp__go"
          onClick={() => void exportVersions()}
          disabled={!picked || verBusy}
          data-ai-id={`${AI}.versions.download`}
          data-ai-type="button"
          data-ai-label={t("settings.export.verBtn")}
        >
          {verBusy ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
          {t("settings.export.verBtn")}
        </button>
      </section>
    </div>
  );
}
