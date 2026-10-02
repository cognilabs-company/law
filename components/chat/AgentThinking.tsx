"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck } from "../icons";

// What the legal agent is doing while an answer is pending. The backend sends
// no progress events and does not stream (md/FRONTEND_LEGAL_AGENT.md §2.1), so
// the steps follow its real pipeline (router → lex.uz search → reading →
// article selection → answer → verification) on a clock. The last step holds
// until the answer lands; a greeting answers in a second or two and only ever
// shows the first one.
const STEPS = [
  { key: "thinking", at: 0 },
  { key: "searching", at: 3 },
  { key: "reading", at: 9 },
  { key: "selecting", at: 18 },
  { key: "writing", at: 30 },
  { key: "verifying", at: 46 },
] as const;
const SLOW_AFTER = 60;

export default function AgentThinking({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("agent.steps");
  const ta = useTranslations("agent");
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 500);
    return () => window.clearInterval(id);
  }, []);

  let cur = 0;
  STEPS.forEach((s, i) => { if (sec >= s.at) cur = i; });
  const label = t(STEPS[cur].key);
  const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  if (compact) {
    return (
      <div className="agt agt--compact" role="status" aria-live="polite">
        <span className="agt__orb" aria-hidden><i /></span>
        <span key={cur} className="agt__now">{label}</span>
        <span className="agt__clock">{clock}</span>
      </div>
    );
  }

  return (
    <div className="agt" role="status" aria-live="polite">
      <div className="agt__top">
        <span className="agt__orb" aria-hidden><i /></span>
        <div className="agt__head">
          <span key={cur} className="agt__now">{label}</span>
          <span className="agt__sub">{ta("thinkingSub")}</span>
        </div>
        <span className="agt__clock" aria-label={ta("elapsed")}>{clock}</span>
      </div>
      <ol className="agt__steps" aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < cur ? "done" : i === cur ? "on" : ""}>
            <span className="agt__dot">{i < cur ? <IconCheck /> : null}</span>
            <span>{t(s.key)}</span>
          </li>
        ))}
      </ol>
      <div className="agt__bar" aria-hidden><i style={{ width: `${Math.min(96, 8 + (sec / 75) * 88)}%` }} /></div>
      {sec >= SLOW_AFTER ? <p className="agt__slow">{ta("slow")}</p> : null}
    </div>
  );
}
