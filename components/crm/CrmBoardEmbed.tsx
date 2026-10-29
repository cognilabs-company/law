"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconArrowRight, IconLayers, IconLock, IconRefresh, IconSearch } from "@/components/icons";
import { toast } from "@/lib/toast";
import { claimCrmLead, crmCan, isClaimRace, isCrmDenied, type CrmLead } from "@/lib/services/crm";
import { loadCrmMeta, useCrmMeta } from "@/lib/crm/useCrm";
import { Empty, statusColorVars, useCrmError } from "./bits";
import { LeadBoard } from "./LeadBoard";

// The CRM's fixed six-status board (contract 13cb257 §6) inside the
// call-center console, so there is one Kanban with one set of rules:
// GET /crm/kanban, status moves with the lock, Won only with a paid order.
export default function CrmBoardEmbed(): ReactElement {
  const t = useTranslations("crm.embed");
  const crmErr = useCrmError();
  const { meta, error } = useCrmMeta();
  const [mine, setMine] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [claiming, setClaiming] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [qInput]);
  const claim = useCallback(
    async (l: CrmLead) => {
      if (claiming[l.id]) return;
      setClaiming((c) => ({ ...c, [l.id]: "hold" }));
      try {
        await claimCrmLead(l.id);
        setClaiming((c) => ({ ...c, [l.id]: "done" }));
        toast(t("claimed"), { tone: "ok" });
      } catch (e) {
        toast(isClaimRace(e) ? t("claimLost") : crmErr(e), { tone: "err" });
        setClaiming((c) => {
          const n = { ...c };
          delete n[l.id];
          return n;
        });
      } finally {
        setTick((n) => n + 1);
      }
    },
    [claiming, crmErr, t],
  );
  if (error && !meta)
    return (
      <div className="crm">
        <div className="crm-card">
          {isCrmDenied(error) ? (
            <Empty icon={<IconLock />} title={t("denied")} />
          ) : (
            <Empty
              icon={<IconAlert />}
              title={t("failed")}
              action={
                <button type="button" className="crm-btn" onClick={() => void loadCrmMeta(true)}>
                  <IconRefresh aria-hidden="true" />
                  {t("retry")}
                </button>
              }
            />
          )}
        </div>
      </div>
    );
  if (!meta)
    return (
      <div className="crm">
        <span className="crm-sk crm-sk--block" style={{ height: 320 }} />
      </div>
    );
  if (!crmCan(meta, "crm.leads.view"))
    return (
      <div className="crm">
        <div className="crm-card">
          <Empty icon={<IconLock />} title={t("denied")} />
        </div>
      </div>
    );
  return (
    <div className="crm" style={statusColorVars(meta)} data-ai-target="callcenter:board">
      <div className="crm-filters">
        <label className="crm-search">
          <IconSearch aria-hidden="true" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        <span className="crm-seg" role="group" aria-label={t("scope")}>
          <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>
            {t("all")}
          </button>
          <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>
            {t("mine")}
          </button>
        </span>
        <Link className="crm-btn crm-btn--sm" href="/admin/crm/leads?tab=all&view=board" style={{ marginLeft: "auto" }}>
          <IconLayers aria-hidden="true" />
          {t("openCrm")}
          <IconArrowRight aria-hidden="true" />
        </Link>
      </div>
      <LeadBoard meta={meta} mineOnly={mine} q={q} onClaim={(l) => void claim(l)} claiming={claiming} refreshKey={tick} />
    </div>
  );
}
