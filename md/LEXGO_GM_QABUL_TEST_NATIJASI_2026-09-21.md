# LexGo — GM qabul tekshiruvi, qayta tahlil va tuzatish (2026-09-21)

**Asos:** `LexGo_GM_Qabul_tekshiruvi_v1.1 3.docx` (o'zgarmagan — 09-17 tahlilda ishlatilgan nusxa bilan bir xil) + qo'shimcha yuborilgan `S17.docx`/`s 18-33.docx`/`s34-48.docx`/`S 48-61.docx`.
**Oldingi natija:** `LEXGO_GM_QABUL_TEST_NATIJASI_2026-09-16.md` va `...2026-09-19.md`; to'liq holat jadvali `LEXGO_GM_v1.1_TAHLIL_VA_SOLISHTIRUV_2026-09-17.md`da.
**Bu hujjat nima qildi:** (1) 4 ta qo'shimcha faylning aslida nima ekanini aniqladi, (2) 17–19.09dan beri qilingan commitlarni asosiy 684-talab ro'yxati bilan qayta solishtirdi, (3) frontendda hal qilsa bo'ladigan qolgan bo'shliqlarni tuzatdi.

---

## 1. Qo'shimcha 4 ta fayl (S17, s18-33, s34-48, S48-61)

**Xulosa: bular `Qabul tekshiruvi` (684 talab) hujjatiga aloqasi yo'q — boshqa hujjat.**

"S" — sahifa emas, PM qaror raqami: bular `V1.1 LexGo_Ishlab_chiqish_rejasi.docx` (dev-reja, 107 vazifa + 61 PM qarori) hujjatidan S-17…S-61 qarorlari kesib olingan nusxalar. Bu hujjat allaqachon 17.09'da to'liq tahlil qilingan (`LEXGO_LOYIHA_TAHLILI_VA_HOLAT_2026-09-17.md`, §1.2/1.3), va real kodda ham shu ID'larga bog'langan izohlar bor (`grep -rno "S-[0-9]+" law/` — masalan `LawyersSection.tsx` S-19/S-42, `OrderActions.tsx` S-20, `DocumentRequestPanel.tsx` S-35). Yangi talab yo'q, qayta ishlash shart emas.

---

## 2. 17–19.09'dan beri YOPILGAN (endi qayta tekshirmang)

Quyidagilar 09-16/09-19 hujjatlarida "yo'q"/"qisman" deb yozilgan edi, lekin shu orada qilingan commitlar (`19c8c8a`…`f158574`) ularni yopdi:

- **T1-03** — Lite/Pro tariflar, 3/6/12 oy chegirmalari to'g'irlandi
- **T1B-01, T1B-04, T1B-05, T1B-06, T1B-09** — mijoz paketlari, kalendar (5 tur, ICS, e2e sinaldi), conflict check, AI ish vositalari, DOCX shablon import
- **T2-06, T2-08/T5-05** — payoutlar, referal progress (mijoz + advokat)
- **T2-10** — rad etish sababi tanlagichi (S-20 ro'yxati)
- **T3-10** — xavfsizlik hodisalari/anomaliya paneli
- **T0-20, T1-11** — ish vaqti/ta'til, bayram, ish vaqtidan tashqari ogohlantirish
- **T1-14** — bu sessiyada LegalZoom uslubidagi hujjat builder qayta yozildi: 3 tilli labellar, progress, autosave, DOCX, sana/matn maydonlari, sariq/pushti highlight
- **T0-10, T0-18, T1A-02, T4-01/T4-02** — identity, huquqiy hujjatlar admin, onboarding, CRM

Shuningdek 20-21.09'da: advokat/yurist boshqaruv panellari qayta dizayn, real File Manager, ATMOS obuna, sotuv-funnel lead drawer, sidebar/analytics, guest AI chat kvota (haqiqiy backend kontraktiga ulandi), civil-court katalog/shablon tuzatishlari.

---

## 3. Bugun FRONTENDDA TUZATILDI

### T1-06 — Katalog qidiruvi ✅
09-19 testda: "нафака" (o'zbek-kirill) va "ajrashuv"→"ajralish" (imlo varianti) 0 natija berardi. Sabab: backend `/services/search` 200 status bilan bo'sh massiv qaytarganda frontend fallback filtriga umuman tushmasdi.

Tuzatish (`lib/searchMatch.ts`, `app/[locale]/portal/client/services/page.tsx`):
- Kirill→lotin transliteratsiya (o'zbekcha ў/қ/ғ/ҳ harflari bilan)
- Uzbek agglyutinativ so'z-o'zak mosligi (umumiy prefiks nisbati) + Levenshtein masofasi — "ajrashuv"/"ajralish" kabi bir ildizli so'zlarni topadi
- Server 200+bo'sh natija qaytarganda ham mahalliy moslikka tushadi (avval bu holat "server ishladi" deb hisoblanib, hech qachon fallback ishlamasdi)
- Real va manfiy holatlar bilan sinaldi (node skriptida): нафака✅, ajrashuv→ajralish✅, aliment/алимент✅ (eski holat saqlandi), "ish haqi" (ko'p so'zli)✅; soxta-moslik yo'q (shartnoma/meros, davo/davlat — ikkalasi ham to'g'ri false berdi)

### T2-04 — Reyting ko'rinishi ⚠️ 1/4 → ~3/4 (mavjud ma'lumot doirasida)
`SellerMetrics.tsx`:
- **§4 "Yangi" holati** — to'liq: 5 tadan kam baho bo'lsa reyting raqami o'rniga "Yangi" chiqadi (`profile.reviews < 5`, xuddi T1-09'dagi ochiq ro'yxat kabi haqiqiy `reviews_count`dan)
- **§3 Super-advokat mezonlari** — 6 sharning 4 tasi HAQIQIY ma'lumot bilan (reyting>4.5, javob foizi>90%, staj≥3 yil, yakunlangan buyurtma≥10 — profildan real o'qiladi); qolgan 2 tasi (viloyat TOP-3 g'alaba, 6 oy shikoyatsizlik) ma'lumot yo'qligi aniq ko'rsatilib, soxta qiymat berilmadi
- **§1 Reyting tarkibi** — vaznlar (50/15/15/10/10) matn sifatida tushuntirildi; backend har-omil bo'yicha ALOHIDA raqam bermagani uchun jonli breakdown emas
- **§2 tarix grafigi** — BACKEND-BLOCKED, tegilmadi (tarixiy ma'lumot yo'q)

Ikkalasi ham `npx tsc --noEmit` va `eslint` toza, dev-serverda compile bo'ldi.

---

## 4. Frontendda hal qilib bo'lmaydigan, YANGI qayd qilingan (backend so'rovlari)

`LEXGO_BACKEND_ISSUES_2026-09-15.md`ning yangi **0F** bo'limiga #67–76 qilib qo'shildi: T1-07 (xizmat pasporti — 6/13 guruh yo'q), T1-08 (mijoz `region` yozib bo'lmaydi), T2-04 §3 qolgan 2 shart, T3-02 (Excel import), T3-03 (narx qoidalari admin), T3-13 (reestr qayta tekshiruv), T3-14 (paket analitikasi), T4-03 (skriptlar), T4-05 (lid skoring), T4-07 (vaqt-tarifli konsultatsiya).

Bu 9 talab **backend endpoint bo'lmasa umuman frontendda qurib bo'lmaydi** — soxta/ko'rinishi-uchun-tugma yasalmadi, shu hujjatda ochiq qoldirildi.

---

## 5. Xulosa

09-17 tahlilida "~27% bajarilgan" deb baholangan edi — bu son endi ancha eskirgan: yuqoridagi §2 ro'yxati (13+ vazifa) shu orada real yopilgan. Yangi to'liq foiz hisobi uchun 101 vazifaning har birini qayta ko'zdan kechirish kerak (bu sessiyada vaqt tejash uchun faqat 09-16/09-19'da ochiq qolgan bandlar + yangi 5 fayl tekshirildi, hammasi qayta auditlanmadi). Qat'iy frontend-doable ikkita band (T1-06, T2-04 qisman) bugun yopildi; qolgan ochiq bandlarning deyarli barchasi backend/admin-CMS ishi — ro'yxati §4'da.
