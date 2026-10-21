"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import { useStudioRegistry } from "@/lib/services/studio";
import type { GroupCardKind } from "./GroupCard";
import { groupOfCode } from "./groupModel";
import { GroupTile } from "./GroupTile";

export type HomeIconName = "services" | "packages" | "ctors" | "queue" | "review" | "publish" | "returned" | "incomplete";

export const NEED_ART: Readonly<Record<GroupCardKind, HomeIconName>> = { returned: "returned", review: "review", publish: "publish" };

const CODE_ART: Readonly<Record<string, HomeIconName>> = { K02: "services", K03: "packages", "K03-M": "packages" };

export function HomeIcon({ name, size, className }: { name: HomeIconName; size: number; className?: string }): ReactElement {
  return <Image src={`/img/studio/icons/${name}.webp`} alt="" width={size} height={size} unoptimized className={className} draggable={false} />;
}

export function CtorArt({ code, size }: { code: string; size: number }): ReactElement {
  const reg = useStudioRegistry();
  const art = CODE_ART[code.toUpperCase()];
  if (art) return <HomeIcon name={art} size={size} />;
  return <GroupTile groupKey={groupOfCode(code, reg.groups, reg.items)} order={1} size="md" className="sx-hrow__tile" />;
}
