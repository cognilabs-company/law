import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

const PROCESS_DAYS = "30";
const KEEP_YEARS = "3";
const EMAIL = "cognilabs@vallomat.com";

type Copy = {
  title: string;
  lead: string;
  how: string;
  steps: string[];
  deleted: string;
  deletedList: string[];
  kept: string;
  keptList: string[];
  open: string;
  note: string;
  cta: string;
};

const COPY: Record<string, Copy> = {
  uz: {
    title: "LexGo: hisobni va ma'lumotlarni o'chirish",
    lead: "Bu sahifada LexGo ilovasidagi hisobingizni o'chirishni qanday so'rashingiz va qaysi ma'lumotlar o'chirilishi yoki saqlanishi tushuntirilgan.",
    how: "Hisobni o'chirishni so'rash",
    steps: [
      `${EMAIL} manziliga «Hisobni o'chirish» mavzusida xat yuboring va hisobingiz ro'yxatdan o'tgan telefon raqamini ko'rsating.`,
      "Shaxsingiz o'sha telefon raqami orqali tasdiqlanadi — boshqa hech qanday hujjat so'ralmaydi.",
      `So'rov ${PROCESS_DAYS} kun ichida bajariladi va natija haqida sizga xabar beriladi.`,
    ],
    deleted: "Nima o'chiriladi",
    deletedList: [
      "Hisobingiz yopiladi va ilovaga kirish imkoni to'xtatiladi.",
      "Profil ma'lumotlari: ism, telefon raqami, hudud va boshqa shaxsiy ma'lumotlar.",
      "Chatlardagi xabarlar, yuklangan fayllar va hujjatlar.",
    ],
    kept: "Nima saqlanadi",
    keptList: [
      `To'lov va buyurtma yozuvlari (summa, sana, holat) qonun talablariga ko'ra ${KEEP_YEARS} yil saqlanadi. Ularda shaxsiy ma'lumotlar minimal darajada qoldiriladi.`,
      "Xavfsizlik va firibgarlikka qarshi kurash uchun zarur bo'lgan yozuvlar.",
    ],
    open: "Faol obuna yoki tugallanmagan buyurtma",
    note: "Agar faol obunangiz yoki tugallanmagan buyurtmangiz bo'lsa, so'rovni ko'rib chiqishda ular bilan nima qilish kerakligini aytamiz va yordam beramiz. Hisob o'chirilgach, uni tiklab bo'lmaydi — keyinroq yangi hisob yaratishingiz mumkin.",
    cta: "Hisobni o'chirish uchun xat yuborish",
  },
  ru: {
    title: "LexGo: удаление аккаунта и данных",
    lead: "На этой странице объясняется, как запросить удаление аккаунта в приложении LexGo и какие данные удаляются или сохраняются.",
    how: "Как запросить удаление",
    steps: [
      `Отправьте письмо на ${EMAIL} с темой «Удаление аккаунта» и укажите номер телефона, на который зарегистрирован аккаунт.`,
      "Личность подтверждается по этому номеру телефона — другие документы не требуются.",
      `Запрос выполняется в течение ${PROCESS_DAYS} дней, о результате мы сообщим.`,
    ],
    deleted: "Что удаляется",
    deletedList: [
      "Аккаунт закрывается, вход в приложение прекращается.",
      "Данные профиля: имя, номер телефона, регион и другие личные данные.",
      "Сообщения в чатах, загруженные файлы и документы.",
    ],
    kept: "Что сохраняется",
    keptList: [
      `Записи о платежах и заказах (сумма, дата, статус) хранятся ${KEEP_YEARS} года согласно требованиям законодательства. Личные данные в них сводятся к минимуму.`,
      "Записи, необходимые для безопасности и борьбы с мошенничеством.",
    ],
    open: "Активная подписка или незавершённый заказ",
    note: "Если у вас есть активная подписка или незавершённый заказ, при рассмотрении запроса мы подскажем, что с ними делать, и поможем. После удаления аккаунт восстановить нельзя — позже можно создать новый.",
    cta: "Отправить письмо об удалении аккаунта",
  },
  en: {
    title: "LexGo: delete your account and data",
    lead: "This page explains how to request deletion of your LexGo account and which data is deleted or kept.",
    how: "How to request deletion",
    steps: [
      `Email ${EMAIL} with the subject “Account deletion” and state the phone number your account is registered with.`,
      "We verify you through that phone number — no other document is required.",
      `The request is completed within ${PROCESS_DAYS} days and we will let you know the result.`,
    ],
    deleted: "What is deleted",
    deletedList: [
      "Your account is closed and sign-in stops working.",
      "Profile data: name, phone number, region and other personal details.",
      "Chat messages, uploaded files and documents.",
    ],
    kept: "What is kept",
    keptList: [
      `Payment and order records (amount, date, status) are kept for ${KEEP_YEARS} years as required by law, with personal data minimised.`,
      "Records needed for security and fraud prevention.",
    ],
    open: "Active subscription or unfinished order",
    note: "If you have an active subscription or an unfinished order, we will tell you what to do with it while we handle your request and help you through it. A deleted account cannot be restored — you can create a new one later.",
    cta: "Email us to delete the account",
  },
};

const pick = (locale: string): Copy => COPY[locale] ?? COPY.uz;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: pick(locale).title };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale);
  return (
    <section className="sec legal">
      <div className="wrap legal__in">
        <h1 className="h2">{c.title}</h1>
        <article className="legal__body">
          <p>{c.lead}</p>
          <h2>{c.how}</h2>
          <ol>
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="legal__act">
            <a className="btn btn--pri" href={`mailto:${EMAIL}?subject=${encodeURIComponent(c.title)}`}>
              {c.cta}
            </a>
          </p>
          <h2>{c.deleted}</h2>
          <ul>
            {c.deletedList.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h2>{c.kept}</h2>
          <ul>
            {c.keptList.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h2>{c.open}</h2>
          <p>{c.note}</p>
        </article>
      </div>
    </section>
  );
}
