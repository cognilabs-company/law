"use client";

import "./side.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxLinkButton } from "@/components/admin/studio/sx/Button";
import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";
import { DOC_ACTION_KEY, docKindOf, docLeadKey, docRouteOf, needsRecordId, roomDocumentRecordId, sellerRoleOf, templateOfRuntime, type DocKind, type DocRoute } from "./docs";
import { FileTextIcon, glyph } from "./icons";
import { SECTION_ID, type OrderView } from "./types";

export default function OrderDocuments({ o, phase, view, aiBase, runtime, listHref }: { o: MarketOrder; phase: MarketPhase; view: OrderView; aiBase: string; runtime: RuntimeConfig | null; listHref: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.docs");
  const template = templateOfRuntime(runtime);
  const sellerRole = sellerRoleOf(listHref);
  const kind: DocKind = template ? docKindOf(template) : "unknown";
  const modeOn = !!template && (template.mode === "required" || template.mode === "optional");
  const wantRecord = modeOn && phase !== "cancelled" && needsRecordId(kind, view, o.roomId);
  const [record, setRecord] = useState<{ roomId: string; id: string } | null>(null);

  useEffect(() => {
    if (!wantRecord) return;
    const ctrl = new AbortController();
    const roomId = o.roomId;
    roomDocumentRecordId(roomId, ctrl.signal).then((id) => {
      if (!ctrl.signal.aborted) setRecord({ roomId, id });
    });
    return () => ctrl.abort();
  }, [wantRecord, o.roomId]);

  if (!template || phase === "cancelled") return null;
  const known = record && record.roomId === o.roomId ? record : null;
  const route: DocRoute | null = docRouteOf({ template, view, sellerRole, serviceId: o.serviceId, roomId: o.roomId, recordId: known?.id ?? "", workId: o.workId, serviceTitle: o.serviceTitle });
  if (!route) return null;
  const pending = wantRecord && !known;
  const actionKey = DOC_ACTION_KEY[route.action];
  const required = route.mode === "required";

  return (
    <div id={SECTION_ID.documents} tabIndex={-1} className="mdoc-wrap" data-kind={route.kind} data-action={route.action}>
      <SxPanel
        title={t("title")}
        aiId={`${aiBase}.documents`}
        className="mdoc"
        actions={
          <span className="sx-pill mdoc-chip" data-tone={required ? "submitted" : "archived"} data-size="sm">
            <span className="sx-pill__text">{required ? t("required") : t("optional")}</span>
          </span>
        }
      >
        <div className="mdoc__body">
          <span className="mdoc__icon" aria-hidden="true">
            {glyph(FileTextIcon, { size: 22 })}
          </span>
          <p className="mdoc__lead">{t(docLeadKey(route.kind, view, route.action))}</p>
          {actionKey ? (
            <SxLinkButton href={route.href} variant={required ? "primary" : "secondary"} size="sm" icon={FileTextIcon} busy={pending} aiId={`${aiBase}.documents.open`} className="mdoc__open">
              {t(actionKey)}
            </SxLinkButton>
          ) : null}
        </div>
      </SxPanel>
    </div>
  );
}
