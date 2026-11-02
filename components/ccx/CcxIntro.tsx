"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CcxEmblem } from "./icons";

const KEY = "lexgo_ccx_intro";

export function introSeen(userId: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === userId;
  } catch {
    return true;
  }
}

function markSeen(userId: string) {
  try {
    sessionStorage.setItem(KEY, userId);
  } catch {}
}

export default function CcxIntro({ userId, name, calm, onDone }: { userId: string; name: string; calm: boolean; onDone: () => void }) {
  const t = useTranslations("admin.ccx.intro");
  const done = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      markSeen(userId);
      box.current?.classList.add("is-out");
      window.setTimeout(onDone, calm ? 150 : 520);
    };
    const id = window.setTimeout(finish, calm ? 650 : 2300);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish();
    };
    const node = box.current;
    node?.addEventListener("click", finish);
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(id);
      node?.removeEventListener("click", finish);
      window.removeEventListener("keydown", key);
    };
  }, [calm, onDone, userId]);

  const first = name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="opx-intro" ref={box} role="status" aria-live="polite" aria-label={t("aria")}>
      <div className="opx-intro__core">
        <span className="opx-intro__sonar" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <CcxEmblem size={96} className="opx-intro__emblem" />
      </div>
      <p className="opx-intro__role">{t("role")}</p>
      <p className="opx-intro__hi">{first ? t("hello", { name: first }) : t("helloAnon")}</p>
      <p className="opx-intro__sub">{t("preparing")}</p>
      <span className="opx-intro__bar" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}
