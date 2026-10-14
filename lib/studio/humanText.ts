// Generated from the backend's own Uzbek wording: each known sentence, page
// and section name maps to an id whose text lives in messages studio.human.*
// (uz / ru / en). A sentence that is not here is shown as the backend wrote it.
export const normText = (s: string): string => s.replace(/[\u2018\u2019\u02BB`\u00B4']/g, "'").trim().toLowerCase();
export const SURFACE_IDS: Record<string, string> = {
  "xavfsizlik va ruxsatlar|role, permission, access, risk va fayl siyosatlari": "s1",
  "marketplace|xizmat, sotuvchi va reklama bloklari": "s2",
  "operatsion boshqaruv|jarayon, status, navbat, kalendar va tizim sozlamalari": "s3",
  "konsultatsiya xonasi|qo'ng'iroq sifati, qurilma ruxsatlari va recording holati": "s4",
  "sifat nazorati|checklist, baholash, shikoyat va sanksiya qoidalari": "s5",
  "moliya boshqaruvi|narx, to'lov, komissiya va payout qoidalari": "s6",
  "rozilik oynasi|foydalanuvchiga ko'rsatiladigan huquqiy matn va versiya": "s7",
  "tezkor advokat|konsultatsiya turi, vaqt, narx va meeting qoidalari": "s8",
  "sotuv voronkasi|kanban ustunlari va ruxsat etilgan status o'tishlari": "s9",
  "admin dashboard|widget, metrika va drill-down natijalari": "s10",
  "hujjatlar|hujjat tanlash, savolnoma, konstruktor va natija": "s11",
  "hujjat konstruktori|shablon matni, bandlar va to'ldiriladigan maydonlar": "s12",
  "excel export|ustun, bog'lanish, filter va format sozlamalari": "s13",
  "yangi hujjat buyurtmasi|mijoz to'ldiradigan bosqichma-bosqich savolnoma": "s14",
  "integratsiyalar|provider, webhook, health-check va fallback boshqaruvi": "s15",
  "xizmat sahifalari|landing, faq, seo va kontent bloklari": "s16",
  "advokat qidiruvi|qidiruv natijasidagi tartib va moslik ballari": "s17",
  "aloqa va konsultatsiya|bildirishnoma, chat, audio va video sessiyalar": "s18",
  "bildirishnomalar|kanal va til bo'yicha yakuniy xabar": "s19",
  "reklama preview|banner, profil yoki xizmat reklamasi joylashuvi": "s20",
  "rollar|rolning menyu, permission va field access matritsasi": "s21",
  "xizmatlar katalogi|kategoriya va subkategoriya navigatsiyasi": "s22",
  "huquqiy hujjatlar|oferta, rozilik, shart va siyosat matnlari": "s23",
  "studio ish maydoni|ish rejasi, acceptance, monitoring va nazorat": "s24",
  "studio boshqaruvi|tasdiqlash, release, audit va rollback": "s25",
  "studio boshqaruvi|global release, audit va rollback qoidalari": "s26",
  "ceo panel|widget, metrika, filter va ogohlantirishlar": "s27",
  "ma'lumotnomalar|select va filterlarda ishlatiladigan markaziy qiymatlar": "s28",
  "tarif tanlash|tarif kartasi, narx, imkoniyat va limitlar": "s29",
  "operator ticketlari|navbat, ustuvorlik, sla va transfer holati": "s30"
};
export const SURFACE_TITLE_IDS: Record<string, string> = {
  "xavfsizlik va ruxsatlar": "s1",
  "marketplace": "s2",
  "operatsion boshqaruv": "s3",
  "konsultatsiya xonasi": "s4",
  "sifat nazorati": "s5",
  "moliya boshqaruvi": "s6",
  "rozilik oynasi": "s7",
  "tezkor advokat": "s8",
  "sotuv voronkasi": "s9",
  "admin dashboard": "s10",
  "hujjatlar": "s11",
  "hujjat konstruktori": "s12",
  "excel export": "s13",
  "yangi hujjat buyurtmasi": "s14",
  "integratsiyalar": "s15",
  "xizmat sahifalari": "s16",
  "advokat qidiruvi": "s17",
  "aloqa va konsultatsiya": "s18",
  "bildirishnomalar": "s19",
  "reklama preview": "s20",
  "rollar": "s21",
  "xizmatlar katalogi": "s22",
  "huquqiy hujjatlar": "s23",
  "studio ish maydoni": "s24",
  "studio boshqaruvi": "s25",
  "ceo panel": "s27",
  "ma'lumotnomalar": "s28",
  "tarif tanlash": "s29",
  "operator ticketlari": "s30"
};
export const SECTION_IDS: Record<string, string> = {
  "asosiy": "c1",
  "kirish va auditoriya": "c2",
  "qoidalar": "c3",
  "faollik va muddat": "c4",
  "kontent": "c5",
  "narx va hisob-kitob": "c6",
  "jarayon va qoidalar": "c7"
};
export const NOTE_IDS: Record<string, string> = {
  "qizil yulduzchali maydonlar majburiy.": "n1",
  "select qiymatlarini qo'lda id sifatida yozmang; backend reference api'dan tanlang.": "n2",
  "preview real ma'lumotni o'zgartirmaydi.": "n3",
  "publishdan oldin diff va warninglarni tekshiring.": "n4"
};
export const CHECK_IDS: Record<string, string> = {
  "majburiy maydonlar to'ldirilgan": "c1",
  "reference qiymatlar mavjud": "c2",
  "preview kutilgan natijani ko'rsatmoqda": "c3",
  "validatsiya xatosiz": "c4",
  "ta'sir va ogohlantirishlar ko'rib chiqilgan": "c5"
};
export const WARN_IDS: Record<string, string> = {
  "o'zgarish publish bo'lishidan oldin tasdiqlash oqimidan o'tishi kerak.": "w1",
  "bu konfiguratsiya xavfsizlik, moliya yoki tizim boshqaruviga ta'sir qilishi mumkin.": "w2",
  "bu o'zgarish faol foydalanuvchilar va yangi operatsiyalarga ta'sir qilishi mumkin": "w3",
  "huquqiy matn o'zgarishi qayta rozilik talab qilishi mumkin": "w4"
};
// Help sentences the backend builds from a field's name: [id, pattern, has a text of ours].
export const HELP_RULES: [string, RegExp, boolean][] = [
  ["none", /^.* qiymatini ushbu konfiguratsiyaning vazifasiga mos kiriting\.$/, false],
  ["none2", /^.* ichidagi bog'liq sozlamalarni bir blok sifatida to'ldiring\.$/, false],
  ["number", /^.* uchun manfiy bo'lmagan aniq son kiriting\.$/, true],
  ["list", /^.* elementlarini kerakli tartibda qo'shing; har bir element alohida tekshiriladi\.$/, true],
  ["toggle", /^.* qoidasini yoqish yoki o'chirish uchun foydalaniladi\.$/, true],
  ["use", /^.* uchun foydalaniladi\.$/, false],
  ["pickOne", /^.* uchun ruxsat etilgan variantlardan birini tanlang\.$/, true],
  ["pickExisting", /^.* uchun tizimdagi mavjud qiymatlardan birini tanlang\.$/, true],
  ["pickMany", /^.* uchun bir yoki bir nechta mos variantni tanlang\.$/, true],
  ["name", /^foydalanuvchi va admin ekranlarida tushunarli ko'rinadigan nomni kiriting\.$/, true],
  ["status", /^.* holatini tanlang\.$/, true],
  ["key", /^.* uchun takrorlanmaydigan lotincha kalit kiriting\.$/, true],
  ["orderHint", /^kichik son ro'yxatda yuqoriroq ko'rinadi\.$/, true],
  ["activeHint", /^yoqilsa element tegishli foydalanuvchi ekranlarida ishlay boshlaydi\.$/, true],
  ["perms", /^rol yoki foydalanuvchiga beriladigan aniq ruxsatlarni tanlang\.$/, true],
];
