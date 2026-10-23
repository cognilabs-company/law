"use client";

import { Suspense } from "react";
import Messenger from "@/components/chat/messenger/Messenger";

// The open conversation is `?room=` on this page's URL (see Messenger).
export default function AdvocateMessages() {
  return (
    <Suspense>
      <Messenger />
    </Suspense>
  );
}
