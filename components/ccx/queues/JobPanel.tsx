"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import Sheet from "../panel/Sheet";
import { Loading, Note, PanelHead } from "../panel/bits";
import { QueueIcon } from "./parts";
import type { QKey, QView } from "./model";
import type { DecideProps } from "./decide/types";

type AnyDecide = ComponentType<DecideProps<never>>;

function Wait() {
  const t = useTranslations("admin.ccx.panel");
  return <Loading label={t("loading")} />;
}
const wait = () => <Wait />;

const MODULES: Partial<Record<QKey, AnyDecide>> = {
  escalations: dynamic(() => import("./decide/EscalationDecide"), { ssr: false, loading: wait }) as AnyDecide,
  complaints: dynamic(() => import("./decide/QualityDecide"), { ssr: false, loading: wait }) as AnyDecide,
  mpComplaints: dynamic(() => import("./decide/MpComplaintDecide"), { ssr: false, loading: wait }) as AnyDecide,
  warranty: dynamic(() => import("./decide/WarrantyDecide"), { ssr: false, loading: wait }) as AnyDecide,
  cancellations: dynamic(() => import("./decide/CancellationDecide"), { ssr: false, loading: wait }) as AnyDecide,
  experience: dynamic(() => import("./decide/VerifyDecide"), { ssr: false, loading: wait }) as AnyDecide,
  achievements: dynamic(() => import("./decide/VerifyDecide"), { ssr: false, loading: wait }) as AnyDecide,
  licenses: dynamic(() => import("./decide/VerifyDecide"), { ssr: false, loading: wait }) as AnyDecide,
  payouts: dynamic(() => import("./decide/PayoutDecide"), { ssr: false, loading: wait }) as AnyDecide,
  recoveries: dynamic(() => import("./decide/PayoutDecide"), { ssr: false, loading: wait }) as AnyDecide,
};

export const hasPanel = (q: QKey) => Boolean(MODULES[q]);

// A panel whose code or data fails to load says so and offers a retry
// instead of leaving the sheet blank.
class PanelGuard extends Component<{ fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}

function PanelFailed({ retry }: { retry?: () => void }) {
  const t = useTranslations("admin.ccx.panel");
  return (
    <div className="opx-pfail" role="alert">
      <Note tone="bad">
        <b>{t("failed")}</b> {t("failedLead")}
      </Note>
      {retry ? (
        <button type="button" className="opx-qbtn" onClick={retry}>
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

export default function JobPanel({ job, onClose, onChanged }: { job: QView; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("admin.ccx.queues");
  const [dirty, setDirty] = useState(false);
  const Module = MODULES[job.queue];

  const done = useCallback(
    (message: string) => {
      notify.success(message, { id: `ccx-job-${job.key}` });
      onChanged();
      onClose();
    },
    [job.key, onChanged, onClose],
  );

  return (
    <Sheet
      label={`${t(`q.${job.queue}`)} · ${job.code}`}
      head={<PanelHead icon={<QueueIcon queue={job.queue} size={20} />} tag={t(`q.${job.queue}`)} code={job.code} ageMin={job.ageMin} tone={job.tone} />}
      onClose={onClose}
      dirty={dirty}
      wide={job.queue === "experience" || job.queue === "achievements" || job.queue === "licenses"}
      className="opx-jobsheet"
    >
      {!Module || job.raw == null ? (
        <PanelFailed />
      ) : (
        <PanelGuard fallback={(retry) => <PanelFailed retry={retry} />}>
          <Module job={job} item={job.raw as never} onDone={done} onClose={onClose} onDirty={setDirty} />
        </PanelGuard>
      )}
    </Sheet>
  );
}
