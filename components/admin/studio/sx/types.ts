import type { LucideIcon } from "lucide-react";

export type SxIcon = LucideIcon;
export type SxLocale = "uz" | "ru" | "en";
export type SxTone = "draft" | "submitted" | "review" | "approved" | "published" | "returned" | "archived";
export type SxStage = "draft" | "submitted" | "in_review" | "approved" | "published";
export type SxStatusKey = SxStage | "returned" | "rejected" | "archived" | "active" | "inactive" | "deleted" | "scheduled" | "paused" | "expired" | "failed" | "unknown";
export type SxRecordSource = "studio" | "runtime";

export type SxStatusInfo = {
  key: SxStatusKey;
  raw: string;
  stage: number;
  branch: "returned" | "rejected" | null;
  tone: SxTone;
  icon: SxIcon;
  live: boolean;
  labelKey: string;
  hintKey: string;
};

export type SxOption = {
  value: string;
  label: string;
  description?: string;
  code?: string;
  icon?: SxIcon;
  disabled?: boolean | string;
  group?: string;
};

export type SxRule = {
  type: string;
  key?: string;
  ctor?: string;
  path?: string;
  min?: number | null;
  max?: number | null;
  minItems?: number;
  source?: string;
  options?: Readonly<Record<string, string>>;
};

export type SxErrors = Readonly<Record<string, string>>;
export type SxCrumb = { label: string; href?: string };
export type SxSection = "home" | "approvals" | "monitoring" | "settings";
export type SxNeed = "any" | "edit" | "review" | "publish" | "admin";
export type SxNoteTone = "info" | "warn" | "error" | "success";
export type SxNameCode = { name: string; code: string };
export type SxScope = { ctor?: string; path?: string; backend?: string };

export type SxControlA11y = {
  id: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};
