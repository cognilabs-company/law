# LexGo Backend Update — Civil Court Document Templates

## Nima qilindi

36 ta fuqarolik sud hujjati production backendda qayta tozalandi.

- `GET /services` ichidagi `CIV-001` ... `CIV-036` xizmatlarida `document_template_id` bor.
- Har bir xizmat uchun `GET /services/{service_id}/document-template` endi toza `fields` va `template.template_text` qaytaradi.
- Eski raw blanklar (`________`, `20____`, uzun separatorlar) olib tashlandi.
- Har bir field template matni ichidagi mos `{{field_key}}` placeholder bilan bog‘landi.
- Preview/generate uchun barcha required fieldlar to‘ldirilsa hujjat to‘liq render bo‘ladi.

## Frontend qanday ishlatadi

1. Xizmatni tanlash:
   `GET /services`

2. Tanlangan xizmat fieldlarini olish:
   `GET /services/{service_id}/document-template`

3. Formani `fields` array asosida chizish.

4. Mijoz kiritgan qiymatlarni `answers` qilib yuborish.

5. Preview/generate oqimi mavjud endpointlar bilan ishlaydi.

## Muhim

- Fieldlar backenddan keladi, frontend ularni taxmin qilmasligi kerak.
- `template.template_text` ichidagi `{{...}}` placeholderlar backend tomonidan boshqariladi.
- Frontend faqat `fields` bo‘yicha input chiqaradi va `answers` qaytaradi.

## Kelajakdagi DOCX uploadlar

Backend DOCX import paytida:

- `{{placeholder}}` bo‘lsa, shu placeholderlardan field yaratadi.
- Oddiy blank joylar (`________`, `20____`) bo‘lsa, ularni avtomatik fieldga aylantiradi.
- Field label/type kontekstga qarab ajratiladi: sud nomi, da’vogar, javobgar, sana, summa, telefon, email va boshqalar.

## Test natijasi

Production serverda tekshirildi:

- 36/36 CIV template topildi.
- 0 ta raw blank qoldi.
- 0 ta field matndan uzilib qolgan.
- 36/36 template test `answers` bilan render bo‘ldi.
- Kelajak import testi: sud, da’vogar, javobgar, sana fieldlari to‘g‘ri ajraldi.

Backend: `https://lexgo.api.cognilabs.org`
