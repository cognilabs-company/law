"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CheckBox from "@/components/CheckBox";
import DatePicker from "@/components/DatePicker";
import { notify } from "@/lib/toast";
import { fmtDate, fmtNum } from "@/lib/date";
import { isPrimaryOnly } from "@/lib/services/superadvokat";
import { listMtmReports, mtmErrorKey, sendMtmReport, tashToday, type MtmPage, type MtmReport } from "@/lib/services/mobileTesting";
import { IconAlert, IconCheck, IconSend } from "@/components/icons";
import { LiveBar, MtmEmpty, MtmError, MtmForbidden, MtmFrame, MtmSkeleton, Pager, ReportBadge, TashTime, TzNote, useMtmLive, useMtmLoad } from "./MtmBits";

const PAGE = 30;
const LIVE = ["mobile_testing.report_sent"] as const;

// What the dialogs are doing: a normal send (one confirmation), or a force
// resend (a warning first, then a second confirmation that has to be ticked).
type Ask = { date: string; step: "send" | "force1" | "force2"; already?: boolean } | null;

// Daily Telegram report history (contract §6) and the manual send.
export default function MtmReports() {
  const t = useTranslations("admin.mtm.rep");
  const tm = useTranslations("admin.mtm");
  const locale = useLocale();
  const [offset, setOffset] = useState(0);
  const res = useMtmLoad<MtmPage<MtmReport>>((s) => listMtmReports(PAGE, offset, s), `r:${offset}`);
  const online = useMtmLive(LIVE, () => res.reload(true));
  const today = tashToday();
  const [day, setDay] = useState(today);
  const [ask, setAsk] = useState<Ask>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dlgErr, setDlgErr] = useState("");

  const open = (next: Ask) => {
    setAck(false);
    setDlgErr("");
    setAsk(next);
  };
  const close = () => {
    if (busy) return;
    setAsk(null);
  };
  const send = async (force: boolean) => {
    if (!ask) return;
    setBusy(true);
    setDlgErr("");
    try {
      const r = await sendMtmReport(ask.date, force);
      notify.success(r?.status === "failed" ? t("sentFailed", { date: fmtDate(ask.date, locale) }) : force ? t("resent", { date: fmtDate(ask.date, locale) }) : t("sent", { date: fmtDate(ask.date, locale) }));
      setAsk(null);
      res.reload(true);
    } catch (e) {
      const key = mtmErrorKey(e);
      if (!force && (key === "alreadySent" || key === "conflict")) {
        // Already sent: say so in the same dialog; a resend is a separate,
        // clearly-warned path, never this button.
        setAsk({ date: ask.date, step: "send", already: true });
        setDlgErr(t("alreadySent", { date: fmtDate(ask.date, locale) }));
      } else setDlgErr(key === "invalidDate" || key === "validation" ? t("badDate") : tm(`err.${key}`));
    } finally {
      setBusy(false);
    }
  };

  if (res.status === "error" && isPrimaryOnly(res.error)) {
    return (
      <MtmFrame>
        <MtmForbidden />
      </MtmFrame>
    );
  }
  const page = res.data;
  const dateText = ask ? fmtDate(ask.date, locale) : "";

  return (
    <MtmFrame>
      <div className="mtm-bar">
        <LiveBar online={online} at={res.at} refreshing={res.refreshing} failed={res.refreshFailed} onRefresh={() => res.reload(true)} />
      </div>

      <section className="mtm-panel mtm-send" aria-labelledby="mtm-send-h">
        <span className="mtm-send__ic" aria-hidden="true">
          <IconSend />
        </span>
        <div className="mtm-send__txt">
          <h2 id="mtm-send-h">{t("sendTitle")}</h2>
          <p>{t("sendLead")}</p>
        </div>
        <div className="mtm-send__form">
          <DatePicker value={day} onChange={(v) => setDay(v)} placeholder={t("pickDay")} ariaLabel={t("pickDay")} max={today || undefined} />
          <button type="button" className="btn btn--pri btn--sm" disabled={!day} onClick={() => open({ date: day, step: "send" })}>
            <IconSend aria-hidden="true" />
            {t("send")}
          </button>
        </div>
      </section>

      <section className="mtm-panel" aria-labelledby="mtm-rep-h">
        <div className="mtm-panel__h">
          <div>
            <h2 id="mtm-rep-h">{t("title")}</h2>
            <p>{t("lead")}</p>
          </div>
          <TzNote />
        </div>
        {res.status === "loading" ? (
          <MtmSkeleton rows={5} />
        ) : res.status === "error" ? (
          <MtmError error={res.error} onRetry={() => res.reload(false)} />
        ) : page && page.items.length ? (
          <>
            <div className="mtm-tablewrap mtm-tablewrap--always">
              <table className="mtm-table mtm-table--rep" data-testid="mtm-reports">
                <thead>
                  <tr>
                    <th scope="col">{t("col.date")}</th>
                    <th scope="col">{t("col.status")}</th>
                    <th scope="col">{t("col.telegram")}</th>
                    <th scope="col">{t("col.attempts")}</th>
                    <th scope="col">{t("col.sent")}</th>
                    <th scope="col">{t("col.created")}</th>
                    <th scope="col">{t("col.updated")}</th>
                    <th scope="col">
                      <span className="sr-only">{t("col.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r) => (
                    <tr key={r.id || r.reportDate}>
                      <th scope="row">{r.reportDate ? fmtDate(r.reportDate, locale) : tm("none")}</th>
                      <td>
                        <ReportBadge status={r.status} />
                      </td>
                      <td>
                        {r.telegramMessageId ? (
                          <span className="mtm-posted">
                            <IconCheck aria-hidden="true" />
                            {t("posted")}
                          </span>
                        ) : (
                          <span className="mtm-muted">{t("notPosted")}</span>
                        )}
                      </td>
                      <td className="mtm-num">{fmtNum(r.attempts, locale)}</td>
                      <td>
                        <TashTime iso={r.sentAt} />
                      </td>
                      <td>
                        <TashTime iso={r.createdAt} />
                      </td>
                      <td>
                        <TashTime iso={r.updatedAt} />
                      </td>
                      <td className="mtm-acts">
                        {!r.reportDate || r.status === "sending" ? null : r.status === "sent" ? (
                          <button type="button" className="btn btn--line btn--sm mtm-danger" onClick={() => open({ date: r.reportDate, step: "force1" })}>
                            {t("forceBtn")}
                          </button>
                        ) : (
                          <button type="button" className="btn btn--line btn--sm" onClick={() => open({ date: r.reportDate, step: "send" })}>
                            {r.status === "failed" ? t("retryBtn") : t("sendBtn")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={page.total} limit={page.limit || PAGE} offset={page.offset} onPage={setOffset} busy={res.refreshing} />
          </>
        ) : (
          <MtmEmpty icon={<IconSend aria-hidden="true" />} title={t("empty")} text={t("emptyText")} />
        )}
      </section>

      <Modal
        open={ask?.step === "send"}
        onClose={close}
        title={t("confirm.title", { date: dateText })}
        icon={<IconSend />}
        size="sm"
        busy={busy}
        footer={
          <div className="cdlg__acts">
            <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
              {t("cancel")}
            </button>
            {ask?.already ? (
              <button type="button" className="btn btn--line mtm-danger" onClick={() => open({ date: ask.date, step: "force1" })} disabled={busy}>
                {t("forceBtn")}
              </button>
            ) : (
              <button type="button" className="btn btn--pri" onClick={() => void send(false)} disabled={busy} aria-busy={busy || undefined} data-testid="mtm-send-confirm">
                {busy ? t("sending") : t("confirm.ok")}
              </button>
            )}
          </div>
        }
      >
        <div className="mtm-dlg" data-testid="mtm-send-dialog">
          <p>{t("confirm.text", { date: dateText })}</p>
          <p className="mtm-muted">{t("confirm.auto")}</p>
          {dlgErr ? (
            <p className="mtm-form__top" role="alert">
              <IconAlert aria-hidden="true" />
              {dlgErr}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={ask?.step === "force1"}
        onClose={close}
        title={t("force1.title", { date: dateText })}
        icon={<IconAlert />}
        size="sm"
        footer={
          <div className="cdlg__acts">
            <button type="button" className="btn btn--line" onClick={close}>
              {t("cancel")}
            </button>
            <button type="button" className="btn btn--line mtm-danger" onClick={() => ask && open({ date: ask.date, step: "force2" })} data-testid="mtm-force-next">
              {t("force1.ok")}
            </button>
          </div>
        }
      >
        <div className="mtm-dlg mtm-dlg--warn" data-testid="mtm-force1">
          <p className="mtm-warn">
            <IconAlert aria-hidden="true" />
            {t("force1.text", { date: dateText })}
          </p>
          <p className="mtm-muted">{t("force1.why")}</p>
        </div>
      </Modal>

      <Modal
        open={ask?.step === "force2"}
        onClose={close}
        title={t("force2.title")}
        icon={<IconAlert />}
        size="sm"
        busy={busy}
        footer={
          <div className="cdlg__acts">
            <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="button" className="btn btn--pri mtm-danger-solid" onClick={() => void send(true)} disabled={!ack || busy} aria-busy={busy || undefined} data-testid="mtm-force-confirm">
              {busy ? t("sending") : t("force2.ok")}
            </button>
          </div>
        }
      >
        <div className="mtm-dlg mtm-dlg--warn" data-testid="mtm-force2">
          <p className="mtm-warn">
            <IconAlert aria-hidden="true" />
            {t("force2.text", { date: dateText })}
          </p>
          <CheckBox checked={ack} onChange={setAck}>
            {t("force2.ack")}
          </CheckBox>
          {dlgErr ? (
            <p className="mtm-form__top" role="alert">
              <IconAlert aria-hidden="true" />
              {dlgErr}
            </p>
          ) : null}
        </div>
      </Modal>
    </MtmFrame>
  );
}
