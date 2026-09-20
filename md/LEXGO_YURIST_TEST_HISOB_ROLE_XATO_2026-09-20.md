# Test hisob "Yurist" deb nomlangan, lekin backendda "advokat" roli bilan ro'yxatdan o'tgan

**Sana:** 2026-09-20
**Kimga:** backend dasturchi
**Asos:** frontend tarafda "yurist" (lawyer) portalini haqiqiy hisob bilan sinab ko'rish uchun berilgan test login ma'lumotlari.

## Muammo

Bergan test hisoblar ro'yxatida quyidagi ikkita seller hisobi bor:

- **Advokat** — telefon `+998900000006`
- **Yurist** — telefon `+998900000007`

`+998900000007` raqami bilan (to'g'ri parol, 2FA ham muvaffaqiyatli o'tib) tizimga kirdim va sessiya/JWT tarkibini tekshirdim — ikkalasi ham quyidagini qaytaradi:

```
name: "LexGo Yurist"
role: "advokat"
```

Ya'ni **hisobning nomi "Yurist" bo'lsa-da, uning backenddagi haqiqiy roli — "advokat"**. Buni ikki marta, turli vaqtda (bir necha soat farq bilan) qayta tekshirdim — natija bir xil, tasodifiy/keshlangan xato emas.

Frontend faqat backend qaytargan `role` maydoniga qarab qaysi portalga (`/portal/advocate` yoki `/portal/lawyer`) yo'naltirishni hal qiladi — shuning uchun bu hisob har doim advokat panelida ochiladi, garchi u "Yurist" test hisobi sifatida mo'ljallangan bo'lsa ham.

## Natija

Frontend tarafda yurist (lawyer) roliga tegishli sahifalarni (`/portal/lawyer/*`) — jumladan bugun qilingan yangi boshqaruv paneli dizaynini — **haqiqiy, real backend ma'lumoti bilan sinab ko'rishning iloji yo'q**, chunki berilgan test hisoblarning birortasi ham `role: yurist` qaytarmaydi.

## Kerak bo'lgan narsa

`+998900000007` hisobining backenddagi rolini `advokat`dan `yurist`ga to'g'irlab bering (yoki agar bu hisob atayin advokat sifatida qoldirilishi kerak bo'lsa — o'rniga haqiqiy `role: yurist` bilan ishlaydigan yangi test hisob yarating va menga telefon/parolini bering).

## Frontend holati

O'zgarishsiz — bu butunlay hisob ma'lumotlar bazasidagi rol biriktirish muammosi, frontend kodida hech qanday xato topilmadi.
