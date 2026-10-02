# LexGO Legal AI Agent — Frontend Upgrade Guide

The client chat AI is replaced by a new legal agent (commit `55dfac8`). Answers are built **only** from articles read live from lex.uz, with article citations and verbatim quotes. Anything the agent cannot back with a lex.uz article is dropped, and it says "not found" instead of guessing.

**The API contract did not change.** Same endpoints, same request and response shapes. What changed is the *content* of the assistant message, the response time, and contracts no longer being generated from chat.

---

## 1. Endpoints (unchanged)

| Type | Endpoint |
|---|---|
| REST | `POST /clients/{client_id}/chats/{chat_id}/messages` |
| WebSocket | `WS /ws/clients/{client_id}/chats/{chat_id}` |
| REST | `GET /clients/{client_id}/chats/{chat_id}` (history) |

Request body / WS payload:

```json
{ "content": "Ishdan bo'shatishda qanday kompensatsiya to'lanadi?" }
```

`content`: 1–10000 characters.

REST response (`MessageResponse`):

```json
{
  "chat": { "id": "...", "client_id": "...", "title": "...", "created_at": "...", "updated_at": "...", "last_message": { } },
  "user_message": { "id": "...", "role": "user", "content": "...", "sources": [], "created_at": "..." },
  "assistant_message": { "id": "...", "role": "assistant", "content": "<markdown>", "sources": [ ], "created_at": "..." },
  "contracts": [],
  "limit_status": null
}
```

WebSocket events (unchanged):

- `{"event": "message.created", "message": <user MessageOut>}` — sent right away
- `{"event": "message.created", "message": <assistant MessageOut>, "contracts": [], "limit_status": ...}` — sent when the answer is ready
- `{"event": "error", "detail": "...", "status_code": 429}` — limit or validation errors

---

## 2. What the frontend must change

### 2.1 Response time is much longer

The agent makes several model calls (router → article selection → answer → verification) and fetches documents from lex.uz. A legal answer can take **tens of seconds, sometimes over a minute**. There is no streaming.

- Show a clear "thinking" state after the user message is echoed, e.g. *"lex.uz'dagi qonunlar tekshirilmoqda…"*. Rotating steps are a nice touch: *"Qonunlar qidirilmoqda" → "Moddalar tanlanmoqda" → "Javob tekshirilmoqda"* (time-based only; the backend does not send progress events).
- **Prefer the WebSocket** for sending messages.
- If REST is used, raise the client timeout to at least **240 s**. The backend timeout per model call is 180 s.
- Check the reverse proxy (nginx `proxy_read_timeout`, WS idle timeout) so it does not cut the request at 60 s.
- Disable the send button (or queue) while an answer is pending in that chat.
- Greetings and off-topic messages stay fast (one small model call).

### 2.2 `assistant_message.content` is Markdown — render it

A full legal answer looks like this:

```markdown
**Qisqa javob:** ... ([Mehnat kodeksi, 161-modda](https://lex.uz/uz/docs/-6257288#-6260123))

**Qonunchilikda belgilangan qoidalar:**

1. Rule in plain language — [Mehnat kodeksi, 161-modda](https://lex.uz/uz/docs/-6257288#-6260123)
   > «exact quote copied from the article»
2. ...

_Savolning ayrim qismlari bo'yicha lex.uz'da aniq modda topilmadi, shuning uchun ular bo'yicha javob berilmadi._

**Aniqroq javob uchun:**
- Clarifying question 1?
- Clarifying question 2?

_Manba: lex.uz (03.10.2026 holatiga). Ushbu javob lex.uz'dagi amaldagi matn asosida tayyorlandi ... advokat bilan maslahatlashing._
```

Rendering requirements:

- Markdown renderer with **bold**, *italic*, ordered and unordered lists, **blockquotes**, and **links**.
- Blockquotes are verbatim law quotes. Style them as quotes (left border, muted color).
- Links point to the exact article on lex.uz (`#anchor`). Open them in a new tab (`target="_blank" rel="noopener noreferrer"`).
- The last italic line is the source date plus disclaimer. It can be shown smaller or muted.
- Sanitize the HTML output (no raw HTML is expected).
- The "Aniqroq javob uchun" questions could be shown as quick-reply chips that send the question text as the next message. Parse them from the content: list items after that heading.

### 2.3 `sources` has a new meaning

`sources: [{ "title": string, "url": string, "snippet": string | null }]`

| Case | `sources` content |
|---|---|
| Answered / partial | Up to 10 **articles** used in the answer. `title` = `"Document, 161-modda. Article title"`, `url` = direct link to the article, `snippet` = the verbatim quote |
| Not found | Up to 6 **documents** that were checked. `snippet` is empty |
| Greeting, identity, off-topic, unclear, document request, errors | `[]` |

Suggested UI: a "Manbalar (lex.uz)" block under the answer with clickable cards. Show `snippet` as a quote when it is not empty. For not-found answers, label them *"Tekshirilgan hujjatlar"* (checked documents) instead of sources.

### 2.4 `contracts` is now always empty

The agent does not generate contract files from chat yet (DOCX/PDF generation is planned for phase 2). `contracts` is always `[]` while the agent is enabled.

- Keep the existing contract-card code; just make sure an empty array renders nothing.
- When the user asks for a document, the agent replies with a list of the details it needs and says the document is prepared through the **"Hujjat so'rovi"** flow with payment. A **"Hujjat so'rovi yaratish"** button under such answers would help (see section 4).

### 2.5 History is used as context

The backend sends the last 12 chat messages to the agent, so follow-ups like *"va agar shartnoma muddatli bo'lsa?"* work. Nothing to change. Just keep all messages in the same `chat_id`.

---

## 3. Answer types the user can get

There is no `status` field in the API (see section 4). These are the possible assistant messages:

| Type | When | Content |
|---|---|---|
| Answered | All parts found and verified | Full Markdown answer (section 2.2) |
| Partial | Some parts unsupported | Full answer plus the italic "ayrim qismlari… topilmadi" line |
| Not found | No article supports an answer | Fixed text: *"Bu savol bo'yicha lex.uz'dagi qonun hujjatlaridan aniq javob beradigan modda topilmadi…"* |
| lex.uz down | lex.uz not reachable | Fixed text: *"lex.uz sayti hozir javob bermayapti…"*. A "Qayta urinish" button that resends the last question fits here |
| Greeting / off-topic / unclear | Small talk, non-legal, too vague | Short reply in Uzbek Latin; unclear asks what exactly the user means |
| Identity | "Who are you?" | Fixed text: *"Men Cognilabs C01 modeliman…"* |
| Document request | User asks for a contract or application | List of required details plus a pointer to the "Hujjat so'rovi" flow |
| Technical error | AI service error | Text starting with *"AI servis bilan aloqa vaqtida xatolik bo'ldi"* or *"Javob tayyorlashda texnik xatolik bo'ldi"* |

All replies are in **Uzbek Latin**. The assistant presents itself as **Cognilabs C01**.

Limits (`limit_status`, 429 errors for guests and users) work the same as before.

---

## 4. Optional backend additions (not built — ask the backend if needed)

These would make the UI cleaner than parsing text. They are **not implemented yet**:

- `assistant_message.status`: `answered | partial | not_found | lex_unavailable | greeting | off_topic | unclear | identity | document_request | error`. The agent already computes this internally.
- `assistant_message.followup_questions: string[]`, so quick-reply chips don't need Markdown parsing.
- Progress events over WS (`agent.step`) for a real step indicator.
- Streaming the answer.

---

## 5. Frontend checklist

- [ ] Markdown rendering for assistant messages (bold, lists, blockquotes, links, italics) with sanitizing
- [ ] Links open in a new tab
- [ ] Blockquote styling for law quotes
- [ ] Sources block: article cards with quote snippets; "checked documents" wording for not-found answers
- [ ] Long "thinking" state; send disabled while pending
- [ ] REST timeout ≥ 240 s, proxy and WS timeouts checked; prefer WebSocket
- [ ] Empty `contracts` handled; "Hujjat so'rovi" CTA on document-request answers
- [ ] Retry button for the lex.uz-down message
- [ ] (Optional) follow-up question chips
