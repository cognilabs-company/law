"use client";

import { uploadSecureMessage } from "@/lib/services/backend";

export type UploadedFile = { id: string; name: string; url: string };

export const ORDER_FILE_MB = 20;
export const ORDER_FILES_MAX = 5;

export async function uploadOrderFile(roomId: string, file: File, caption: string): Promise<UploadedFile> {
  const m = await uploadSecureMessage(roomId, { file, messageType: "file", content: caption, fileName: file.name });
  return {
    id: m.id,
    name: m.file?.fileName || file.name,
    url: m.file?.downloadUrl || `/secure-chats/${roomId}/messages/${m.id}/file`,
  };
}
