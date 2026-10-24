"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { listStudioObjects } from "@/lib/services/studio";
import { SxPage } from "../layout/Page";

// Constructors that hold one global configuration (TSK-136097: document
// services' global settings). There is one active record with versions, so
// "new" opens the existing record instead of starting a second one; only
// when none exists does the create form appear.
export const SINGLETON_CODES: ReadonlySet<string> = new Set(["K26"]);
const GONE = new Set(["archived", "rejected", "deleted"]);

export function SingletonGate({ code, children }: { code: string; children: ReactElement }): ReactElement {
  const t = useTranslations("studio");
  const router = useRouter();
  const [state, setState] = useState<"checking" | "none">("checking");
  useEffect(() => {
    let alive = true;
    listStudioObjects({ constructorCode: code, limit: 20 }).then(
      (r) => {
        if (!alive) return;
        const live = r.items.find((o) => !GONE.has((o.statusRaw || o.status || "").toLowerCase()));
        if (live) router.replace(`/admin/studio/o/${encodeURIComponent(live.id)}?single=1`);
        else setState("none");
      },
      () => alive && setState("none"),
    );
    return () => {
      alive = false;
    };
  }, [code, router]);
  if (state === "none") return children;
  return (
    <SxPage title={t("sx.single.opening")} section="home" crumbs={[]} aiId="admin.studio.single">
      <p className="sx-vh" role="status">
        {t("sx.single.opening")}
      </p>
    </SxPage>
  );
}
