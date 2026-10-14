"use client";

import { useRef, type HTMLAttributes } from "react";
import { useScrollEdges } from "@/lib/useScrollEdges";
import ScrollArrows from "@/components/ui/ScrollArrows";

export type ScrollCueProps = HTMLAttributes<HTMLDivElement> & {
  arrows?: boolean;
  hostClassName?: string;
};

export default function ScrollCue({ arrows = false, hostClassName, className, children, ...rest }: ScrollCueProps) {
  const ref = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(ref, { silent: !arrows });
  const strip = (
    <div {...rest} ref={ref} className={className ? `${className} scue-x` : "scue-x"}>
      {children}
    </div>
  );
  if (!arrows) return strip;
  return (
    <ScrollArrows target={ref} edges={edges} className={hostClassName ? `scue-host ${hostClassName}` : "scue-host"}>
      {strip}
    </ScrollArrows>
  );
}
