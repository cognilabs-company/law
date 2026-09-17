"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconClock } from "@/components/icons";

// T1-10 §6: the seller's response window for a new order (backend
// details.confirmation_deadline_at, 30 business minutes). Counts down live;
// turns red under 5 minutes; "time is up" once passed (the order stays open —
// the client is offered other advocates, see §7).
export default function RespondTimer({ deadline }: { deadline?: string }) {
  const t = useTranslations("portal.common.respond");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const h = setTimeout(tick, 0);
    const iv = setInterval(tick, 1000);
    return () => { clearTimeout(h); clearInterval(iv); };
  }, []);
  if (!deadline || !now) return null;
  const at = new Date(deadline).getTime();
  if (Number.isNaN(at)) return null;
  const left = Math.max(0, Math.floor((at - now) / 1000));
  const mm = Math.floor(left / 60), ss = left % 60;
  const cls = left === 0 ? "over" : left < 300 ? "warn" : "";
  return (
    <span className={`rtimer${cls ? ` rtimer--${cls}` : ""}`} title={t("hint")}>
      <IconClock />
      {left === 0 ? t("over") : t("left", { time: `${mm}:${String(ss).padStart(2, "0")}` })}
    </span>
  );
}
