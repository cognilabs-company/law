# LexGo frontend → backend: call-center savollari (2026-11-10)

Operator №1 (`+998901004001`, "Navbatchi yurist") va operator №2 (`+998901004002`, call-center operatori) bilan ilovani ko'rib chiqqanda topilgan xatolar frontendda tuzatildi (`docs/LEXGO_CALL_CENTER_FIXES_2026_11_10.md`). Quyidagilar faqat backend hal qila oladigan joylar. Frontend ularni soxta ma'lumot bilan to'ldirmaydi.

## 1. `GET /call-center/queue`: navbatdagi ishda mijoz kim?

Hozir navbat qatorida mijozning ismi va telefoni aniq maydonda kelmaydi. Frontend endi quyidagilarning hammasini o'qiydi: `client_name`, `client_phone`, `client_user_id`, ichma-ich `client` / `customer` / `user` / `contact` obyektlari va lid uchun `details.name` / `details.phone`. Lid qatorlari yana `/call-center/leads/kanban` orqali ham to'ldiriladi.

**Iltimos:** har bir navbat qatoriga (ayniqsa `type: "order"`) bitta aniq shakl qo'shing:

```json
"client": { "id": "<user uuid>", "name": "Dilnoza Karimova", "phone": "+998900000005", "phone_visible": true }
```

Shunda operator ro'yxatdan turib kimga qo'ng'iroq qilishini ko'radi. Buyurtma qatorida bu maydon bo'lmasa, kartada hamon "Ism ko'rsatilmagan" chiqadi.

## 2. `GET /calls/analytics`: "missed" hisobi

Live javob: `total: 18, answered: 4, missed: 0`. Ulush esa 78% chiqardi. Frontend endi `missed = total - answered` deb hisoblaydi.

**Savol:** `missed` faqat `status = missed` bo'lgan qo'ng'iroqlarmi? `no_answer` va `busy` ham shunga kiradimi? Agar kirmasa, ular uchun alohida maydon bering (`no_answer`, `busy`). Shunda yig'indi `total` ga teng bo'ladi.

## 3. `GET /crm/me/metrics`: "Yutilgan" ikki xil

`won: 0, closed: 0, conversion_percent: 0`, lekin `cycle_metrics.won: 1, conversion_percent: 100`. Frontend endi ikkala kartada ham sikllar tarixidagi raqamni ko'rsatadi, chunki bir marta yutilgan natija yutilgan bo'lib qoladi.

**Savol:** "Mening natijam" uchun to'g'ri manba shumi? Yuqoridagi `won` / `closed` / `conversion_percent` lidning hozirgi holati bo'yicha hisoblanadimi? Agar shunday bo'lsa, bir xil nom bilan ikki xil raqam bermaslik uchun ularni `current_won` kabi boshqa nom bilan bering.

## 4. `GET /crm/customers/{id}`: lidlar ro'yxati

Kartada `active_lead_count: 2`, lekin `leads` ro'yxati bo'sh keldi. Frontend endi bunday holatda `GET /crm/leads?customer_id=…` ni so'raydi va javobni mijoz bo'yicha o'zi ham tekshiradi.

**Iltimos:** (a) mijoz kartasida `leads` ro'yxatini hisoblagich bilan bir xil to'ldiring. (b) `GET /crm/leads` `customer_id` filtrini rasman qo'llab-quvvatlasinmi? Hozir u hujjatda yo'q.

## 5. Bildirishnoma: "Butun rolga" yuborish huquqi

Navbatchi yuristda `notifications.manage` bor, shuning uchun u butun rolga (masalan, barcha mijozlarga) xabar yubora olardi. Alohida ruxsat yo'q. Frontend endi "Butun rolga" ni faqat superadmin/admin yoki `notifications.broadcast` ruxsati bor odamga ko'rsatadi.

**Iltimos:** `notifications.broadcast` (yoki boshqa nomdagi) alohida ruxsat qo'shing va `POST /admin/notifications` da `audience_role` bilan yuborishni shu ruxsatga bog'lang. Nomi boshqacha bo'lsa, bizga ayting.

## 6. Bildirishnoma: qabul qiluvchini qidirish

`users.manage` yo'q odam (navbatchi yurist) uchun qabul qiluvchi endi `GET /users/search?q=` orqali ism yoki telefon bo'yicha tanlanadi (ID qo'lda yozilmaydi). Avatar uchun `avatar_url` (yoki `photo_url`) ham o'qiladi.

**Savol:** navbatchi yurist `/users/search` ni chaqira oladimi? 403 bo'lsa, ekranda "Odamlarni qidirish sizga ochilmagan" chiqadi va u hech kimga yubora olmaydi. Unga kimlarni topish ruxsat etilganini ayting (masalan, faqat o'z ishlaridagi mijozlar va advokatlar).

## 7. Masofaviy yordam: menyu va sahifa

Operator №2 ga menyuda "Masofaviy yordam" chiqar edi (unda `remote_assist.supervise` yoki `remote_assist.view_audit` bor), lekin `GET /remote-assistance/meta` dagi `capabilities.supervise` va `emergency_revoke` `false` edi. Natijada sahifa "Bu bo'lim sizga ochilmagan" derdi. Frontend endi menyuni ham `meta.capabilities` bo'yicha ko'rsatadi.

**Savol:** `remote_assist.view_audit` bor odam audit jurnalini ko'rishi kerakmi? Kerak bo'lsa, `meta.capabilities.view_audit: true` qaytaring. Shunda biz unga faqat audit ko'rinishini ochamiz.

## 8. Ikkala test hisobining ismi "LexGo Navbatchi advokat"

Profil (`/auth/me` va profil maydoni "Ism") ikkala hisob uchun ham shu matnni qaytaradi. Frontend ismni to'g'ri joydan o'qiyapti, rol nomini ism o'rniga qo'ymayapti.

**Iltimos:** test hisoblarga haqiqiy ism bering (masalan, "Operator 1", "Operator 2"). Yoki bu ismni ataylab shunday qo'yganingizni tasdiqlang.

## 9. Vazifalar: ruxsat xabari

`/tasks/*` 403 bilan `"Bu task amali uchun ruxsat yo'q"` qaytaradi (faqat o'zbekcha va inglizcha "task" so'zi bilan). Frontend endi 403 da o'z tarjimasini (uz/ru/en) ko'rsatadi.

**Iltimos:** xabar matniga tayanmasligimiz uchun `detail.code` ni doim yuboring (masalan, `task_permission_denied`). Agar matn ham qolsa, uni "vazifa" deb tuzating.
