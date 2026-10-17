"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { StudioConstructor } from "@/lib/services/studio";
import type { SchemaModel, SchemaOnly, SxCtorLayout } from "../contract";
import { useStudioLabels } from "../useStudioLabels";
import { buildSchemaModel } from "./model";

export function useSchemaModel(input: { ctor: StudioConstructor | null; layout: SxCtorLayout; runtimeTarget: string; idPrefix: string; only?: SchemaOnly }): SchemaModel | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const { ctor, layout, runtimeTarget, idPrefix, only } = input;
  return useMemo(() => (ctor ? buildSchemaModel({ ctor, layout, runtimeTarget, idPrefix, only, labels, t }) : null), [ctor, layout, runtimeTarget, idPrefix, only, labels, t]);
}
