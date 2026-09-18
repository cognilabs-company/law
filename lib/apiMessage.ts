// Backend error details are Uzbek-only (no error codes yet — backend ask
// #73). For the ru/en UI the most common phrases are translated here by
// pattern; anything unknown is shown as the server sent it.
type Locale = "uz" | "ru" | "en";

const TABLE: [RegExp, { ru: string; en: string }][] = [
  [/^Ruxsat yo'q/i, { ru: "Нет доступа.", en: "Not allowed." }],
  [/Login qiling/i, { ru: "Войдите в аккаунт.", en: "Please sign in." }],
  [/Phone yoki password noto'g'ri/i, { ru: "Неверный телефон или пароль.", en: "Wrong phone or password." }],
  [/Bu phone bilan user mavjud/i, { ru: "Пользователь с этим номером уже существует.", en: "A user with this phone already exists." }],
  [/Qayta yuborish uchun kuting/i, { ru: "Подождите перед повторной отправкой.", en: "Please wait before resending." }],
  [/Urinishlar limiti tugadi/i, { ru: "Слишком много попыток. Попробуйте позже.", en: "Too many attempts. Try again later." }],
  [/Kod 3 marta noto'g'ri kiritildi/i, { ru: "Код введён неверно 3 раза. Попробуйте через 15 минут.", en: "The code was wrong 3 times. Try again in 15 minutes." }],
  [/Tasdiqlash kodi muddati tugagan/i, { ru: "Срок действия кода истёк.", en: "The code has expired." }],
  [/kodi? noto'g'ri/i, { ru: "Неверный код.", en: "Wrong code." }],
  [/bugungi OTP limiti tugagan/i, { ru: "Дневной лимит кодов для этого номера исчерпан.", en: "The daily code limit for this number is used up." }],
  [/Private chat ochish uchun .*to'lov qiling/i, { ru: "Чтобы открыть приватный чат, оплатите его.", en: "Pay for the private chat to open it." }],
  [/(Payme|Click|OneID|MyID) integratsiyasi sozlanmagan/i, { ru: "Интеграция $1 ещё не настроена.", en: "$1 integration is not configured yet." }],
  [/Demo provider productionda yopiq/i, { ru: "Демо-провайдер закрыт в production.", en: "The demo provider is closed in production." }],
  [/Demo endpoint yopiq/i, { ru: "Демо-режим отключён.", en: "Demo mode is off." }],
  [/Meetingni faqat host tugata oladi/i, { ru: "Завершить встречу может только организатор.", en: "Only the host can end the meeting." }],
  [/Faqat meeting host user qo'sha oladi/i, { ru: "Приглашать может только организатор встречи.", en: "Only the meeting host can invite." }],
  [/Order boshqa yurist tomonidan olingan/i, { ru: "Заказ уже взят другим исполнителем.", en: "The order was taken by another provider." }],
  [/Admin tasdig'idan keyin foydalanish mumkin/i, { ru: "Доступно после подтверждения администратором.", en: "Available after admin approval." }],
  [/(\S.*) topilmadi$/i, { ru: "$1 не найден(а).", en: "$1 not found." }],
  [/mavjud emas/i, { ru: "Недоступно.", en: "Not available." }],
  [/muddati tugagan/i, { ru: "Срок истёк.", en: "Expired." }],
  [/noto'g'ri/i, { ru: "Неверные данные.", en: "Invalid data." }],
];

export function currentLocale(): Locale {
  if (typeof window === "undefined") return "uz";
  const m = /^\/(uz|ru|en)(\/|$)/.exec(window.location.pathname);
  return (m?.[1] as Locale) || "uz";
}

// Translate a backend detail for the current UI locale (uz → as is).
export function localizeApiDetail(detail: string, locale: Locale = currentLocale()): string {
  const d = (detail || "").trim();
  if (!d || locale === "uz") return d;
  for (const [re, tr] of TABLE) {
    const m = re.exec(d);
    if (m) return tr[locale].replace(/\$1/g, m[1] ?? "");
  }
  return d;
}
