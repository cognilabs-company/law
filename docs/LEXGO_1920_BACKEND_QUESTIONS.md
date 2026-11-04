# LexGo 1920 redesign — backend questions (2026-11-04)

The client, advocate and lawyer cabinets were rebuilt on the "LexGo 1920"
design (`reference/design-lexgo-1920/`). Every block reads a real endpoint.
These are the places where the design asks for something the API does not
give yet; the frontend shows a truthful state for each and switches over as
soon as the field or endpoint exists.

## 1. Feedback ("Xato va takliflar") for client / advocate / lawyer

`/internal/product-feedback` (the `FeedbackIn` schema with `feedback_type`,
`module`, `page_url`, `attachments`) is staff-only. The cabinet page sends
requests as support tickets instead:

`POST /support/tickets` with
`source = feedback_bug | feedback_suggestion | feedback_other`,
`category = technical | general`, `subject`, `message`, and
`context = { feedback_type, module, page_url, role, notify_when_answered, screenshot? }`.

Questions:
- Can `/internal/product-feedback` (or a `/me/product-feedback`) accept these
  roles, so feedback lands in the product team's queue rather than support?
- Support tickets have no attachment upload. The optional screenshot is sent
  as `context.screenshot = { name, mime: "image/jpeg", data_url }` (downscaled
  to 1600 px). Please add a multipart upload for ticket attachments, or confirm
  operators see `context.screenshot`.
- Is `notify_when_answered` honoured, or should it map to a notification
  preference?
- Please number feedback tickets with an `FB-` work id (the list shows
  `work_id`).

## 2. Specialist photos

`GET /marketplace/lawyers` has no photo/avatar field. Cards show the
specialist's initials in the photo frame. Needed: `photo_url` (or
`avatar_url`) on the public seller profile.

## 3. Consultation format (online / in office)

The 1b card has a "Format" tile ("Onlayn, ofisda"). The public seller list
has no format field; the card shows "Onlayn" (every marketplace consultation
runs through the secure chat/video room) and "Onlayn, hozir faol" when
`online_now` is true. Needed: a public `formats` list (online / office) per
seller.

## 4. Legal-area taxonomy

The design's eight areas (Mehnat, Oila, Ko'chmas mulk, Avtoavariya, Biznes va
soliq, Meros, Jinoyat, Iste'molchi) have no backend list:
`/marketplace/meta.specializations` are free slugs and
`/marketplace/service-categories` is empty on production. The frontend
matches an area by the words in a seller's specializations, services and
categories (`lib/legalAreas.ts`). Needed: an area id on categories or
specializations, and `GET /marketplace/lawyers?area=` filtering.

## 5. Prices for "Huquqiy hujjatlar" and "Hujjat tahlili"

The dashboard's service cards take prices from `/urgent-advokat/catalog`
(Tezkor Advokat, online, problem analysis, road accident). Document
templates carry `price: 0` and document analysis is quoted per file, so
those two cards say "Hujjatga qarab" / "Faylga qarab". Needed: a "from"
price for each, if the business wants a number there.

## 6. Rating distribution

The seller dashboard's 5…1 bars are counted from the reviews on
`GET /marketplace/lawyers/{me}`. Please add a `rating_distribution` to
`GET /marketplace/me/rating` so the bars do not depend on how many reviews
that endpoint returns.
