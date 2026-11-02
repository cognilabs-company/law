"use client";

import type { ReactNode } from "react";
import PersonName from "@/components/ui/PersonName";
import { usePerson } from "@/lib/usePerson";
import { PartyCard } from "../../panel/bits";

type Props = {
  role: string;
  id?: string;
  name?: string;
  phone?: string;
  lexgoId?: string;
  empty: string;
  lookupPhone?: boolean;
  extra?: ReactNode;
};

export default function Party({ role, id = "", name = "", phone = "", lexgoId = "", empty, lookupPhone = true, extra }: Props) {
  const known = name.trim();
  const p = usePerson(id, known);
  const shown: ReactNode = known || (!id ? empty : p === undefined ? <PersonName id={id} /> : p?.name || empty);
  const tel = phone.trim() || (lookupPhone && !known ? (p?.phone ?? "") : "");
  return <PartyCard role={role} name={shown} phone={tel || undefined} lexgoId={lexgoId || undefined} extra={extra} />;
}
