"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listAdminCalls, getAdminCallDetail, type AdminCallRow, type AdminCallDetail } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { shortDateTime } from "@/lib/date";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminItem, Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import { IconVideo, IconEye, IconUsers } from "@/components/icons";

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CallDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.callHistory");
  const locale = useLocale();
  const [d, setD] = useState<AdminCallDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(false); }, 0);
    getAdminCallDetail(id).then((x) => alive && setD(x)).catch(() => alive && setErr(true));
    return () => { alive = false; clearTimeout(h); };
  }, [id]);
  const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? null : (
    <div className="dkv__row" key={k}><span>{k}</span><b>{String(v)}</b></div>
  ));

  return (
    <Modal open={!!id} onClose={onClose} title={d?.call.title || t("detailTitle")}>
      {err ? <Notice ok={false} msg={t("detailError")} /> : !d ? <Skeleton rows={3} /> : (
        <div className="dkv">
          <div className="dkv__sect">
            <b>{t("detail.meeting")}</b>
            {row(t("detail.status"), t.has(`status.${d.call.status}`) ? t(`status.${d.call.status}`) : d.call.status)}
            {row(t("detail.type"), d.call.callType)}
            {row(t("detail.room"), d.room?.title || d.call.roomId)}
            {row(t("detail.started"), shortDateTime(d.call.startedAt, locale))}
            {row(t("detail.ended"), shortDateTime(d.call.endedAt, locale))}
            {row(t("detail.duration"), d.durationMinutes ? t("detail.minutes", { n: d.durationMinutes }) : mmss(d.durationSeconds))}
          </div>
          <div className="dkv__sect">
            <b>{t("detail.creator")}</b>
            {row(t("detail.name"), d.creator?.name || d.call.creatorName)}
            {row(t("detail.phone"), d.creator?.phone)}
          </div>
          <div className="dkv__sect">
            <b>{t("detail.participants")} ({d.participants.length})</b>
            {d.participants.length ? (
              <ul className="dkv__list">
                {d.participants.map((p) => (
                  <li key={p.userId}><b>{p.name || p.userId}</b><span>{[p.role, p.status].filter(Boolean).join(" · ")}</span></li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("detail.noParticipants")}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminCallHistory() {
  const t = useTranslations("admin.callHistory");
  const locale = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const res = useResource(() => listAdminCalls({ from: from || undefined, to: to || undefined }), [from, to]);
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{res.data.length}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("lead")}</p>

      <div className="lfilters" style={{ marginBottom: 16 }}>
        <DatePicker value={from} onChange={setFrom} placeholder={t("from")} ariaLabel={t("from")} max={to || undefined} clearLabel={t("clearDates")} />
        <DatePicker value={to} onChange={setTo} placeholder={t("to")} ariaLabel={t("to")} min={from || undefined} clearLabel={t("clearDates")} />
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconVideo />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {res.data.map((c: AdminCallRow, i) => (
            <AdminItem
              key={c.id || i}
              index={i + 1}
              title={c.title || t("untitled")}
              meta={[c.creatorName, shortDateTime(c.startedAt, locale), c.durationSeconds ? mmss(c.durationSeconds) : ""].filter(Boolean).join(" · ")}
              right={<span className="atag atag--muted"><IconUsers style={{ width: 13, height: 13 }} />{c.participantCount}</span>}
              tags={[{ label: t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status, tone: c.status === "ended" ? undefined : "ok" }]}
              actions={<button type="button" className="aitem__act" aria-label={t("detailTitle")} title={t("detailTitle")} onClick={() => setDetail(c.id)}><IconEye /></button>}
            />
          ))}
        </div>
      )}
      <CallDetailModal id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
