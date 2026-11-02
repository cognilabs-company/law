"use client";

import { useTranslations } from "next-intl";

export default function ViewLoading() {
  const t = useTranslations("admin.ccx");
  return (
    <div className="opx-vload" role="status" aria-busy="true" aria-label={t("loading")}>
      <div className="opx-vload__head">
        <i className="opx-shim opx-vload__title" />
        <i className="opx-shim opx-vload__tabs" />
      </div>
      <div className="opx-vload__tiles">
        <i className="opx-shim" />
        <i className="opx-shim" />
        <i className="opx-shim" />
        <i className="opx-shim" />
      </div>
      <div className="opx-vload__body">
        <i className="opx-shim opx-vload__main" />
        <i className="opx-shim opx-vload__side" />
      </div>
    </div>
  );
}
