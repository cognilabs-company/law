"use client";

import { useEffect, useState } from "react";
import { IconRefresh } from "@/components/icons";

// The build this bundle was compiled from (Vercel exposes the commit SHA).
const CURRENT = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA || "";
const CHECK_MS = 5 * 60_000;

// A tab left open across deploys keeps the old client bundle (and its old
// styles/behaviour) until a hard reload. Poll the server's build id on an
// interval and when the tab becomes visible; offer a reload — never force it
// (the user may be in a meeting or typing).
// Labels come from the server layout (getTranslations) so this stays usable
// during static prerender, outside any intl client context.
export default function VersionWatch({ labels }: { labels: { newVersion: string; reload: string } }) {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!CURRENT) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { sha?: string };
        if (alive && j.sha && j.sha !== CURRENT) setStale(true);
      } catch { /* offline — try later */ }
    };
    const iv = setInterval(check, CHECK_MS);
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    const first = setTimeout(check, 15_000);
    return () => { alive = false; clearInterval(iv); clearTimeout(first); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  if (!stale) return null;
  return (
    <div className="verwatch" role="status">
      <span>{labels.newVersion}</span>
      <button type="button" className="btn btn--pri btn--sm" onClick={() => window.location.reload()}><IconRefresh />{labels.reload}</button>
    </div>
  );
}
