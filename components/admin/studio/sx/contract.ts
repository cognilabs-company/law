import type { ReactNode } from "react";
import type { StudioConstructor, StudioSchemaField } from "@/lib/services/studio";
import type { SxErrors, SxIcon } from "./types";
import type { StudioLabels } from "./useStudioLabels";

export type SxPayload = Record<string, unknown>;
export type SxValues = Readonly<Record<string, unknown>>;
export type SxEditMode = "create" | "edit" | "view";
export type SxTranslate = (key: string, values?: Record<string, string | number>) => string;

export type SxControlKind =
  | "text"
  | "mono"
  | "textarea"
  | "richtext"
  | "number"
  | "money"
  | "percent"
  | "switch"
  | "date"
  | "datetime"
  | "picker"
  | "pickerMulti"
  | "choices"
  | "tags"
  | "repeater"
  | "repeaterInline"
  | "keyValue"
  | "object"
  | "display"
  | "factorOverrides"
  | "checklist"
  | "legalUz"
  | "legalRu"
  | "docText"
  | "file";

export type SxLayoutCtx = { code: string; runtimeTarget: string; mode: SxEditMode; recordId: string; root: SxValues; scope: SxValues };
export type SxDyn<T> = T | ((ctx: SxLayoutCtx) => T);
export type SxChoiceMeta = { icon?: SxIcon; descriptionKey?: string; metaKey?: string };

export type SxVirtualField = {
  type: "text" | "number" | "money" | "boolean" | "select";
  labelKey: string;
  helpKey?: string;
  placeholderKey?: string;
  options?: readonly string[];
  readOnly?: boolean;
  display?: (ctx: SxLayoutCtx, labels: StudioLabels) => string;
};

export type SxLayoutField = {
  path: string;
  hidden?: boolean;
  control?: SxDyn<SxControlKind>;
  label?: SxDyn<string>;
  help?: SxDyn<string | false>;
  placeholder?: SxDyn<string | false>;
  span?: 1 | 2;
  visible?: (ctx: SxLayoutCtx) => boolean;
  locked?: (ctx: SxLayoutCtx) => string | false;
  options?: readonly string[];
  optionLabel?: (value: string, labels: StudioLabels) => string;
  optionKey?: (value: string) => string;
  optionIcon?: (value: string) => SxIcon | undefined;
  choices?: Readonly<Record<string, SxChoiceMeta>>;
  columns?: 1 | 2 | 3;
  suffixKey?: string;
  clears?: readonly string[];
  flatten?: boolean;
  addKey?: string;
  summary?: (item: SxValues, index: number, labels: StudioLabels) => string;
  meta?: (item: SxValues, index: number, labels: StudioLabels) => string;
  aiSuggest?: boolean | "service";
  legacyOf?: string;
  legacyLabel?: string;
  legacyHelp?: string;
  inlineAddKey?: string;
  emptyKey?: string;
  virtual?: SxVirtualField;
  owns?: readonly string[];
  required?: boolean;
};

export type SxLayoutSection = { id: string; titleKey: string; fields: readonly string[]; visible?: (ctx: SxLayoutCtx) => boolean; icon?: SxIcon };
export type SxTransformCtx = { code: string; runtimeTarget: string; mode: SxEditMode };

export type SxCtorLayout = {
  code: string;
  variant?: string;
  sections?: readonly SxLayoutSection[];
  fields?: readonly SxLayoutField[];
  titleField?: string | null;
  recordTitlePlaceholderKey?: string;
  transform?: (next: SxPayload, prev: SxValues, ctx: SxTransformCtx) => SxPayload;
  validate?: (payload: SxValues) => SxErrors;
  newVersion?: { focus: string };
  adapt?: (ctor: StudioConstructor) => SxCtorLayout;
  titleFrom?: (payload: SxValues) => SxDerivedTitle;
};

export type SxDerivedTitle = { value: string; path: string };

export type SxFileSlot = {
  name: string;
  meta: string;
  pending: boolean;
  has: boolean;
  busy: boolean;
  canPick: boolean;
  pick: (file: File | null) => void;
};

export type SxWarning = { key: string; tone: "warn" | "info"; values?: Readonly<Record<string, string | number>>; path?: string };
export type SxSourceProducer = { kind: "create"; code: string; href: string } | { kind: "notReady" };

export type SchemaFieldModel = { pattern: string; key: string; field: StudioSchemaField | null; layout: SxLayoutField | null; required: boolean };
export type SchemaSectionModel = { id: string; domId: string; headingId: string; title: string; fields: readonly SchemaFieldModel[]; visible?: (ctx: SxLayoutCtx) => boolean; icon?: SxIcon };
export type SchemaModel = {
  code: string;
  runtimeTarget: string;
  ctor: StudioConstructor;
  layout: SxCtorLayout;
  idPrefix: string;
  aiBase: string;
  sections: readonly SchemaSectionModel[];
  titleField: string | null;
  typedEmpty: boolean;
};
export type SchemaOnly = { sections?: readonly string[]; fields?: readonly string[] };
export type SchemaRecordTitle = { value: string; onChange: (value: string) => void; placeholderKey?: string };

export type SchemaFormProps = {
  model: SchemaModel;
  payload: SxValues;
  onChange: (next: SxPayload, path: string) => void;
  errors: SxErrors;
  warnings?: readonly SxWarning[];
  readOnly: boolean;
  mode: SxEditMode;
  recordId: string;
  recordTitle?: SchemaRecordTitle | null;
  only?: SchemaOnly;
  onDraftError?: (path: string, invalid: boolean) => void;
  footer?: ReactNode;
  file?: SxFileSlot | null;
};
