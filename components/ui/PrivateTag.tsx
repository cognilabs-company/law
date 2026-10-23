"use client";

import "./privateTag.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconLock } from "@/components/icons";

// Next to a profile field the public never sees (license number, education):
// says so to the owner filling it in.
export default function PrivateTag(): ReactElement {
  const t = useTranslations("common.privateField");
  return (
    <span className="ptag" title={t("hint")}>
      <IconLock aria-hidden />
      {t("tag")}
    </span>
  );
}
