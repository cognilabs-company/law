"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, EmptyState, Skeleton } from "@/components/portal/DataState";
import { notify } from "@/lib/toast";
import { parseServerTime } from "@/lib/http";
import { dateTimeFull } from "@/lib/date";
import { listTemplateVersions, restoreTemplateVersion, type TemplateVersion } from "@/lib/services/templateEditor";
import { IconHistory, IconRefresh } from "@/components/icons";

function localTime(v: string, locale: string): string {
  const ms = parseServerTime(v);
  return Number.isFinite(ms) ? dateTimeFull(new Date(ms).toISOString(), locale) : v;
}

export default function VersionsModal({
  open,
  onClose,
  templateId,
  blocked,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  blocked: boolean;
  onRestored: (v: TemplateVersion) => void;
}) {
  const t = useTranslations("admin.templateEditor");
  const locale = useLocale();
  const [nonce, setNonce] = useState(0);
  const [res, setRes] = useState<{ key: string; list: TemplateVersion[] | null; error: unknown } | null>(null);
  const reqKey = `${templateId}:${nonce}`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listTemplateVersions(templateId).then(
      (list) => {
        if (alive) setRes({ key: reqKey, list, error: null });
      },
      (error: unknown) => {
        if (alive) setRes({ key: reqKey, list: null, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, templateId, reqKey]);

  const loading = !res || res.key !== reqKey;

  function restore(v: TemplateVersion) {
    void confirmDialog({
      title: t("versions.restoreTitle", { rev: v.revision ?? "—" }),
      text: t("versions.restoreText"),
      confirmLabel: t("versions.restore"),
      busyLabel: t("versions.restoring"),
      tone: "primary",
      onConfirm: async () => {
        try {
          await restoreTemplateVersion(templateId, v.id);
          return true;
        } catch (e) {
          notify.error(t("versions.restoreError"), { id: "tpe-restore", error: e });
          return false;
        }
      },
    }).then((ok) => {
      if (ok) onRestored(v);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={t("versions.title")} description={t("versions.lead")} variant="drawer" size="lg">
      <div className="tpe-vers">
        <div className="tpe-vers__bar">
          <button type="button" className="btn btn--line btn--sm" onClick={() => setNonce((n) => n + 1)} disabled={loading}>
            <IconRefresh />
            {t("versions.refresh")}
          </button>
        </div>
        {loading ? (
          <Skeleton rows={4} />
        ) : res?.error ? (
          <ErrorState error={res.error} onRetry={() => setNonce((n) => n + 1)} compact />
        ) : !res?.list?.length ? (
          <EmptyState icon={<IconHistory />} title={t("versions.empty")} />
        ) : (
          <ol className="tpe-vers__list">
            {res.list.map((v) => (
              <li key={v.id} className="tpe-ver">
                <span className="tpe-ver__rev">{v.revision != null ? `r${v.revision}` : "—"}</span>
                <div className="tpe-ver__m">
                  <b>{v.title || t("untitled")}</b>
                  <span>
                    {[v.status ? (t.has(`status.${v.status}`) ? t(`status.${v.status}`) : v.status) : "", v.createdAt ? localTime(v.createdAt, locale) : ""].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <button type="button" className="btn btn--soft btn--sm" onClick={() => restore(v)} disabled={blocked} title={blocked ? t("versions.blocked") : undefined}>
                  {t("versions.restore")}
                </button>
              </li>
            ))}
          </ol>
        )}
        {blocked ? <p className="tpe-hint">{t("versions.blocked")}</p> : null}
      </div>
    </Modal>
  );
}
