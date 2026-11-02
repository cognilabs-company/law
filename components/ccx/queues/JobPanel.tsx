"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import Sheet from "../panel/Sheet";
import { Loading, PanelHead } from "../panel/bits";
import { QueueIcon } from "./parts";
import type { QKey, QView } from "./model";
import type { DecideProps } from "./decide/types";

type AnyDecide = ComponentType<DecideProps<never>>;

const wait = () => <Loading label="" />;

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
    >
      {Module ? <Module job={job} item={job.raw as never} onDone={done} onClose={onClose} onDirty={setDirty} /> : null}
    </Sheet>
  );
}
