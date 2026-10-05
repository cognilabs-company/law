"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { subscribeToasts, type ToastItem } from "@/lib/toast";
import { IconAlert, IconCheck, IconClose, IconInfo } from "@/components/icons";

export default function Toaster() {
  const t = useTranslations("common.a11y");
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(
    () =>
      subscribeToasts((item) => {
        setItems((cur) => [...cur.filter((x) => x.text !== item.text), item].slice(-4));
        window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== item.id)), item.ms);
      }),
    [],
  );

  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((x) => {
        const Icon = x.tone === "ok" ? IconCheck : x.tone === "err" ? IconAlert : IconInfo;
        return (
          <div key={x.id} className={`toast toast--${x.tone}`}>
            <Icon />
            <span>{x.text}</span>
            <button type="button" aria-label={t("close")} onClick={() => setItems((cur) => cur.filter((y) => y.id !== x.id))}>
              <IconClose />
            </button>
          </div>
        );
      })}
    </div>
  );
}
