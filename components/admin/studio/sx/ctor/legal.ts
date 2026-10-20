import { ArrowRightLeftIcon, FileTextIcon, LanguagesIcon, ListChecksIcon, PencilLineIcon, ShieldCheckIcon, TrendingUpIcon, UploadIcon } from "lucide-react";
import type { StudioConstructor } from "@/lib/services/studio";
import type { SxCtorLayout, SxLayoutCtx, SxLayoutField, SxLayoutSection } from "../contract";
import { hasTopField, isK06Hidden, isNewDocument, isUploadMode, k06Transform, k06Validate, k07Keys, k07TitleFrom, k07Transform, k07Validate } from "../schema/legal/model";
import type { SxErrors } from "../types";
import { DOC_CATEGORIES } from "./generic";

export const K07_LAYOUT: SxCtorLayout = {
  code: "K07",
  fields: [
    { path: "title", label: "sx.field.K07__title", placeholder: "sx.ph.K07__title" },
    { path: "version", placeholder: "sx.ph.K07__version" },
    { path: "body", help: false },
  ],
  adapt: (ctor) => k07LayoutFor(ctor),
};

const K07_CACHE = new WeakMap<StudioConstructor, SxCtorLayout>();

const UZ_OWNS = ["title_i18n.uz_latn", "title_i18n.uz_cyrl", "body_i18n.uz_latn", "body_i18n.uz_cyrl"];
const RU_OWNS = ["title_i18n.ru", "body_i18n.ru"];

const reacceptOnly = (payload: Parameters<typeof k07Validate>[0]): SxErrors => {
  const e = k07Validate(payload);
  return e.requires_reaccept ? { requires_reaccept: e.requires_reaccept } : {};
};

function buildK07(ctor: StudioConstructor): SxCtorLayout {
  const hasScript = hasTopField(ctor, "source_script");
  const hasBump = hasTopField(ctor, "version_bump");
  if (!hasScript && !hasBump) return K07_LAYOUT;
  const keys = k07Keys(ctor);
  const transform = k07Transform(keys);
  const fields: SxLayoutField[] = [
    { path: "document_type", help: false },
    { path: "acceptance_required", label: "sx.field.K07__acceptance_required2", help: "sx.help.K07__acceptance_required2" },
    {
      path: "requires_reaccept",
      label: "sx.field.K07__requires_reaccept2",
      help: "sx.help.K07__requires_reaccept2",
      locked: (ctx: SxLayoutCtx) => (ctx.root.acceptance_required === true ? false : "sx.k07.reacceptLocked"),
    },
  ];
  if (hasBump) {
    fields.push(
      { path: "version", hidden: true },
      {
        path: "version_bump",
        control: "choices",
        columns: 2,
        label: "sx.field.K07__version_bump",
        help: (ctx: SxLayoutCtx) => (isNewDocument(ctx.root) ? "sx.help.K07__version_bump_new" : "sx.help.K07__version_bump_edit"),
        optionKey: (v) => `sx.opt.K07__version_bump.${v}`,
        choices: {
          minor: { icon: PencilLineIcon, descriptionKey: "sx.optd.K07__version_bump.minor", metaKey: "sx.optm.K07__version_bump.minor" },
          major: { icon: TrendingUpIcon, descriptionKey: "sx.optd.K07__version_bump.major", metaKey: "sx.optm.K07__version_bump.major" },
        },
      },
    );
  } else fields.push({ path: "version", placeholder: "sx.ph.K07__version" });
  if (!hasScript) fields.push({ path: "title", label: "sx.field.K07__title", placeholder: "sx.ph.K07__title" }, { path: "body", help: false });
  const sections: SxLayoutSection[] = [{ id: "K07__doc", titleKey: "sx.section.K07__doc", fields: hasScript ? ["document_type", "version_bump", "version"] : ["document_type", "title", "version_bump", "version"], icon: FileTextIcon }];
  if (hasScript) {
    fields.push(
      { path: "title", hidden: true },
      { path: "body", hidden: true },
      { path: "title_i18n", hidden: true, label: "sx.k07.part.title" },
      { path: "body_i18n", hidden: true, label: "sx.k07.part.body" },
      { path: "title_i18n.uz_latn", label: "sx.k07.script.uz_latn" },
      { path: "title_i18n.uz_cyrl", label: "sx.k07.script.uz_cyrl" },
      { path: "title_i18n.ru", label: "sx.k07.trail.ru" },
      { path: "body_i18n.uz_latn", label: "sx.k07.script.uz_latn" },
      { path: "body_i18n.uz_cyrl", label: "sx.k07.script.uz_cyrl" },
      { path: "body_i18n.ru", label: "sx.k07.trail.ru" },
      { path: "source_script", control: "legalUz", label: "sx.k07.uz.label", help: "sx.k07.uz.help", owns: UZ_OWNS, required: true },
      { path: "ru_text", control: "legalRu", owns: RU_OWNS, virtual: { type: "text", labelKey: "sx.k07.ru.label", helpKey: "sx.k07.ru.help" } },
    );
    sections.push(
      { id: "K07__uz", titleKey: "sx.section.K07__uz", fields: ["source_script"], icon: LanguagesIcon },
      { id: "K07__ru", titleKey: "sx.section.K07__ru", fields: ["ru_text"], icon: ArrowRightLeftIcon },
    );
  } else sections[0] = { ...sections[0], fields: [...sections[0].fields, "body"] };
  sections.push({ id: "K07__accept", titleKey: "sx.section.K07__accept", fields: ["acceptance_required", "requires_reaccept"], icon: ShieldCheckIcon });
  return {
    code: "K07",
    sections,
    fields,
    titleField: hasScript ? null : undefined,
    titleFrom: hasScript ? k07TitleFrom : undefined,
    transform: (next, prev) => transform(next, prev),
    validate: hasScript ? k07Validate : reacceptOnly,
  };
}

export function k07LayoutFor(ctor: StudioConstructor): SxCtorLayout {
  let hit = K07_CACHE.get(ctor);
  if (!hit) {
    hit = buildK07(ctor);
    K07_CACHE.set(ctor, hit);
  }
  return hit;
}

const uploadOnly = (ctx: SxLayoutCtx) => isUploadMode(ctx.root);
const editorOnly = (ctx: SxLayoutCtx) => !isUploadMode(ctx.root);

const K06_BASE_FIELDS: readonly SxLayoutField[] = [
  { path: "title", label: "sx.field.K06__title", placeholder: "sx.ph.K06__title" },
  { path: "service_id", label: "sx.field.K06__service_id", help: "sx.help.K06__service_id", required: true },
  { path: "slug", hidden: true },
  { path: "category", label: "sx.field.K06__category", control: "picker", options: DOC_CATEGORIES, optionKey: (v) => `sx.doccat.${v}` },
  {
    path: "language",
    label: "sx.field.K06__language",
    help: false,
    control: "choices",
    columns: 3,
    optionKey: (v) => `sx.opt.K06__language.${v}`,
    choices: {
      "uz-latn": { descriptionKey: "sx.optd.K06__language.uz-latn" },
      "uz-cyrl": { descriptionKey: "sx.optd.K06__language.uz-cyrl" },
      ru: { descriptionKey: "sx.optd.K06__language.ru" },
    },
  },
  { path: "description", help: false },
  {
    path: "mode",
    label: "sx.field.K06__mode",
    help: "sx.help.K06__mode",
    control: "choices",
    columns: 2,
    optionKey: (v) => `sx.opt.K06__mode.${v}`,
    choices: {
      editor: { icon: PencilLineIcon, descriptionKey: "sx.optd.K06__mode.editor" },
      upload: { icon: UploadIcon, descriptionKey: "sx.optd.K06__mode.upload" },
    },
  },
  { path: "template_text", label: "sx.field.K06__template_text", help: false, control: "docText", visible: editorOnly },
  { path: "clauses", visible: editorOnly },
  { path: "clauses.*.content", help: false, control: "docText" },
  { path: "file", control: "file", required: true, visible: uploadOnly, virtual: { type: "text", labelKey: "sx.field.K06__file", helpKey: "sx.help.K06__file" } },
  { path: "fields", help: "sx.help.K06__fields" },
  { path: "visibility", hidden: true },
  { path: "price", hidden: true },
];

const K06_CACHE = new WeakMap<StudioConstructor, SxCtorLayout>();

export const K06_LAYOUT: SxCtorLayout = {
  code: "K06",
  sections: [
    { id: "K06__basics", titleKey: "sx.section.K06__basics", fields: ["title", "service_id", "language", "category", "description"], icon: FileTextIcon },
    { id: "K06__content", titleKey: "sx.section.K06__content", fields: ["mode", "template_text", "clauses", "file", "source_file_required"], icon: PencilLineIcon },
    { id: "K06__fields", titleKey: "sx.section.K06__fields", fields: ["fields"], icon: ListChecksIcon },
  ],
  fields: K06_BASE_FIELDS,
  validate: k06Validate,
  adapt: (ctor) => {
    let hit = K06_CACHE.get(ctor);
    if (!hit) {
      const present = new Set(ctor.typed.map((f) => f.key));
      const strip = k06Transform(present);
      const extra = ctor.typed.filter((f) => isK06Hidden(f.key) && !K06_BASE_FIELDS.some((x) => x.path === f.key)).map((f): SxLayoutField => ({ path: f.key, hidden: true }));
      hit = { ...K06_LAYOUT, adapt: undefined, fields: [...K06_BASE_FIELDS, ...extra], transform: (next) => strip(next) };
      K06_CACHE.set(ctor, hit);
    }
    return hit;
  },
};
