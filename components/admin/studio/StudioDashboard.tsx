"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { syncStudioConstructors, useStudioAccess, useStudioRegistry } from "@/lib/services/studio";
import StudioShell from "./StudioShell";
import { StudioErrorNote, useStudioText } from "./bits";
import DashTiles from "./dash/DashTiles";
import DashMine from "./dash/DashMine";
import DashCatalog from "./dash/DashCatalog";
import { useDashData } from "./dash/useDashData";
import { StudioConfirm, useStudioRefetch } from "./dash/shared";
import { IconRefresh } from "@/components/icons";

function DashBody({ isAdmin, canReview, onSync }: { isAdmin: boolean; canReview: boolean; onSync: () => void }) {
  const reg = useStudioRegistry();
  const data = useDashData();
  useStudioRefetch(() => void data.reload());
  const loading = data.phase === "loading";

  return (
    <>
      {data.phase === "error" ? (
        <StudioErrorNote error={data.error} onRetry={() => void data.reload()} busy={data.busy} />
      ) : (
        <DashTiles counts={data.counts} loading={loading} canReview={canReview} />
      )}
      <DashMine items={data.mine} loading={loading} error={data.phase === "error" ? null : data.mineError} busy={data.busy} onRetry={() => void data.reload()} />
      <DashCatalog items={reg.items} perCode={data.perCode} canSync={isAdmin} onSync={onSync} />
    </>
  );
}

export default function StudioDashboard() {
  const { t } = useStudioText();
  const acc = useStudioAccess();
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncErr, setSyncErr] = useState<unknown>(null);

  function openSync() {
    setSyncErr(null);
    setSyncOpen(true);
  }

  async function runSync() {
    setSyncBusy(true);
    setSyncErr(null);
    try {
      const res = await syncStudioConstructors();
      setSyncOpen(false);
      toast(res.count ? t("dash.sync.done", { n: res.count }) : t("dash.sync.donePlain"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.sync", e);
      setSyncErr(e);
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <StudioShell
      title={t("dash.title")}
      lead={t("dash.lead")}
      actions={
        acc.isAdmin ? (
          <button type="button" className="btn btn--soft btn--sm" onClick={openSync} disabled={syncBusy} data-ai-id="admin.studio.dash.sync" data-ai-type="button" data-ai-label={t("dash.sync.cta")}>
            <IconRefresh className={syncBusy ? "stu-spinning" : undefined} aria-hidden />
            {t("dash.sync.cta")}
          </button>
        ) : null
      }
    >
      <DashBody isAdmin={acc.isAdmin} canReview={acc.canReview} onSync={openSync} />
      <StudioConfirm
        open={syncOpen}
        title={t("dash.sync.title")}
        text={t("dash.sync.text")}
        icon={IconRefresh}
        tone="brand"
        confirmLabel={t("dash.sync.confirm")}
        busy={syncBusy}
        error={syncErr}
        onConfirm={() => void runSync()}
        onClose={() => setSyncOpen(false)}
        aiId="admin.studio.dash.sync-modal"
      />
    </StudioShell>
  );
}
