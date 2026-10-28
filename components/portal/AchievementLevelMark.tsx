import "./achievementForm.css";
import type { ReactElement } from "react";
import type { AchievementLevel } from "@/lib/services/achievements";

export default function AchievementLevelMark({ level }: { level: AchievementLevel }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="achf__mark">
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {level === "full" ? <circle cx="12" cy="12" r="6.5" fill="currentColor" /> : <path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />}
    </svg>
  );
}
