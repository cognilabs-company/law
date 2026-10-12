import { studioDefaults, studioDetailSnapshot, type StudioConstructor } from "@/lib/services/studio";
import { cleanPayload, schemaValidate } from "@/lib/studioSchema";
import SchemaEditor from "./SchemaForm";
import { genericEmptyPayload, genericValidate } from "./GenericEditor";
import type { StudioEditorEntry, StudioPayload } from "./types";

// The typed schema of a constructor once the editor has loaded it.
const typedOf = (code: string, ctor: StudioConstructor | null) => (ctor?.typed.length ? ctor : studioDetailSnapshot(code || ctor?.code || ""));

// Every constructor — all 61 — is drawn by one universal renderer from its
// typed schema (spec 10-12 §13); one without a typed schema falls back to the
// plain field list. Nothing about any one constructor is written here.
export const GENERIC_EDITOR: StudioEditorEntry = {
  Editor: SchemaEditor,
  validate: (payload, ctor) => {
    const typed = typedOf(ctor?.code ?? "", ctor);
    if (!typed?.typed.length) return genericValidate(payload, ctor);
    return schemaValidate(typed.typed, payload, typed.schema.required);
  },
  emptyPayload: (ctor) => {
    const typed = typedOf(ctor?.code ?? "", ctor);
    return typed?.typed.length ? studioDefaults(typed) : genericEmptyPayload(ctor);
  },
};

// What is sent: no undefined, no keys an object's schema does not admit.
export function cleanStudioPayload(code: string, payload: StudioPayload): StudioPayload {
  const typed = studioDetailSnapshot(code);
  return typed?.typed.length ? cleanPayload(typed.typed, payload) : payload;
}

export function editorFor(code: string): StudioEditorEntry {
  void code;
  return GENERIC_EDITOR;
}

export function validateStudioPayload(code: string, payload: StudioPayload, constructor: StudioConstructor | null, _file?: { hasFile: boolean } | null, objectTitle?: string) {
  void _file;
  const ctor = constructor ?? studioDetailSnapshot(code);
  const out = { ...genericValidate(payload, ctor), ...GENERIC_EDITOR.validate(payload, ctor) };
  const payloadTitle = typeof payload.title === "string" ? payload.title.trim() : payload.title;
  if (!payloadTitle && objectTitle && objectTitle.trim() && out.title) delete out.title;
  return out;
}

export type { StudioEditorEntry, StudioEditorProps, StudioPayload, StudioClientValidate, ClientValidate, StudioEditorFile } from "./types";
