"use client";

import { createContext, useContext } from "react";

// True inside the ROP workspace shell: the CRM pages then leave the page
// title and the section tabs to the shell instead of drawing their own.
export const RopCtx = createContext(false);
export const useInRop = (): boolean => useContext(RopCtx);
