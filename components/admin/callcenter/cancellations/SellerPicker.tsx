"use client";

import { useRef, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Picker } from "@/components/admin/studio/sx/form/Picker";
import type { SxOption } from "@/components/admin/studio/sx/types";
import { fmtRating } from "@/lib/date";
import { listAdminMarketplaceSellers, type MkmSeller } from "@/lib/services/adminMarketplace";
import { searchMarketplaceSellers, type MarketSeller } from "@/lib/services/marketplace";
import { UserSwitchIcon } from "./icons";
import { mergeSellerCandidates, raceAbort } from "./model";

export type SellerPickerProps = {
  id: string;
  value: string;
  onChange: (userId: string, name: string) => void;
  serviceId: string;
  excludeUserId: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

const LIMIT = 20;

export function SellerPicker(props: SellerPickerProps): ReactElement {
  const { id, value, onChange, serviceId, excludeUserId, invalid, required, disabled } = props;
  const t = useTranslations("admin.callCenter.cancellations");
  const troles = useTranslations("marketplace.roles");
  const locale = useLocale();
  const seen = useRef(new Map<string, SxOption>());

  async function loadOptions(query: string, signal: AbortSignal): Promise<SxOption[]> {
    const [admin, pub] = await Promise.allSettled([
      raceAbort(listAdminMarketplaceSellers({ q: query, dateFrom: "", dateTo: "", limit: LIMIT }), signal),
      searchMarketplaceSellers(query, { limit: LIMIT, signal }),
    ]);
    if (admin.status === "rejected" && pub.status === "rejected") throw admin.reason;
    const adminItems: MkmSeller[] = admin.status === "fulfilled" ? admin.value.items : [];
    const pubItems: MarketSeller[] = pub.status === "fulfilled" ? pub.value.items : [];
    const rows = mergeSellerCandidates(adminItems, pubItems, serviceId).map((c): SxOption => {
      const type = c.sellerType && troles.has(c.sellerType) ? troles(c.sellerType) : "";
      const description = [
        type,
        c.region,
        c.rating > 0 ? `${fmtRating(c.rating, locale)} ★` : "",
        c.verified ? t("dialog.sellerVerified") : "",
        c.offersService ? t("dialog.sellerOffers") : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        value: c.userId,
        label: c.name,
        code: c.lexgoId || undefined,
        description: description || undefined,
        group: serviceId ? (c.offersService ? t("dialog.sellerGroupOffers") : t("dialog.sellerGroupOthers")) : undefined,
        disabled: c.userId === excludeUserId ? t("dialog.sellerCurrent") : false,
      };
    });
    for (const o of rows) seen.current.set(o.value, o);
    return rows;
  }

  async function resolveOptions(values: readonly string[]): Promise<SxOption[]> {
    return values.map((v) => seen.current.get(v)).filter((o): o is SxOption => !!o);
  }

  return (
    <Picker
      id={id}
      label={t("dialog.seller")}
      placeholder={t("dialog.sellerPh")}
      value={value}
      onChange={(v) => onChange(v, seen.current.get(v)?.label ?? "")}
      loadOptions={loadOptions}
      resolveOptions={resolveOptions}
      searchable
      clearable
      required={required}
      disabled={disabled}
      invalid={invalid}
      emptyText={t("dialog.sellerEmpty")}
      leadingIcon={UserSwitchIcon}
      aiId="call_center.cancellations.resolve.seller"
      aria-labelledby={props["aria-labelledby"]}
      aria-describedby={props["aria-describedby"]}
    />
  );
}
