import { describe, expect, it } from "vitest";
import { contactBlockOf } from "@/lib/contactWire";
import { ApiError, http } from "@/lib/http";

// No contact detail leaves the browser between a client and a lawyer.
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

describe("contact guard on the wire", () => {
  it("stops a chat message, a purchase note and a negotiation message with a contact", () => {
    expect(contactBlockOf("/secure-chats/r1/messages", post({ content: "Menga +998 90 123 45 67 ga yozing" }))?.kinds).toEqual(["phone"]);
    expect(contactBlockOf("/marketplace/lawyers/u1/services/s1/purchase-request", post({ note: "telegram: @akmal_lawyer", details: { note: "x" } }))).not.toBeNull();
    expect(contactBlockOf("/orders", post({ service_id: "s1", details: { problem: "yozing: test@mail.uz" } }))?.kinds).toContain("email");
    expect(contactBlockOf("/marketplace/negotiations/n1", { method: "PATCH", body: JSON.stringify({ message: "t.me/akmal" }) })).not.toBeNull();
  });

  it("lets ordinary text, ids and file titles through", () => {
    expect(contactBlockOf("/secure-chats/r1/messages", post({ content: "Oila kodeksining 39-moddasi, 2015–2023 yillar", reply_to_message_id: "998901234567" }))).toBeNull();
    expect(contactBlockOf("/marketplace/lawyers/u1/services/s1/purchase-request", post({ note: "Hujjatlar ilova qilindi", attachments: [{ file_id: "f1", title: "IMG_998901234567.jpg" }] }))).toBeNull();
  });

  it("leaves other endpoints and reads alone", () => {
    expect(contactBlockOf("/auth/register", post({ phone: "+998901234567" }))).toBeNull();
    expect(contactBlockOf("/secure-chats/r1/messages", { method: "GET" })).toBeNull();
  });

  it("checks a chat upload's caption", () => {
    const form = new FormData();
    form.append("message_type", "file");
    form.append("content", "raqamim 90 123 45 67");
    expect(contactBlockOf("/secure-chats/r1/messages/upload", { method: "POST", body: form })).not.toBeNull();
  });

  it("refuses in http() with the backend's own error code, sending nothing", async () => {
    const e = await http("/secure-chats/r1/messages", post({ content: "+998 90 123 45 67" })).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe("platform_contact_blocked");
  });
});

describe("links the chat allows", () => {
  it("lets a Zoom or LexGo call link through", () => {
    expect(contactBlockOf("/secure-chats/r1/messages", { method: "POST", body: JSON.stringify({ content: "Uchrashuv: https://us05web.zoom.us/j/123456789" }) })).toBeNull();
  });
});
