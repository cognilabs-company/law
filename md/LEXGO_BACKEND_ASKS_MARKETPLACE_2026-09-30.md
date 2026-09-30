# LexGo — Marketplace: backendda qilinishi kerak bo'lgan ishlar (2026-09-30)

Project: LexGo
Date: 2026-09-30
Asos: `LEXGO_MARKETPLACE_FRONTEND_GUIDE.md` (2026-09-29)
Oldingi ro'yxatlar (yopilmagan bandlari ham kuchda):
- `LEXGO_BACKEND_ASKS_2026-09-29.md`
- `LEXGO_BACKEND_ASKS_2026-09-26.md`
- `LEXGO_BACKEND_MAJBURIY_ISHLAR_2026-09-18.md`
- `LEXGO_BACKEND_ISSUES_2026-09-15.md`

Frontend marketplace'ni ulashdan oldin qo'llanmani uch manba bilan solishtirdi:
- backend kodi: GitHub `main`, commit `cc34c86`, 2026-09-29 19:51;
- production: `https://lexgo.api.cognilabs.org`, 2026-09-30, faqat tokensiz GET so'rovlar;
- frontend kodi.

Quyidagilar faqat backendda yopiladigan masalalar. **Frontend marketplace ishini shu bandlar yopilgandan keyin boshlaydi.**

> **Muhim.** GitHub'dagi kod productiondan orqada. Masalan, `/marketplace/meta` va `/marketplace/me/orders` productionda ishlaydi, lekin GitHub kodida yo'q. Shuning uchun "(kod)" belgili bandlar productionda allaqachon tuzatilgan bo'lishi mumkin. Unday bo'lsa, "productionda bor" deb yozing va javobning namunaviy JSON'ini yuboring.

---

## Muhimlik bo'yicha tartib

| # | Masala | Ta'sir | Muhimlik |
|---|---|---|---|
| 1 | Productiondagi kod GitHub'da yo'q, `/openapi.json` 404 qaytaradi | Frontend javob shakllarini tekshira olmaydi | **Yuqori** |
| 2 | Telegram tasdig'idan keyin socketga xabar yetib bormaydi | Mijoz va sotuvchi "to'landi"ni sahifani yangilamaguncha ko'rmaydi | **Yuqori** |
| 3 | `marketplace.order_paid` eventi kodda yo'q, rad etish eventi ham yo'q | Qo'llanmadagi realtime oqim ishlamaydi | **Yuqori** |
| 4 | `/marketplace/me/orders` kontrakti noma'lum | Mijoz va sotuvchi buyurtmalar sahifasini yozib bo'lmaydi | **Yuqori** |
| 5 | Xarid (`purchase-request`) himoyasiz | Narxni mijoz yuboradi, dublikat bo'ladi, istalgan rol sotib oladi | **Yuqori** |
| 6 | Istalgan sotuvchi istalgan buyurtma statusini o'zgartira oladi | Xavfsizlik teshigi | **Yuqori** |
| 7 | Sotuvchi to'lanmagan buyurtmani ko'radi va qabul qiladi | Qo'llanma §14 ga zid | **Yuqori** |
| 8 | Telefonlar va ichki ma'lumotlar to'lovdan oldin ochiq | GM T1-10 §12 bajarilmaydi | **Yuqori** |
| 9 | Test akkauntlar va test xarid tartibi yo'q | Oqimni oxirigacha tekshirib bo'lmaydi | **Yuqori** |
| 10 | Bitta xaridda 4 xil ID bor | Mijoz bitta ish uchun turli raqamlar ko'radi | O'rta |
| 11 | "Yakunlash" oqimi aniq emas | GM T1A-01 §5 ga zid | O'rta |
| 12 | Mijoz kutilayotgan xaridini bekor qila olmaydi | 409 qaytadi | O'rta |
| 13 | Mijoz qo'ng'iroq boshlaganda 403 oladi | Qo'llanmadagi `client_actions.create_call` ishlamaydi | O'rta |
| 14 | Har bir buyurtma uchun alohida chat ochilmaydi | Bir nechta buyurtma bitta chatga tushadi | O'rta |
| 15 | Ma'lumotlar iflos, test yozuvlar ko'p | Filterlar noto'g'ri ishlaydi, ro'yxat test bilan to'la | O'rta |
| 16 | Ro'yxatda tasdiqlanmagan, nofaol va navbatchi akkauntlar chiqadi | Qo'llanma §1 da "tasdiqlangan" deyilgan | O'rta |
| 17 | Sharhlar doim bo'sh, baho berish himoyasiz | GM T1-16 bajarilmaydi | O'rta |
| 18 | Ro'yxat semantikasi (`price_asc`, `q`, `online_now`, `completed_orders`) | Saralash va statistika noto'g'ri | O'rta |
| 19 | Bildirishnomalar | Badge +4 oshadi, havola qurib bo'lmaydi | O'rta |
| 20 | Promotion (muddat, dublikat, kutish holati) | Paket noto'g'ri muddatga yoqiladi | O'rta |
| 21 | `/clients/me/works` dagi marketplace buyurtma | Boshqa ID chiqadi, chat tugmasi yo'q | Past |
| 22 | `mark-paid` marketplace to'lovida | Holat nomuvofiq qoladi | Past |
| 23 | GM qo'shimcha talablari | PM qarori kerak | Past |
| 24 | Yurist advokat xizmatini tanlay oladi, tasdiqlanmagan sotuvchi ham xizmat qo'sha oladi | GM T2-11 §1-2 | O'rta |

Oxirida marketplace'dan tashqari bitta xavfsizlik eslatmasi ham bor.

---

## 1. Productiondagi kod GitHub'da yo'q

### Nima topildi

- GitHub `main` = `cc34c86`. Unda quyidagilarning birortasi yo'q (grep: 0 ta natija):
  - `/marketplace/meta`, `include_meta`, `district`;
  - `/marketplace/me/orders`, `role_view`;
  - `marketplace.order_paid`;
  - xarid javobidagi `work_id`, `next_status`;
  - kartadagi `price_from`, `price_to`, `service_titles`.
- Productionda esa:
  - `GET /marketplace/meta` → 200;
  - `GET /marketplace/me/orders` → 401 (demak, route bor);
  - `/openapi.json` va `/docs` → 404.

### Kerak

- Productionda ishlayotgan kodni GitHub'ga push qiling yoki `/openapi.json`ni oching.

---

## 2. Telegram tasdig'idan keyin socketga xabar yetib bormaydi (kod)

### Nima topildi

- `main.py:1124-1125`: Telegram webhook `async def` bilan yozilgan.
- `main.py:1174`: `complete_marketplace_purchase_request(...)` to'g'ridan-to'g'ri chaqiriladi, threadpool'siz.
- `marketplace_routes.py:4644-4650`: `broadcast_realtime_event` ichida `anyio.from_thread.run(...)` bor va u `except RuntimeError: pass` bilan o'ralgan.
  - Event loop thread'ida `from_thread.run` har doim RuntimeError beradi.
  - Natijada xabar hech qanday xatosiz tashlab yuboriladi.
- Shu sababli quyidagi jarayonlarda `notification.created`, `notifications.unread_count` va `document_request.*` socketga yetib bormaydi:
  - marketplace tasdiqlash va rad etish (`:960`, `:982-983`);
  - promotion tasdiqlash va rad etish (`:910`, `:927`);
  - hujjat tekshiruvi, docreview (`:1177`, `:1199`).
- 29-sentabr ro'yxatining §18 bandidagi "`document_request.sent` kelmayapti" muammosining sababi ham shu bo'lishi mumkin.
- Webhook ichidagi sinxron ishlar event loop'ni to'xtatib turadi. Bular DB so'rovlari, Telegram HTTP chaqiruvlari va har biri 10 soniyali timeout'ga ega `urllib` chaqiruvlari. Server bitta uvicorn process'da ishlaydi, shuning uchun tasdiqlash paytida boshqa barcha so'rovlar va socketlar kutib qoladi.
- `answerCallbackQuery` va `editMessageText` chaqiruvlari try/except bilan o'ralmagan. Telegram xato qaytarsa, DB commit bo'lib bo'lgan bo'lsa ham webhook 500 qaytaradi.
- Tugmani kim bosgani saqlanmaydi, faqat `chat_id` yoziladi. Tasdiqlovchi chat guruh bo'lsa, guruhning istalgan a'zosi tasdiqlashi mumkin.
- Kodda ishlaydigan namuna bor: `broadcast_from_webhook` (`main.py:585-590`), u `callext` uchun ishlatiladi.

### Kerak

- Webhook'ni `def` qiling, yoki handlerlarni `run_in_threadpool` orqali chaqiring, yoki xabarlarni `broadcast_from_webhook` orqali yuboring.
- Telegram chaqiruvlarini try/except bilan o'rang.
- Tugmani kim bosganini yozing (Telegram `from.id`).

**Qabul mezoni:** Telegramda "Tasdiqlash" bosilgandan keyin 1-2 soniya ichida mijozning ochiq `/ws/users/me` socketiga xabar keladi.

---

## 3. `marketplace.order_paid` va rad etish eventi

### Nima topildi

- Qo'llanmaning §2.7 va §6 bo'limlari `{"event": "marketplace.order_paid", ...}` eventini va'da qiladi, lekin kodda bunday event yo'q.
- Tasdiqlashda faqat bildirishnomalar yaratiladi (`:982-983`):
  - mijozga `marketplace_purchase_approved`;
  - sotuvchiga `marketplace_order_paid`.
- Rad etishda faqat mijozga `marketplace_purchase_rejected` bildirishnomasi ketadi (`:960`), realtime event yo'q. Sotuvchiga hech narsa bormaydi.

### Kerak

- **Tasdiqlashda:** mijoz va sotuvchining `user:{user_id}` kanaliga qo'llanmadagi flat shaklda `marketplace.order_paid` yuboring. Maydonlar: `work_id`, `order_id`, `payment_id`, `room_id`, `chat_url`, `lawyer_user_id`, `client_user_id`, `service_title`.
- **Rad etishda:** mijozga `marketplace.order_rejected` yuboring. Maydonlar: `order_id`, `work_id`, `service_title`.
- `user:{user_id}` kanali `/ws/users/me?token=...` socketining o'zi ekanini tasdiqlang.

---

## 4. `/marketplace/me/orders` kontrakti

### Nima topildi

- Route productionda bor (tokensiz so'rovga 401 qaytaradi), lekin kodi GitHub'da yo'q. Shuning uchun javob shaklini tekshirib bo'lmadi.
- Tokensiz so'rovda `limit=abc` va `status=bogus` ham 401 qaytaradi, 422 emas. Demak, pagination va status parametrlari yo'q ko'rinadi.

### Kerak

- **Ikkita real namuna JSON:** biri mijoz tokeni bilan, biri sotuvchi tokeni bilan.
- **Quyidagi savollarga javob:**
  - `role_view` qanday qiymatlarni oladi?
  - Foydalanuvchi ham mijoz, ham sotuvchi bo'lsa, `auto` qaysi ko'rinishni tanlaydi?
  - Qaysi rollar sotuvchi hisoblanadi?
  - Mijoz `pending_payment` va `cancelled` buyurtmalarni ko'radimi?
  - Sotuvchi `pending_payment` buyurtmalarni ko'radimi? Qo'llanma bu yerda o'ziga zid: §8.4 da pending tab bor, §14 da esa sotuvchi to'lanmagan buyurtmani ko'rmaydi deyilgan.
- **Qo'shish kerak:**
  - `status`, `limit`, `offset` parametrlari va tartiblash;
  - har bir qatorda: purchase request'ning `work_id`i va statusi, `preferred_channel`, `preferred_time`, `client_note`, `payment_status`, `contact_unlocked`.
- `can_create_call` mijozning haqiqiy ruxsatiga mos bo'lsin (13-band).

---

## 5. Xarid (`purchase-request`) himoyasiz (kod)

### Nima topildi

`marketplace_routes.py:5553-5582`:
- `:5555` — rol tekshirilmaydi. Istalgan login qilgan foydalanuvchi xarid qila oladi, shu jumladan sotuvchi o'z xizmatini ham.
- `:5565` — `amount = int(data.get("amount") or ...)`. Narxni mijoz yuboradi:
  - manfiy son qabul qilinadi;
  - `true` yuborilsa narx 1 bo'ladi;
  - `"abc"` yuborilsa 500 qaytadi.
- Dublikatdan himoya yo'q. Har bir POST yangi order, payment va Telegram xabarini yaratadi.
- Sotuvchining `is_verified`, `verification_status` va `account_status` tekshirilmaydi. Productionda 4 ta tasdiqlanmagan sotuvchida sotib olsa bo'ladigan xizmat bor.
- `preferred_channel` va `preferred_time` saqlanmaydi.

### Kerak

- `amount` e'tiborga olinmasin. Narx faqat `selected_price` yoki `base_price` dan olinsin.
- Faqat `client` roli xarid qila olsin. O'zidan sotib olishga urinish 403 qaytarsin.
- Sotuvchi tasdiqlanmagan yoki `active` bo'lmasa, aniq `code` bilan xato qaytsin.
- **Dublikat:** shu mijoz + sotuvchi + xizmat bo'yicha `pending` so'rov bor bo'lsa, 409 qaytsin:
  - `code: "marketplace_purchase_already_pending"`;
  - mavjud so'rovning `work_id` va `order_id`si.

  `document_lawyer_request_already_open` qanday ishlasa, xuddi shunday.
- Ikki xil 404 xatoga alohida `code` bering, masalan `seller_or_service_not_found` va `seller_does_not_offer_service`. Hozir ular faqat matni bilan farqlanadi.
- `preferred_channel` (`chat | audio | video | meeting`) va `preferred_time` saqlansin va `me/orders` da qaytsin.

---

## 6. Istalgan sotuvchi istalgan buyurtma statusini o'zgartira oladi (kod)

### Nima topildi

- `PATCH /orders/{id}/status` (`:7360-7385`): foydalanuvchida `orders.manage` ruxsati bo'lsa, egalik ham, o'tishlar jadvali ham tekshirilmaydi.
- `orders.manage` barcha sotuvchi rollarida bor (`auth_service.py:163-165`). Natijada istalgan sotuvchi istalgan buyurtmani, hatto to'lanmaganini ham, `completed` qila oladi. Bunda `payment_status` tekshirilmaydi.
- Qo'llanmadagi "Yakunlash" tugmasi (`complete_url`) aynan shu override orqali ishlaydi, chunki `paid → completed` o'tishi jadvalda yo'q.

### Kerak

- Sotuvchilar uchun override olib tashlansin. Sotuvchi faqat o'z buyurtmasini (`lawyer_user_id == user.id`) va faqat ruxsat etilgan o'tish bo'yicha o'zgartira olsin.
- Override faqat admin va xodimlarda qolsin.
- Marketplace buyurtmasini yakunlash oqimi 11-bandda.

---

## 7. Sotuvchi to'lanmagan buyurtmani ko'radi va qabul qiladi (kod)

### Nima topildi

- `GET /orders` (`:7306`) va kabinetdagi `new_orders` (`:10005`) sotuvchiga biriktirilgan buyurtmalarni statusidan qat'i nazar qaytaradi.
- Xarid qilinganda buyurtma darhol sotuvchiga biriktiriladi va `pending_payment` statusi bilan yaratiladi (`:5566`). Shuning uchun u "Ishlar bozori"da "Qabul qilish" tugmasi bilan chiqadi.
- `accept_order` (`:7313-7323`) statusni tekshirmaydi. `pending_payment`, `cancelled` va hatto `completed` buyurtmani ham `accepted` qiladi va LegalCase ochadi.

### Kerak

- `pending_payment` holatidagi marketplace buyurtmalar sotuvchining `GET /orders` va `new_orders` ro'yxatlariga kirmasin (qo'llanma §14).
- `accept_order` faqat qabul qilinadigan statuslarda ishlasin, qolganlarida 409 qaytarsin.

---

## 8. Telefonlar va ichki ma'lumotlar to'lovdan oldin ochiq

### Nima topildi

- `GET /marketplace/lawyers` va `/marketplace/lawyers/{id}` har bir sotuvchining `phone`ini (77/77) tokensiz, hammaga qaytaradi. 31 tasi soxta test qiymat.
- Eski ochiq `GET /lawyers` ham shunday qiladi. Muammo `lawyer_to_out` / `LawyerProfileOut` ichida (`marketplace_service.py:166`, `marketplace_schemas.py:63`).
- Xarid javobida `purchase_request.payload.lawyer_phone` bor, ya'ni mijoz sotuvchining telefonini to'lovdan oldin oladi.
- Xarid javobida `purchase_request.payload.telegram_results` ham bor (`:5577-5582`), ya'ni ichki Telegram tasdiqlovchilarning `chat_id`lari mijozga ketadi. Promotion checkout javobida ham shunday (`payment_gate.telegram_results`, `:10390`).
- GM T1-10 §12 bo'yicha "To'lovgacha telefon ko'rinsa" — talab bajarilmagan hisoblanadi.

### Kerak

- `phone` ochiq ro'yxat va detail javobidan (shu jumladan `GET /lawyers` dan) olib tashlansin.
- Xarid javobidan `lawyer_phone`, `client_phone` va `telegram_results` olib tashlansin. Promotion javobidan ham `telegram_results` olib tashlansin.
- `me/orders` da telefonlar faqat `payment_status == "paid"` bo'lganda qaytsin: mijozniki sotuvchiga, sotuvchiniki mijozga.
- Oldin so'ralgan ISSUES 0E #59 (chatda kontaktlarni to'lovgacha yashirish) ham kuchda.

---

## 9. Test akkauntlar va test xarid tartibi

### Nima topildi

- Har bir xarid productionda haqiqiy order, payment va Telegram xabarini yaratadi. Qo'llanma §12 dagi test ham productionda yozuv qoldirgan, GM T0-07 §12 esa buni taqiqlaydi.
- Sotuvchi akkauntlari Telegram 2FA so'raydi, shuning uchun frontend sotuvchi ko'rinishini tekshira olmaydi.

### Kerak

- Test akkauntlar:
  - test mijoz;
  - test sotuvchi (2FA'siz yoki test kodi bilan);
  - shu sotuvchining bitta test xizmati.
- Test xaridni Telegramda kim tasdiqlashi yoki rad etishini kelishib olaylik. Testdan keyin yozuvlar tozalansin. Yoki alohida staging server bering.
- Oldin so'ralganlar:
  - ISSUES 0E #60 / MAJ #60 — test akkauntlar to'plami;
  - ASKS 09-26 #4 — 2FA'siz advokat akkaunti;
  - ASKS 09-29 §21.5 — test mijoz login'i 429 bilan bloklanadi.

---

## 10. Bitta xaridda 4 xil ID

### Nima topildi

- Bitta xarid to'rt xil ID bilan chiqadi:
  - `ADV-...` — purchase request va WS event;
  - `ORD-...` — `me/orders`;
  - `PAY-...` — to'lov;
  - `LGO-YYYYMMDD-XXXXXXXX` — `/clients/me/works` (`:2134`, `:2158`).
- Sotuvchi ID'lari ham aralash. `public_id` 19 xil prefiks bilan keladi (`LG-`, `LP-`, `LGP-`, `LGP-DEMO-`...), `me/orders` da esa `lexgo_id` (`LGC-`, `LGA-`) ishlatiladi.

### Kerak

- Mijozga ko'rsatiladigan bitta ID tanlansin. Taklif: order'ning `work_id`i (`ORD-...`).
- Bu ID xarid javobi, WS event, `me/orders` va `/clients/me/works` da bir xil qaytsin.
- Odamlar (sotuvchi, mijoz) uchun ham ko'rsatiladigan bitta ID bo'lsin.

---

## 11. "Yakunlash" oqimi

### Nima topildi

- Qo'llanma sotuvchiga `complete_url` beradi.
- GM T1A-01 §5 esa boshqacha: advokat ishni "bajarildi" deb belgilaydi, mijoz tasdiqlaydi, mijoz javob bermasa 3 ish kunidan keyin avtomatik tasdiqlanadi.
- Hozir `paid → completed` o'tishi jadvalda yo'q. Mijoz buni qilmoqchi bo'lsa, 409 oladi.

### Kerak

- PM bilan marketplace buyurtmasining o'tishlarini belgilang. Masalan: `paid → in_progress → delivered → completed` (oxirgi qadam mijoz tasdig'i bilan).
- `me/orders` da har bir rol uchun qaysi holatda qaysi tugma (`complete_url` yoki `confirm_url`) chiqishini aniqlang.

---

## 12. Mijoz kutilayotgan xaridini bekor qila olmaydi (kod)

### Nima topildi

- `pending_payment` statusi `ORDER_STATUSES` va `ORDER_TRANSITIONS` ichida yo'q (`:155-176`). Productiondagi `/platform/policies` → `order.status_transitions` da ham yo'q.
- Shuning uchun mijoz PATCH qilsa, 409 oladi.
- Mijoz xaridni bekor qiladigan boshqa endpoint ham yo'q. So'rov faqat Telegram tugmalari orqali `pending` holatdan chiqadi.

### Kerak

- Mijoz o'zining `pending` xaridini bekor qila oladigan endpoint qo'shilsin, masalan `POST /marketplace/orders/{order_id}/cancel`. U quyidagilarni qilsin:
  - request, order va payment'ni `cancelled` qilsin;
  - Telegram xabarini yangilasin.

---

## 13. Mijoz qo'ng'iroq boshlaganda 403 oladi (kod)

### Nima topildi

- `POST /secure-chats/{room_id}/calls` (`:9332`) va `/zoom` (`:9643-9646`) `meetings.manage` ruxsatini talab qiladi.
- `client` rolida bu ruxsat yo'q (`auth_service.py:168`), shuning uchun mijoz 403 oladi. Qo'llanma esa `client_actions.create_call` deydi.
- Qo'ng'iroq boshqa tomonga borishi uchun `participant_user_ids` berilishi kerak, lekin hujjatda bu yozilmagan.

### Kerak

- Mijoz qo'ng'iroq boshlay oladimi, yo'qmi — qaror qiling. Agar ha bo'lsa:
  - ruxsat faqat shu xonaning ishtirokchisiga berilsin (global `meetings.manage` emas);
  - `can_create_call` shunga mos bo'lsin.
- `preferred_channel = meeting` bo'lganda qaysi endpoint ishlatiladi: `/calls` (video) yoki `/zoom`?

---

## 14. Har bir buyurtma uchun alohida chat ochilmaydi (kod)

### Nima topildi

- Tasdiqlashda shu mijoz va sotuvchi o'rtasidagi istalgan aktiv xona qayta ishlatiladi (`:970-977`). Xonaning `order_id`si yangilanmaydi.
- Oldin so'ralgan: ASKS 09-29 §21.3 (bitta xonada ko'p yozuv).

### Kerak

- Bu ataylab qilinganmi?
  - Agar ha: bir nechta buyurtmada `chat_url` bir xil bo'lishini hujjatda yozing.
  - Agar yo'q: har bir buyurtma uchun alohida xona ochilsin.

---

## 15. Ma'lumotlar iflos, test yozuvlar ko'p

### Nima topildi (production, 2026-09-30)

- **Test yozuvlar:**
  - 77 sotuvchidan 54 tasida test yoki demo belgisi bor: test nomi, soxta telefon yoki `demo` tumani. Masalan: `T1BTEST-…`, `Demo Advokat 1-10`, `Approval Test`, `Workspace …`, ikkita `Civil Yurist`.
  - Standart tartibda (`recommended`) birinchi 20 ta sotuvchidan 19 tasi shu test yozuvlar.
  - "Deleted promotion test lawyer" nofaol, lekin aktiv reklama bilan 2-o'rinda turibdi.
- **Xizmatlar:**
  - 56 sotuvchida faol xizmat yo'q, ularda `price_from = 0`.
  - 2 so'mlik xizmat bor: "Biznes uchun abonent yuridik xizmat (autsorsing)" (Z03).
- **`region`:** `Toshkent` (19) va `tashkent` (19) alohida saqlangan, 26 sotuvchida bo'sh. Filter katta-kichik harfni farqlaydi: `toshkent` → 0.
- **`district`:** faqat `Chilonzor`, `Yunusobod` va `demo` qiymatlari bor. `demo` 15 sotuvchida. Tumanlar regionga bog'lanmagan.
- **`specializations`:** 48 xil qiymat, 4 xil lug'at aralashgan (`Fuqarolik huquqi`, `fuqarolik`, `civil`, `family-divorce`). Bundan tashqari `fixture-*` qiymatlar ham bor. Qo'llanmadagi `jinoyat` yo'q, uning o'rnida `criminal`.
- **`languages`:** `uz`, `uz-latn`, `uz-cyrl`, `ru`, `en`. `uz` filteri `uz-latn` sotuvchilarni topmaydi.
- **`meta.services`:** 142 qator, lekin faqat 17 ta noyob `id`. Aslida bu har bir sotuvchining xizmatlari qo'shib chiqarilgan ro'yxat.
- **`categories`:** kirillcha va harf prefiksli (`B. Оила ва никоҳ муносабатлари`). `fixture-family` va `fixture-business` ham bor.
- **`executor_type`:** `yurist_advokat`, `Юрист`, `Адвокат`, `Юрист/Адвокат`.
- **Demo seed:** `POST /admin/showcase-data/seed` (`:11968-11971`) `DEMO_MODE` tekshiruvisiz productionda ishlaydi. U 15 ta `LGP-DEMO` sotuvchini, `fixture-*` kategoriya va xizmatlarni qayta yaratadi (`ensure_demo_profile`, `:3788-3812`: `district = "demo"`, `reviews_count = 8 + index`). Shuning uchun yozuvlarni o'chirish yetarli emas.

### Kerak

- Region va tuman uchun yagona kalitlar (`tashkent`, `yunusobod`) va uz/ru/en label kerak. Meta'da tumanlar regionga bog'lab berilsin (`districts_by_region`).
- Ixtisosliklar bitta taksonomiyaga keltirilsin (kalit va uz/ru/en label), eski qiymatlar yangisiga ko'chirilsin.
- `uz`, `uz-latn`, `uz-cyrl` bitta til sifatida qidirilsin.
- `meta.services` da takror bo'lmasin. Kategoriya va xizmat nomlari uz/ru/en tillarida bo'lsin.
- `executor_type` uchun bitta lug'at bo'lsin.
- Filterlar katta-kichik harfni farqlamasin.
- Productiondan test va demo sotuvchilar, `demo` tumani, `fixture-*` qiymatlar, test xizmatlar va test reklamalar olib tashlansin.
- `showcase-data/seed` faqat demo rejimda ishlasin (`require_demo_mode()`).
- Oldin so'ralgan: MAJ A5 (productiondagi test yozuvlarni o'chirish).

---

## 16. Ro'yxatda tasdiqlanmagan, nofaol va navbatchi akkauntlar chiqadi

### Nima topildi

- Ro'yxat barcha `LawyerProfile`larni hech qanday filtrsiz oladi. Rol, `account_status` va navbatchi/call center belgisi tekshirilmaydi.
- 77 sotuvchidan 14 tasi `is_verified=false`, 5 tasi nofaol. Ular ro'yxatda chiqadi va ulardan xizmat sotib olish mumkin.
- LexGo'ning xizmat akkauntlari oddiy sotuvchi bo'lib chiqadi: `LexGo Call Center Lawyer`, `Call Center Advokat 767323`, `LexGo Advokat`, `LexGo Yurist`. Hammasida 0 ta xizmat bor.
  - 29-sentabr hujjatining §12 bandida startup'da ular "LexGo Navbatchi advokat" nomiga o'tkazilishi aytilgan, lekin productionda o'zgarmagan.
  - Kodda `sync_visible_service_account_names` faqat `flush` qiladi, commit qilinmaydi.
- `order.catalog.unverified_sellers` kaliti productiondagi `/platform/policies` da umuman yo'q.
- Qo'llanma §1: marketplace'da "tasdiqlangan advokat/yuristlar" bo'lishi kerak.

### Kerak

- Standart holatda faqat tasdiqlangan va `active` sotuvchilar chiqsin. Yoki sozlamaga amal qilinsin:
  - `hidden` — tasdiqlanmaganlar yashiriladi;
  - `badge` — ko'rsatiladi, lekin xarid yopiq.
- Navbatchi va boshqa LexGo xizmat akkauntlari marketplace'da chiqmasin (GM T1-12).
- Nomni o'zgartirish commit bilan saqlansin.
- Oldin so'ralganlar:
  - ISSUES tail #70 — tasdiqlanmaganlar siyosati;
  - ASKS 09-29 #2 — "Call center" nomi.

---

## 17. Sharhlar doim bo'sh, baho berish himoyasiz (kod)

### Nima topildi

- `GET /marketplace/lawyers/{id}` da `reviews` bo'sh. `reviews_count > 0` bo'lgan 26 sotuvchining hech birida sharh chiqmaydi. Aksincha, `reviews_count` 0 bo'lgan 2 sotuvchida sharh chiqadi, ulardan birida 5 ta tasdiqlanmagan sharh.
- Sababi: kod (`:5539`) butun platformadagi eng oxirgi 20 ta sharhni oladi va shundan keyin sotuvchi bo'yicha filtrlaydi.
- `pending` (moderatsiyadan o'tmagan) sharhlar ham ochiq ko'rinadi.
- Sharh obyektida ichki maydonlar ochiq: `owner_user_id`, `moderation_note`, `moderated_by_user_id`.
- `rating` va `reviews_count` sharhlardan hisoblanmaydi, ularni faqat demo seed yozadi.
- `POST /reviews` (`:12343-12347`):
  - istalgan login qilgan foydalanuvchi buyurtmasiz sharh yoza oladi;
  - istalgan `lawyer_user_id` ga yozish mumkin;
  - sharhlar soni cheklanmagan.

  GM T1-16 §1 bo'yicha esa faqat to'langan va yakunlangan buyurtmaga baho beriladi.
- Marketplace buyurtmasi uchun baho berish oqimi yo'q. Telegram tasdig'i LegalCase yaratmaydi, sharhda `order_id` saqlanmaydi.

### Kerak

- **Sotuvchining sharhlari:** faqat tasdiqlangan (`approved`) sharhlar, oxirgi 10 tasi. Har bir sharhda:
  - `rating`, `comment`, `created_at`;
  - niqoblangan ism (masalan "Aziz K.");
  - `verified_order: true`;
  - sotuvchining javobi.

  Ichki maydonlar javobga kirmasin.
- **Yulduzlar taqsimoti:** `rating_distribution` (GM T1-16 §8).
- `reviews_count` va `rating` haqiqiy sharhlardan hisoblansin.
- **`POST /reviews` shartlari:**
  - faqat shu buyurtmaning mijozi yoza oladi;
  - buyurtma to'langan va yakunlangan bo'lishi kerak;
  - bitta buyurtmaga bitta sharh;
  - `order_id` saqlansin.
- Marketplace buyurtmasiga baho berish endpointi va muddati belgilansin.

---

## 18. Ro'yxat semantikasi

### Nima topildi

- **Saralash va narx:**
  - `sort=price_asc` da xizmati yo'q 56 sotuvchi (narxi 0) ro'yxat boshida chiqadi;
  - `price_from = 0` aslida "xizmat yo'q" degani, lekin "bepul" bo'lib ko'rinadi.
- **`min_rating`:** faqat butun son qabul qilinadi, `4.5` yuborilsa 422 qaytadi.
- **`q` (qidiruv):**
  - tuman, xizmat nomi va kategoriya bo'yicha qidirmaydi;
  - lotin va kirill yozuvini bir-biriga moslamaydi: `Адлия` qidirilsa 0 natija.
- **Onlayn holat:** `online_now` va `availability.status` haqiqiy onlayn holatni emas, faqat `account_status == "active"`ni ko'rsatadi.
- **Ta'til:** ta'til holati uchun maydon yo'q. `GET/PUT /lawyers/me/availability` jadvali kartada ham, xaridda ham ishlatilmaydi.
- **`response_rate`:** hech qayerda yozilmaydi, shuning uchun doim 0. Sotuvchi kabinetida esa 0.94 qiymati kodga qattiq yozilgan.
- **`completed_orders`:** `paid` va `done` statuslarini ham sanaydi (`:5474`). Natijada to'langan, lekin hali tugamagan buyurtma darhol "bajarilgan" bo'lib ketadi.
- **Kartadagi `purchase_url`:** ichida `{service_id}` so'zi o'zgarmasdan qolgan.

### Kerak

- `price_asc` da narxsiz sotuvchilar oxirida chiqsin. Narx bo'lmasa `price_from: null` qaytsin.
- `min_rating` kasr sonni ham qabul qilsin.
- `q` tuman, xizmat nomi va kategoriya bo'yicha ham qidirsin, lotin va kirillni ham tushunsin.
- `online_now` haqiqiy onlayn holatni ko'rsatsin yoki boshqa nom bilan atalsin.
- `response_rate` haqiqiy ma'lumotdan hisoblansin.
- `availability.status` ning barcha qiymatlari aniqlansin, shu jumladan ta'til. Ta'tildagi sotuvchidan xarid qilib bo'lmasin (GM T1-11 §9). Oldin so'ralgan: ISSUES 0E #56 / MAJ #56.
- `completed_orders` faqat `completed` statusini sanasin.
- Kartadagi `purchase_url` shabloni olib tashlansin.

---

## 19. Bildirishnomalar (kod)

### Nima topildi

- Bitta `notify_user` 4 ta qator yozadi: `in_app`, `push`, `telegram`, `email`. Natijada socketga 4 ta `notification.created` keladi.
- O'qilmaganlar soni barcha kanallarni sanaydi (`:372-373`), shuning uchun har bir hodisada badge +4 oshadi.
- Marketplace bildirishnomalarining `data` maydonida `work_id` va `service_title` yo'q. Sotuvchiga ketadigan `marketplace_order_paid` da xizmat nomi umuman yo'q, body'da faqat `Mijoz: {ism}` yoziladi.
- Serverdagi barcha bildirishnomalarning `category` maydoni `system` (`notification_service.py:141`).
- Event nomlari aralash: kodda `marketplace_order_paid` (pastki chiziq bilan), qo'llanmada `marketplace.order_paid` (nuqta bilan).

### Kerak

- O'qilmaganlar soni faqat `in_app` qatorlarni sanasin. Socketga ham faqat `in_app` qator yuborilsin.
- Marketplace bildirishnomalarining `data` maydoniga `work_id`, `service_title`, `order_id`, `room_id` qo'shilsin.
- `category` to'g'ri qo'yilsin, masalan `orders`.
- Event nomlari bitta uslubda yozilsin.
- Oldin so'ralgan: ISSUES tail #75 / MAJ #75 (bitta hodisaga bitta yozuv).

---

## 20. Promotion (boost)

### Nima topildi

- `POST /promotions/checkout` sxemasida `specialization` maydoni yo'q (`marketplace_schemas.py:804-807`), shuning uchun u e'tiborga olinmaydi.
- **Narx va muddat:**
  - narx `days` ga bog'liq emas;
  - muddat paketdan emas, mijoz yuborgan `days` dan olinadi (standart qiymat 7). Natijada 30 kunlik paket `days` yuborilmasa 7 kun ishlaydi;
  - `days` ning yuqori chegarasi yo'q. Juda katta qiymat yuborilsa, tasdiqlash paytida webhook ichida sana hisoblashda xato chiqadi.
- **Dublikat:** himoya yo'q. Har bir bosishda yangi to'lov va yangi Telegram xabar yaratiladi.
- **Javoblar:**
  - checkout javobida `work_id` (`PROMO-...`) yo'q;
  - Telegram tasdig'ini kutayotgan paytda `/promotions/me` "hech qachon sotib olinmagan" bilan bir xil javob qaytaradi. Unda `package_title` va `boost_score` ham yo'q.
- **Test paketlar:** `/ads/products?status=active` ichida "TEST" va "Adm Ad" test paketlari bor.
- **Analytics:** `/promotions/analytics` raqamlari sun'iy (haqiqiy ma'lumotdan hisoblanmaydi).

### Kerak

- Muddat paketning `payload.days` qiymatidan olinsin. Mijoz yuborgan `days` e'tiborga olinmasin.
- Kutilayotgan checkout bo'lsa, qayta so'rovga 409 qaytsin.
- `specialization` yo amalga oshirilsin, yo qo'llanmadan olib tashlansin.
- Checkout javobiga `work_id` qo'shilsin.
- `/promotions/me` kutilayotgan holatni, `package_title`, `boost_score` va `ends_at` ni qaytarsin.
- Test paketlar o'chirilsin.
- Analytics haqiqiy ma'lumotdan hisoblansin (GM T7-03 §6).

---

## 21. `/clients/me/works` dagi marketplace buyurtma (kod)

### Nima topildi

- Marketplace buyurtma `service_order` sifatida `LGO-...` ID bilan chiqadi.
- `has_chat` doim `false` qaytadi, chat bloki yo'q. Shu sababli "Chatni ochish" tugmasi chiqmaydi.
- `status_label` ro'yxatida `pending_payment` va `paid` statuslari yo'q, shuning uchun ular inglizcha `Pending Payment`, `Paid` bo'lib chiqadi.

### Kerak

- ID 10-bandga moslashtirilsin.
- To'langan buyurtmada `room_id` qaytarilsin.
- `status_label` o'zbekcha bo'lsin.

---

## 22. `mark-paid` marketplace to'lovida (kod)

### Nima topildi

- `POST /admin/payments/{id}/mark-paid` (`:8989`) marketplace to'lovini va buyurtmani `paid` qiladi.
- Lekin bir qator qadamlar bajarilmaydi:
  - purchase request `pending` holatida qoladi;
  - chat xonasi ochilmaydi;
  - marketplace bildirishnomalari ketmaydi;
  - Telegram tugmalari faol qoladi.
- To'lovning joriy statusi tekshirilmaydi. Telegramda bekor qilingan to'lov va buyurtma ham `paid` ga o'tib qoladi.

### Kerak

- Marketplace to'lovi uchun `mark-paid` Telegram tasdig'i bilan bir xil ishni qilsin yoki bunday to'lovlarga ishlatilmasin.
- Bekor qilingan to'lovni `paid` qilib bo'lmasin.

---

## 23. GM qo'shimcha talablari (PM qarori bilan)

- **T1-09 §5:** `gender`, `is_super` (Super advokat) va minimal staj (`min_experience`) filterlari. Oldin so'ralgan: ISSUES 0E #55 / MAJ #55.
- **T1-09 §2-4:**
  - tavsiya tartibi formulasi: moslik 40, reyting 30, bandlik 15, narx 15;
  - birinchi sahifada kamida bitta yangi sotuvchi bo'lishi.

  Frontend ro'yxatni qayta saralamaydi, shuning uchun bu backendda qilinishi kerak.
- **T1-09 §6 / T7-03 §6:** ko'rishlar, bosishlar va buyurtmalar logi.
- **T2-03 §6-7:** `success_rate` formulasi `(to'liq × 1 + qisman × 0.5) / tasdiqlangan ishlar` bo'lsin. Bundan tashqari `confirmed_cases` soni kerak: u 5 tadan kam bo'lsa, frontend foizni ko'rsatmaydi.
  - Hozir formula `(to'liq + qisman) / jami`.
  - Qo'llanma misolidagi 92% to'g'ri formula bo'yicha 83% bo'ladi.
- **T1-08 §2-3:** narx mijozning hududiga bog'liqmi? Hozir `selected_price` hamma uchun bir xil. Oldin so'ralgan: ISSUES 0F #68.
- **T1A-01 / T1A-04:** marketplace xaridi uchun bosqichli to'lov va shartnoma kerakmi?
- **Sotuvchining o'z xizmatlari:** `GET /lawyers/me/services` `selected_price` va ruxsat etilgan narx oralig'ini (`min_allowed`, `max_allowed`) qaytarsin. Bu sotuvchining xizmatlar sahifasi uchun kerak. Oldin so'ralgan: ISSUES 0E #61 / MAJ #61.
- **Xizmat tavsifi:** xizmatlar uchun `description` maydoni.

---

## 24. Yurist advokat xizmatini tanlay oladi, tasdiqlanmagan sotuvchi ham xizmat qo'sha oladi (kod)

### Nima topildi

- `assert_yurist_allowed_services` (`:406-417`) faqat `criminal-` va `administrative-` bilan boshlanadigan xizmatlarni bloklaydi (`:154`). `advokat_required` maydoni tekshirilmaydi.
- Natijada productionda 3 ta tasdiqlanmagan yurist `advokat_required=true` bo'lgan B02 va J03 xizmatlarini sotmoqda.
- `PUT /lawyers/me/services` (`:5346-5351`) tasdiqlanmagan (`pending`) sotuvchiga ham ruxsat beradi. Kabinetdagi `manage_services=false` faqat UI uchun belgi, backend uni tekshirmaydi.
- GM T2-11 §1-2 bo'yicha "Yurist advokat xizmatini tanlay olsa" — talab bajarilmagan hisoblanadi.

### Kerak

- Yurist `advokat_required=true` xizmatlarni tanlay olmasin.
- Tasdiqlanmagan sotuvchi xizmat qo'sha olmasin yoki uning xizmatlari marketplace'da ko'rinmasin.

---

## Qo'shimcha: xavfsizlik (marketplace'dan tashqari)

- `seed_showcase_data` funksiyasi `Demo Admin`, `Demo Manager` va `Demo Sales Operator` akkauntlarini kodga yozilgan standart parol bilan yaratadi (`:3722`, `:3900`, `:3917-3919`).
- Productionda 15 ta `LGP-DEMO` sotuvchi bor. Demak, seed productionda ishga tushgan va bu xodim akkauntlari ham yaratilgan bo'lishi mumkin. Biz login qilib tekshirmadik.
- Iltimos, tekshiring: bu akkauntlarni o'chiring yoki parolini almashtiring.

---

## Qo'llanmadagi noaniqliklar

- §8.4 dagi sotuvchining `pending_payment` tabi §14 ga zid (4-band).
- §3.5 da `work_id` `ADV-`, §5 da esa `ORD-` (10-band).
- §7 dagi checkout `specialization` maydoni ishlamaydi (20-band).
- §3.4 dagi "delivery time" — bu `delivery_minutes` maydonimi? Tasdiqlang.
- `sort` da `price_desc` yo'q. Kerakmi?
- Pul birligi: qo'llanmada narxlar butun so'mda, MAJ'da esa `*_tiyin` maydonlar so'ralgan. Marketplace javoblarida birlik aniq yozilsin.

---

## Frontend kutadigan javob

- Har bir band bo'yicha:
  - natija: "qilindi", "rad etildi" yoki "boshqacha qilindi";
  - commit;
  - production'ga chiqqan sana.
- O'zgargan endpointlar uchun real namuna JSON:
  - purchase-request (201);
  - `me/orders` (mijoz va sotuvchi);
  - WS xabarlari (`marketplace.order_paid`, rad etish);
  - `meta`.

---

## Bugun tekshirilgan va to'g'ri ishlaydigan narsalar

Bular **ishlaydi**, ularga tegmang:

- **`GET /marketplace/meta`:** 200 qaytaradi. `include_meta=true` bo'lsa, `meta` javobning yuqori darajasida keladi.
- **Ro'yxat filterlari:** `district`, `seller_type`, `service_id`, `category_id`, `verified`, butun sonli `min_rating`, `offset` va `limit` (1-100 oralig'ida; undan tashqarisi 422) ishlaydi.
- **`GET /marketplace/lawyers/{user_id}`:** 200 qaytaradi, `compare_key` bilan. Noma'lum ID bo'lsa 404 "Mutaxassis topilmadi".
- **`GET /marketplace/lawyers/{user_id}/services`:** 200 qaytaradi. Har bir xizmatda aniq `purchase_url`, `delivery_minutes` va `selected_price` bor.
- **Tavsiya tartibi:** `promotion_boost_score`, `trust_score`, `rating`, `completed_orders`.
- **`/ws/users/me`:** xabarlar `event` kaliti bilan, flat shaklda keladi. Frontend socketi ularni qabul qiladi.

---

## Xulosa

- **1-9-bandlar** marketplace'ning asosiy oqimini to'sib turibdi: xarid, to'lov tasdig'i, buyurtmalar va xavfsizlik. Frontend ishni shular yopilgandan keyin boshlaydi.
- **10-22-bandlar va 24-band** oqim to'liq va to'g'ri ishlashi uchun kerak.
- **23-band** PM qaroriga bog'liq.
