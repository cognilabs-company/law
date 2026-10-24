"use client";

import { use } from "react";
import ExperienceReview from "@/components/admin/callcenter/ExperienceReview";

// Opened from the "experience submitted" notification by the record's id.
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="ppanel xpr">
      <ExperienceReview experienceId={decodeURIComponent(id)} />
    </div>
  );
}
