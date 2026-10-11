"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import { IconLightbulb } from "@/components/icons";
import FeedbackDialog, { type PageContext } from "./FeedbackDialog";

// "Report a problem / suggest" in the top bar of the staff workspaces (guide
// §15): opens the feedback form with the current page already attached.
export default function FeedbackButton() {
  const t = useTranslations("internal.feedback");
  const { session } = useAuth();
  const pathname = usePathname();
  const [ctx, setCtx] = useState<PageContext | null>(null);
  if (!session || !hasInternalAccess(session)) return null;
  return (
    <>
      <button
        type="button"
        className="thm__sq fb-btn"
        onClick={() => setCtx({ path: pathname, search: typeof window !== "undefined" ? window.location.search : "" })}
        aria-label={t("button")}
        title={t("button")}
      >
        <IconLightbulb />
      </button>
      {ctx ? <FeedbackDialog open onClose={() => setCtx(null)} context={ctx} /> : null}
    </>
  );
}
