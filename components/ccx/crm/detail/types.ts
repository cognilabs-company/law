import type { CrmLead } from "@/lib/services/crm";

export type LeadWrite = (run: (lead: CrmLead) => Promise<CrmLead | null | void>, okText?: string) => Promise<boolean>;

export type LeadSheetKind = "" | "next" | "reopen" | "edit" | "assign" | "transfer" | "watchers" | "dup";
