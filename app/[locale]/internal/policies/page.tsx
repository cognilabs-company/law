"use client";
import HrModulePage from "@/components/internal/hr/HrModulePage";
import { hrModule } from "@/components/internal/hr/modules";
export default function Page() { return <HrModulePage def={hrModule("policies")} />; }
