import { describe, expect, it } from "vitest";
import { sortRooms } from "@/components/chat/messenger/rooms";
import { normSecureRoom } from "@/lib/services/backend";

// TSK-637367: the conversation list is ordered by the newest message, then
// by the room's own activity, so a fresh message always lifts its room.
describe("chat list order", () => {
  const room = (id: string, extra: Record<string, unknown>) => normSecureRoom({ id, status: "active", participants: [], ...extra });

  it("puts the newest conversation first", () => {
    const rooms = [
      room("old", { last_message: { id: "m1", created_at: "2026-10-01T10:00:00Z" } }),
      room("new", { last_message: { id: "m2", created_at: "2026-10-30T10:00:00Z" } }),
      room("quiet", { updated_at: "2026-10-15T10:00:00Z" }),
    ];
    expect(sortRooms(rooms).map((r) => r.id)).toEqual(["new", "quiet", "old"]);
  });

  it("keeps a room with no date at the bottom", () => {
    const rooms = [room("blank", {}), room("dated", { last_message_at: "2026-10-30T10:00:00Z" })];
    expect(sortRooms(rooms).map((r) => r.id)).toEqual(["dated", "blank"]);
  });
});
