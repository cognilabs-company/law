"use client";

import "../sx-tones.css";
import "./sx-home.css";
import Image from "next/image";
import type { ReactElement } from "react";
import { glyph, groupIcon } from "../icons";

export type GroupTileProps = { groupKey: string; order: number; size?: "md" | "lg" | "xl"; className?: string };

const ICON_SIZE = { md: 20, lg: 24, xl: 32 } as const;
const ART_SIZE = { md: 50, lg: 60, xl: 80 } as const;

const GROUP_ART: Readonly<Record<string, string>> = {
  services_packages: "/img/xizmatlar-paketlar.png",
  documents_texts: "/img/hujatlar-matnlar.png",
  process_quality: "/img/jarayon-sifat.png",
  communications: "/img/muloqot.png",
  finance_tariffs: "/img/moliya-tariflar.png",
  security_access: "/img/xavfsizlik-kirish.png",
  operations: "/img/operatsiyalar.png",
  integrations: "/img/integratsiyalar.png",
  system_reference: "/img/tizim-malumotlar.png",
};

export function GroupTile({ groupKey, size = "md", className }: GroupTileProps): ReactElement {
  const art = GROUP_ART[groupKey];
  const cls = ["sx-gtile", "sx-sq", art ? "sx-gtile--art" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} data-size={size} aria-hidden="true">
      {art ? <Image src={art} alt="" width={ART_SIZE[size]} height={ART_SIZE[size]} /> : glyph(groupIcon(groupKey), { size: ICON_SIZE[size] })}
    </span>
  );
}
