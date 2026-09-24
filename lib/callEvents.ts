// In-page bus for `call.*` events received on a secure-chat room socket, so
// the call room (roster, timer) and the chat's incoming-call card update on
// events instead of polling. Emitted by SecureChat's socket handler.
export type CallEvent = { event: string; room_id?: string; call_id?: string } & Record<string, unknown>;
type Handler = (e: CallEvent) => void;

const subs = new Map<string, Set<Handler>>();

export const CALL_EVENTS = new Set([
  "call.created",
  "call.participant_invited",
  "call.participant_joined",
  "call.participant_left",
  "call.participant_removed",
  "call.participant_updated",
  "call.updated",
  "call.ended",
  // 2026-09-19 backend: server-tracked recording consent (see
  // requestCallRecording/setCallRecordingPermission/startCallRecordingServer
  // in lib/services/backend.ts and CallRoom.tsx's recording effect).
  "call.recording_requested",
  "call.recording_permission_updated",
  "call.recording_started",
  // 2026-09-24 backend (LEXGO_MEETING_EXTENSION_FRONTEND_UPDATE.md): the
  // 15-minute document meeting and its extensions. A name missing from this
  // set is dropped by SecureChat's socket handler before it ever reaches the
  // room, so the call would silently keep counting down through a pause.
  "call.payment_extension_requested",
  "call.payment_extension_approved",
  "call.payment_extension_rejected",
  "call.extended",
]);

export function isCallEvent(name: unknown): name is string {
  return typeof name === "string" && CALL_EVENTS.has(name);
}

export function emitRoomCallEvent(roomId: string, e: CallEvent): void {
  const set = subs.get(roomId);
  if (!set) return;
  for (const h of set) {
    try { h(e); } catch { /* keep the others */ }
  }
}

export function subscribeRoomCallEvents(roomId: string, h: Handler): () => void {
  let set = subs.get(roomId);
  if (!set) { set = new Set(); subs.set(roomId, set); }
  set.add(h);
  return () => { set!.delete(h); if (!set!.size) subs.delete(roomId); };
}
