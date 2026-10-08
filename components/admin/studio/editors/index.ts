import type { StudioConstructor } from "@/lib/services/studio";
import GenericEditor, { genericEmptyPayload, genericValidate } from "./GenericEditor";
import K05Editor, { emptyPayload as k05Empty, validate as k05Validate } from "./K05Editor";
import K06Editor, { emptyPayload as k06Empty, validate as k06Validate } from "./K06Editor";
import K14Editor, { emptyPayload as k14Empty, validate as k14Validate } from "./K14Editor";
import K16Editor, { emptyPayload as k16Empty, validate as k16Validate } from "./K16Editor";
import K20Editor, { emptyPayload as k20Empty, validate as k20Validate } from "./K20Editor";
import type { StudioEditorEntry, StudioPayload } from "./types";

export const GENERIC_EDITOR: StudioEditorEntry = {
  Editor: GenericEditor,
  validate: genericValidate,
  emptyPayload: genericEmptyPayload,
};

const CUSTOM: Partial<Record<string, StudioEditorEntry>> = {
  K05: { Editor: K05Editor, validate: (p) => k05Validate(p), emptyPayload: () => k05Empty() },
  K06: { Editor: K06Editor, validate: (p) => k06Validate(p), emptyPayload: () => k06Empty() },
  K14: { Editor: K14Editor, validate: (p) => k14Validate(p), emptyPayload: () => k14Empty() },
  K16: { Editor: K16Editor, validate: (p) => k16Validate(p), emptyPayload: () => k16Empty() },
  K20: { Editor: K20Editor, validate: (p) => k20Validate(p), emptyPayload: () => k20Empty() },
};

export function hasCustomEditor(code: string): boolean {
  return Boolean(CUSTOM[code]);
}

export function editorFor(code: string): StudioEditorEntry {
  return CUSTOM[code] ?? GENERIC_EDITOR;
}

export function validateStudioPayload(code: string, payload: StudioPayload, constructor: StudioConstructor | null, file?: { hasFile: boolean } | null, objectTitle?: string) {
  const own = code === "K06" && file !== undefined ? k06Validate(payload, file) : editorFor(code).validate(payload, constructor);
  const out = { ...genericValidate(payload, constructor), ...own };
  const payloadTitle = typeof payload.title === "string" ? payload.title.trim() : payload.title;
  if (!payloadTitle && objectTitle && objectTitle.trim() && out.title) delete out.title;
  return out;
}

export type { StudioEditorEntry, StudioEditorProps, StudioPayload, StudioClientValidate, ClientValidate, StudioEditorFile } from "./types";
