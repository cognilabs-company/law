"use client";

import MeetingLauncher from "@/components/chat/MeetingLauncher";

// Call-center / manager meetings: the shared launcher (also used by the seller
// portals) — start a titled video meeting with any platform users, re-join
// active ones, see the history.
export default function AdminMeetings() {
  return <MeetingLauncher />;
}
