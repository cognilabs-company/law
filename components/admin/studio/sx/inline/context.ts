"use client";

import { createContext, useContext } from "react";

export const InlineDepth = createContext(0);

export function useInlineDepth(): number {
  return useContext(InlineDepth);
}
