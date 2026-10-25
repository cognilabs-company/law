// Trilingual legal-services catalog for the advocate registration
// practice-area picker. Labels are inline per-locale (uz Latin, ru, en)
// because the taxonomy is large and product-owned, not backend records.

export type CatalogLocale = "uz" | "ru" | "en";

export type LegalSubservice = {
  key: string; // globally unique, kebab-case, category-prefixed
  label: Record<CatalogLocale, string>;
  advocateOnly?: boolean; // this single service needs an advocate even if its category doesn't
};

export type LegalCategory = {
  key: string; // unique kebab-case category slug
  label: Record<CatalogLocale, string>;
  advocateOnly?: boolean; // only advocates may offer these; lawyers cannot
  services: LegalSubservice[];
};

export const LEGAL_SERVICES: LegalCategory[] = [
  {
    key: "family",
    label: {
      uz: "Oila va nikoh",
      ru: "Семья и брак",
      en: "Family & marriage",
    },
    services: [
      {
        key: "family-divorce",
        label: {
          uz: "Nikohni bekor qilish",
          ru: "Расторжение брака",
          en: "Divorce",
        },
      },
      {
        key: "family-alimony",
        label: {
          uz: "Aliment undirish",
          ru: "Взыскание алиментов",
          en: "Alimony recovery",
        },
      },
      {
        key: "family-alimony-change",
        label: {
          uz: "Aliment miqdorini o'zgartirish",
          ru: "Изменение размера алиментов",
          en: "Changing the alimony amount",
        },
      },
      {
        key: "family-child-residence",
        label: {
          uz: "Bolaning yashash joyini belgilash",
          ru: "Определение места жительства ребёнка",
          en: "Determining the child's place of residence",
        },
      },
      {
        key: "family-parental-rights",
        label: {
          uz: "Ota-onalik huquqini belgilash",
          ru: "Установление родительских прав",
          en: "Establishing parental rights",
        },
      },
      {
        key: "family-parental-rights-deprivation",
        label: {
          uz: "Ota-onalik huquqidan mahrum qilish",
          ru: "Лишение родительских прав",
          en: "Deprivation of parental rights",
        },
      },
      {
        key: "family-parental-rights-restoration",
        label: {
          uz: "Ota-onalik huquqini tiklash",
          ru: "Восстановление родительских прав",
          en: "Restoration of parental rights",
        },
      },
      {
        key: "family-child-visitation",
        label: {
          uz: "Bolani ko'rish tartibini belgilash",
          ru: "Определение порядка общения с ребёнком",
          en: "Establishing child visitation arrangements",
        },
      },
      {
        key: "family-marriage-contract",
        label: {
          uz: "Nikoh shartnomasi",
          ru: "Брачный договор",
          en: "Marriage contract",
        },
      },
      {
        key: "family-property-division",
        label: {
          uz: "Er-xotin mol-mulkini bo'lish",
          ru: "Раздел имущества супругов",
          en: "Division of marital property",
        },
      },
      {
        key: "family-paternity",
        label: {
          uz: "Otalikni belgilash",
          ru: "Установление отцовства",
          en: "Establishing paternity",
        },
      },
    ],
  },
  {
    key: "realestate",
    label: {
      uz: "Uy-joy va ko'chmas mulk",
      ru: "Жильё и недвижимость",
      en: "Housing & real estate",
    },
    services: [
      {
        key: "realestate-purchase-due-diligence",
        label: {
          uz: "Uy sotib olish/sotish bo'yicha huquqiy tekshiruv",
          ru: "Юридическая проверка при покупке/продаже жилья",
          en: "Legal due diligence for buying/selling a home",
        },
      },
      {
        key: "realestate-document-review",
        label: {
          uz: "Ko'chmas mulk hujjatlarini tekshirish",
          ru: "Проверка документов на недвижимость",
          en: "Reviewing real estate documents",
        },
      },
      {
        key: "realestate-ownership-recognition",
        label: {
          uz: "Uyga mulk huquqini tan olish",
          ru: "Признание права собственности на жильё",
          en: "Recognition of property ownership",
        },
      },
      {
        key: "realestate-housing-disputes",
        label: {
          uz: "Uy-joy nizolari",
          ru: "Жилищные споры",
          en: "Housing disputes",
        },
      },
      {
        key: "realestate-eviction",
        label: {
          uz: "Uydan chiqarish",
          ru: "Выселение",
          en: "Eviction",
        },
      },
      {
        key: "realestate-move-in",
        label: {
          uz: "Uyga kiritish",
          ru: "Вселение",
          en: "Granting occupancy",
        },
      },
      {
        key: "realestate-lease-contract",
        label: {
          uz: "Ijara shartnomasi",
          ru: "Договор аренды",
          en: "Lease contract",
        },
      },
      {
        key: "realestate-lease-disputes",
        label: {
          uz: "Ijara nizolari",
          ru: "Споры по аренде",
          en: "Lease disputes",
        },
      },
      {
        key: "realestate-land-plot",
        label: {
          uz: "Yer uchastkasi bilan bog'liq masalalar",
          ru: "Вопросы, связанные с земельным участком",
          en: "Land plot matters",
        },
      },
      {
        key: "realestate-construction",
        label: {
          uz: "Qurilishga oid huquqiy masalalar",
          ru: "Правовые вопросы строительства",
          en: "Construction-related legal matters",
        },
      },
      {
        key: "realestate-inherited",
        label: {
          uz: "Merosdagi ko'chmas mulk",
          ru: "Недвижимость в наследстве",
          en: "Inherited real estate",
        },
      },
      {
        key: "realestate-division",
        label: {
          uz: "Ko'chmas mulkni bo'lish",
          ru: "Раздел недвижимости",
          en: "Division of real estate",
        },
      },
    ],
  },
  {
    key: "debt",
    label: {
      uz: "Qarz, pul va undirish",
      ru: "Долги, деньги и взыскание",
      en: "Debt, money & recovery",
    },
    services: [
      {
        key: "debt-repayment",
        label: {
          uz: "Qarzni qaytarish",
          ru: "Возврат долга",
          en: "Debt repayment",
        },
      },
      {
        key: "debt-receipt-recovery",
        label: {
          uz: "Tilxat bo'yicha pul undirish",
          ru: "Взыскание денег по расписке",
          en: "Recovery of money under a receipt",
        },
      },
      {
        key: "debt-loan-contract",
        label: {
          uz: "Qarz shartnomasi",
          ru: "Договор займа",
          en: "Loan contract",
        },
      },
      {
        key: "debt-court-recovery",
        label: {
          uz: "Sud orqali pul undirish",
          ru: "Взыскание денег через суд",
          en: "Recovery of money through the court",
        },
      },
      {
        key: "debt-damage-compensation",
        label: {
          uz: "Zararni qoplash",
          ru: "Возмещение ущерба",
          en: "Damage compensation",
        },
      },
      {
        key: "debt-penalty-recovery",
        label: {
          uz: "Penya va jarima undirish",
          ru: "Взыскание пени и штрафов",
          en: "Recovery of penalties and fines",
        },
      },
      {
        key: "debt-unjust-enrichment",
        label: {
          uz: "Asossiz boyish",
          ru: "Неосновательное обогащение",
          en: "Unjust enrichment",
        },
      },
      {
        key: "debt-credit-disputes",
        label: {
          uz: "Kredit nizolari",
          ru: "Кредитные споры",
          en: "Credit disputes",
        },
      },
      {
        key: "debt-bank-disputes",
        label: {
          uz: "Bank bilan nizolar",
          ru: "Споры с банком",
          en: "Disputes with banks",
        },
      },
      {
        key: "debt-judgment-enforcement",
        label: {
          uz: "Sud hujjatini ijro ettirish",
          ru: "Исполнение судебного акта",
          en: "Enforcement of a court judgment",
        },
      },
    ],
  },
  {
    key: "court",
    label: {
      uz: "Sud va nizolar",
      ru: "Суд и споры",
      en: "Court & disputes",
    },
    services: [
      {
        key: "court-claim-drafting",
        label: {
          uz: "Da'vo arizasi tayyorlash",
          ru: "Подготовка искового заявления",
          en: "Drafting a statement of claim",
        },
      },
      {
        key: "court-representation",
        label: {
          uz: "Sudda vakillik",
          ru: "Представительство в суде",
          en: "Representation in court",
        },
      },
      {
        key: "court-complaint",
        label: {
          uz: "Sudga shikoyat",
          ru: "Жалоба в суд",
          en: "Complaint to the court",
        },
      },
      {
        key: "court-appeal",
        label: {
          uz: "Apellyatsiya",
          ru: "Апелляция",
          en: "Appeal",
        },
      },
      {
        key: "court-cassation",
        label: {
          uz: "Kassatsiya",
          ru: "Кассация",
          en: "Cassation",
        },
      },
      {
        key: "court-judgment-review",
        label: {
          uz: "Sud hujjatini qayta ko'rib chiqish",
          ru: "Пересмотр судебного акта",
          en: "Review of a court judgment",
        },
      },
      {
        key: "court-evidence-preparation",
        label: {
          uz: "Dalillarni tayyorlash",
          ru: "Подготовка доказательств",
          en: "Preparing evidence",
        },
      },
      {
        key: "court-document-filing",
        label: {
          uz: "Sudga hujjat topshirish",
          ru: "Подача документов в суд",
          en: "Filing documents with the court",
        },
      },
      {
        key: "court-lawyer-participation",
        advocateOnly: true,
        label: {
          uz: "Sudda advokat ishtirokini ta'minlash",
          ru: "Обеспечение участия адвоката в суде",
          en: "Ensuring a lawyer's participation in court",
        },
      },
    ],
  },
  {
    key: "criminal",
    advocateOnly: true,
    label: {
      uz: "Jinoyat ishlari",
      ru: "Уголовные дела",
      en: "Criminal cases",
    },
    services: [
      {
        key: "criminal-lawyer",
        label: {
          uz: "Jinoyat ishi bo'yicha advokat",
          ru: "Адвокат по уголовному делу",
          en: "Lawyer for a criminal case",
        },
      },
      {
        key: "criminal-defense-counsel",
        label: {
          uz: "Himoyachi jalb qilish",
          ru: "Привлечение защитника",
          en: "Engaging a defense counsel",
        },
      },
      {
        key: "criminal-investigation-lawyer",
        label: {
          uz: "Tergovda advokat ishtirokini ta'minlash",
          ru: "Обеспечение участия адвоката на следствии",
          en: "Ensuring a lawyer's participation in the investigation",
        },
      },
      {
        key: "criminal-interrogation-lawyer",
        label: {
          uz: "So'roqda advokat",
          ru: "Адвокат на допросе",
          en: "Lawyer at interrogation",
        },
      },
      {
        key: "criminal-detention",
        label: {
          uz: "Qamoqqa olish bilan bog'liq masalalar",
          ru: "Вопросы, связанные с заключением под стражу",
          en: "Matters related to arrest and detention",
        },
      },
      {
        key: "criminal-complaint",
        label: {
          uz: "Jinoyat ishi bo'yicha shikoyat",
          ru: "Жалоба по уголовному делу",
          en: "Complaint in a criminal case",
        },
      },
      {
        key: "criminal-victim-protection",
        label: {
          uz: "Jabrlanuvchi manfaatlarini himoya qilish",
          ru: "Защита интересов потерпевшего",
          en: "Protecting the victim's interests",
        },
      },
      {
        key: "criminal-appeal",
        label: {
          uz: "Apellyatsiya",
          ru: "Апелляция",
          en: "Appeal",
        },
      },
      {
        key: "criminal-cassation",
        label: {
          uz: "Kassatsiya",
          ru: "Кассация",
          en: "Cassation",
        },
      },
      {
        key: "criminal-document-analysis",
        label: {
          uz: "Jinoyat ishi bo'yicha hujjatlarni tahlil qilish",
          ru: "Анализ документов по уголовному делу",
          en: "Analysis of criminal case documents",
        },
      },
    ],
  },
  {
    key: "administrative",
    advocateOnly: true,
    label: {
      uz: "Ma'muriy ishlar",
      ru: "Административные дела",
      en: "Administrative cases",
    },
    services: [
      {
        key: "administrative-report-assistance",
        label: {
          uz: "Ma'muriy bayonnoma bo'yicha yordam",
          ru: "Помощь по административному протоколу",
          en: "Assistance with an administrative report",
        },
      },
      {
        key: "administrative-fine",
        label: {
          uz: "Ma'muriy jarima",
          ru: "Административный штраф",
          en: "Administrative fine",
        },
      },
      {
        key: "administrative-lawyer",
        label: {
          uz: "Ma'muriy ish bo'yicha advokat",
          ru: "Адвокат по административному делу",
          en: "Lawyer for an administrative case",
        },
      },
      {
        key: "administrative-decision-appeal",
        label: {
          uz: "Davlat organi qarori ustidan shikoyat",
          ru: "Обжалование решения госоргана",
          en: "Appeal against a state body's decision",
        },
      },
      {
        key: "administrative-traffic",
        label: {
          uz: "Yo'l harakati qoidalari bilan bog'liq ishlar",
          ru: "Дела, связанные с правилами дорожного движения",
          en: "Cases related to traffic rules",
        },
      },
      {
        key: "administrative-court-application",
        label: {
          uz: "Ma'muriy sudga murojaat",
          ru: "Обращение в административный суд",
          en: "Application to the administrative court",
        },
      },
      {
        key: "administrative-appeal",
        label: {
          uz: "Ma'muriy ish bo'yicha apellyatsiya",
          ru: "Апелляция по административному делу",
          en: "Appeal in an administrative case",
        },
      },
    ],
  },
  {
    key: "labor",
    label: {
      uz: "Mehnat qonunchiligi",
      ru: "Трудовое право",
      en: "Labor law",
    },
    services: [
      {
        key: "labor-onboarding-documents",
        label: {
          uz: "Ishga qabul qilish hujjatlari",
          ru: "Документы при приёме на работу",
          en: "Employment onboarding documents",
        },
      },
      {
        key: "labor-employment-contract",
        label: {
          uz: "Mehnat shartnomasi",
          ru: "Трудовой договор",
          en: "Employment contract",
        },
      },
      {
        key: "labor-dismissal-dispute",
        label: {
          uz: "Ishdan bo'shatish bo'yicha nizo",
          ru: "Спор об увольнении",
          en: "Dismissal dispute",
        },
      },
      {
        key: "labor-wage-recovery",
        label: {
          uz: "Ish haqini undirish",
          ru: "Взыскание заработной платы",
          en: "Recovery of wages",
        },
      },
      {
        key: "labor-reinstatement",
        label: {
          uz: "Ishga tiklash",
          ru: "Восстановление на работе",
          en: "Reinstatement at work",
        },
      },
      {
        key: "labor-leave",
        label: {
          uz: "Mehnat ta'tili",
          ru: "Трудовой отпуск",
          en: "Labor leave",
        },
      },
      {
        key: "labor-dispute",
        label: {
          uz: "Mehnat nizosi",
          ru: "Трудовой спор",
          en: "Labor dispute",
        },
      },
      {
        key: "labor-material-damage",
        label: {
          uz: "Moddiy zarar",
          ru: "Материальный ущерб",
          en: "Material damage",
        },
      },
      {
        key: "labor-employee-dispute",
        label: {
          uz: "Xodim bilan nizo",
          ru: "Спор с работником",
          en: "Dispute with an employee",
        },
      },
      {
        key: "labor-employer-protection",
        label: {
          uz: "Ish beruvchi huquqlarini himoya qilish",
          ru: "Защита прав работодателя",
          en: "Protecting the employer's rights",
        },
      },
    ],
  },
  {
    key: "company",
    label: {
      uz: "Biznes ochish va kompaniya",
      ru: "Открытие бизнеса и компания",
      en: "Business setup & company",
    },
    services: [
      {
        key: "company-formation",
        label: {
          uz: "Kompaniya tashkil qilish",
          ru: "Создание компании",
          en: "Company formation",
        },
      },
      {
        key: "company-founding-documents",
        label: {
          uz: "Ta'sis hujjatlari",
          ru: "Учредительные документы",
          en: "Founding documents",
        },
      },
      {
        key: "company-charter-drafting",
        label: {
          uz: "Ustav tayyorlash",
          ru: "Подготовка устава",
          en: "Drafting the charter",
        },
      },
      {
        key: "company-reorganization",
        label: {
          uz: "Kompaniyani qayta tashkil etish",
          ru: "Реорганизация компании",
          en: "Company reorganization",
        },
      },
      {
        key: "company-liquidation",
        label: {
          uz: "Kompaniyani tugatish",
          ru: "Ликвидация компании",
          en: "Company liquidation",
        },
      },
      {
        key: "company-founders-agreement",
        label: {
          uz: "Ta'sischilar o'rtasidagi kelishuv",
          ru: "Соглашение между учредителями",
          en: "Agreement between founders",
        },
      },
      {
        key: "company-share-transfer",
        label: {
          uz: "Ulushni sotish/o'tkazish",
          ru: "Продажа/передача доли",
          en: "Sale/transfer of a share",
        },
      },
    ],
  },
  {
    key: "contracts",
    label: {
      uz: "Shartnomalar",
      ru: "Договоры",
      en: "Contracts",
    },
    services: [
      {
        key: "contracts-drafting",
        label: {
          uz: "Shartnoma tuzish",
          ru: "Заключение договора",
          en: "Concluding a contract",
        },
      },
      {
        key: "contracts-review",
        label: {
          uz: "Shartnomani tekshirish",
          ru: "Проверка договора",
          en: "Contract review",
        },
      },
      {
        key: "contracts-amendment",
        label: {
          uz: "Shartnomaga o'zgartirish kiritish",
          ru: "Внесение изменений в договор",
          en: "Amending a contract",
        },
      },
      {
        key: "contracts-termination",
        label: {
          uz: "Shartnomani bekor qilish",
          ru: "Расторжение договора",
          en: "Contract termination",
        },
      },
      {
        key: "contracts-service",
        label: {
          uz: "Xizmat ko'rsatish shartnomasi",
          ru: "Договор оказания услуг",
          en: "Service contract",
        },
      },
      {
        key: "contracts-lease",
        label: {
          uz: "Ijara shartnomasi",
          ru: "Договор аренды",
          en: "Lease contract",
        },
      },
      {
        key: "contracts-sale-purchase",
        label: {
          uz: "Oldi-sotdi shartnomasi",
          ru: "Договор купли-продажи",
          en: "Sale and purchase contract",
        },
      },
      {
        key: "contracts-supply",
        label: {
          uz: "Ta'minot shartnomasi",
          ru: "Договор поставки",
          en: "Supply contract",
        },
      },
      {
        key: "contracts-loan",
        label: {
          uz: "Qarz shartnomasi",
          ru: "Договор займа",
          en: "Loan contract",
        },
      },
      {
        key: "contracts-employment",
        label: {
          uz: "Mehnat shartnomasi",
          ru: "Трудовой договор",
          en: "Employment contract",
        },
      },
      {
        key: "contracts-partnership",
        label: {
          uz: "Hamkorlik shartnomasi",
          ru: "Договор о сотрудничестве",
          en: "Partnership contract",
        },
      },
      {
        key: "contracts-nda",
        label: {
          uz: "NDA / maxfiylik kelishuvi",
          ru: "NDA / соглашение о конфиденциальности",
          en: "NDA / confidentiality agreement",
        },
      },
      {
        key: "contracts-public-offer",
        label: {
          uz: "Ommaviy oferta",
          ru: "Публичная оферта",
          en: "Public offer",
        },
      },
    ],
  },
  {
    key: "tax",
    label: {
      uz: "Soliq va bojxona",
      ru: "Налоги и таможня",
      en: "Tax & customs",
    },
    services: [
      {
        key: "tax-consultation",
        label: {
          uz: "Soliq bo'yicha maslahat",
          ru: "Налоговая консультация",
          en: "Tax consultation",
        },
      },
      {
        key: "tax-disputes",
        label: {
          uz: "Soliq nizolari",
          ru: "Налоговые споры",
          en: "Tax disputes",
        },
      },
      {
        key: "tax-audit-assistance",
        label: {
          uz: "Soliq tekshiruvi bo'yicha huquqiy yordam",
          ru: "Правовая помощь при налоговой проверке",
          en: "Legal assistance with a tax audit",
        },
      },
      {
        key: "tax-debt",
        label: {
          uz: "Soliq qarzdorligi",
          ru: "Налоговая задолженность",
          en: "Tax debt",
        },
      },
      {
        key: "tax-decision-appeal",
        label: {
          uz: "Soliq organi qaroridan shikoyat",
          ru: "Обжалование решения налогового органа",
          en: "Appeal against a tax authority's decision",
        },
      },
      {
        key: "tax-customs",
        label: {
          uz: "Bojxona masalalari",
          ru: "Таможенные вопросы",
          en: "Customs matters",
        },
      },
      {
        key: "tax-customs-disputes",
        label: {
          uz: "Bojxona nizolari",
          ru: "Таможенные споры",
          en: "Customs disputes",
        },
      },
      {
        key: "tax-import-export",
        label: {
          uz: "Import/eksportda huquqiy yordam",
          ru: "Правовая помощь при импорте/экспорте",
          en: "Legal assistance with import/export",
        },
      },
    ],
  },
  {
    key: "documents",
    label: {
      uz: "Hujjat va arizalar",
      ru: "Документы и заявления",
      en: "Documents & applications",
    },
    services: [
      {
        key: "documents-application",
        label: {
          uz: "Ariza tayyorlash",
          ru: "Подготовка заявления",
          en: "Drafting an application",
        },
      },
      {
        key: "documents-complaint",
        label: {
          uz: "Shikoyat tayyorlash",
          ru: "Подготовка жалобы",
          en: "Drafting a complaint",
        },
      },
      {
        key: "documents-statement-of-claim",
        label: {
          uz: "Da'vo arizasi",
          ru: "Исковое заявление",
          en: "Statement of claim",
        },
      },
      {
        key: "documents-power-of-attorney",
        label: {
          uz: "Ishonchnoma",
          ru: "Доверенность",
          en: "Power of attorney",
        },
      },
      {
        key: "documents-demand-letter",
        label: {
          uz: "Talabnoma",
          ru: "Претензия",
          en: "Demand letter",
        },
      },
      {
        key: "documents-explanatory-note",
        label: {
          uz: "Tushuntirish xati",
          ru: "Объяснительная записка",
          en: "Explanatory note",
        },
      },
      {
        key: "documents-official-letter",
        label: {
          uz: "Rasmiy xat",
          ru: "Официальное письмо",
          en: "Official letter",
        },
      },
      {
        key: "documents-contract",
        label: {
          uz: "Shartnoma",
          ru: "Договор",
          en: "Contract",
        },
      },
      {
        key: "documents-legal-opinion",
        label: {
          uz: "Huquqiy xulosa",
          ru: "Правовое заключение",
          en: "Legal opinion",
        },
      },
      {
        key: "documents-legal-review",
        label: {
          uz: "Hujjatni huquqiy tekshirish",
          ru: "Правовая проверка документа",
          en: "Legal review of a document",
        },
      },
    ],
  },
  {
    key: "gov-disputes",
    label: {
      uz: "Davlat organlari bilan nizolar",
      ru: "Споры с госорганами",
      en: "Disputes with state bodies",
    },
    services: [
      {
        key: "gov-disputes-application",
        label: {
          uz: "Davlat organiga ariza",
          ru: "Заявление в госорган",
          en: "Application to a state body",
        },
      },
      {
        key: "gov-disputes-decision-appeal",
        label: {
          uz: "Davlat organi qaroridan shikoyat",
          ru: "Обжалование решения госоргана",
          en: "Appeal against a state body's decision",
        },
      },
      {
        key: "gov-disputes-refusal-appeal",
        label: {
          uz: "Rad javobi ustidan shikoyat",
          ru: "Обжалование отказа",
          en: "Appeal against a refusal",
        },
      },
      {
        key: "gov-disputes-administrative-matters",
        label: {
          uz: "Ma'muriy masalalar",
          ru: "Административные вопросы",
          en: "Administrative matters",
        },
      },
      {
        key: "gov-disputes-public-services",
        label: {
          uz: "Davlat xizmatlaridan foydalanishda huquqiy yordam",
          ru: "Правовая помощь в получении госуслуг",
          en: "Legal assistance in accessing public services",
        },
      },
      {
        key: "gov-disputes-official-action-appeal",
        label: {
          uz: "Mansabdor shaxs harakati/harakatsizligi ustidan shikoyat",
          ru: "Обжалование действий/бездействия должностного лица",
          en: "Appeal against an official's action or inaction",
        },
      },
    ],
  },
  {
    key: "inheritance",
    label: {
      uz: "Meros",
      ru: "Наследство",
      en: "Inheritance",
    },
    services: [
      {
        key: "inheritance-acceptance",
        label: {
          uz: "Merosni qabul qilish",
          ru: "Принятие наследства",
          en: "Acceptance of inheritance",
        },
      },
      {
        key: "inheritance-rights-formalization",
        label: {
          uz: "Meros huquqini rasmiylashtirish",
          ru: "Оформление права на наследство",
          en: "Formalizing inheritance rights",
        },
      },
      {
        key: "inheritance-deadline-restoration",
        label: {
          uz: "Meros muddatini tiklash",
          ru: "Восстановление срока принятия наследства",
          en: "Restoring the inheritance deadline",
        },
      },
      {
        key: "inheritance-division",
        label: {
          uz: "Merosni bo'lish",
          ru: "Раздел наследства",
          en: "Division of inheritance",
        },
      },
      {
        key: "inheritance-housing",
        label: {
          uz: "Merosdagi uy-joy",
          ru: "Жильё в наследстве",
          en: "Inherited housing",
        },
      },
      {
        key: "inheritance-dispute",
        label: {
          uz: "Meros nizosi",
          ru: "Наследственный спор",
          en: "Inheritance dispute",
        },
      },
      {
        key: "inheritance-will",
        label: {
          uz: "Vasiyatnoma",
          ru: "Завещание",
          en: "Will",
        },
      },
      {
        key: "inheritance-will-revocation",
        label: {
          uz: "Vasiyatnomani bekor qilish/o'zgartirish",
          ru: "Отмена/изменение завещания",
          en: "Revocation/amendment of a will",
        },
      },
      {
        key: "inheritance-renunciation",
        label: {
          uz: "Merosdan voz kechish",
          ru: "Отказ от наследства",
          en: "Renunciation of inheritance",
        },
      },
    ],
  },
  {
    key: "consumer",
    label: {
      uz: "Zarar va iste'molchi huquqlari",
      ru: "Ущерб и права потребителей",
      en: "Damages & consumer rights",
    },
    services: [
      {
        key: "consumer-rights-protection",
        label: {
          uz: "Iste'molchi huquqlarini himoya qilish",
          ru: "Защита прав потребителей",
          en: "Consumer rights protection",
        },
      },
      {
        key: "consumer-defective-goods",
        label: {
          uz: "Sifatsiz tovar",
          ru: "Некачественный товар",
          en: "Defective goods",
        },
      },
      {
        key: "consumer-poor-service",
        label: {
          uz: "Sifatsiz xizmat",
          ru: "Некачественная услуга",
          en: "Poor-quality service",
        },
      },
      {
        key: "consumer-refund",
        label: {
          uz: "Pulni qaytarish",
          ru: "Возврат денег",
          en: "Refund",
        },
      },
      {
        key: "consumer-warranty-dispute",
        label: {
          uz: "Kafolat bo'yicha nizo",
          ru: "Спор по гарантии",
          en: "Warranty dispute",
        },
      },
      {
        key: "consumer-moral-damage",
        label: {
          uz: "Ma'naviy zarar",
          ru: "Моральный ущерб",
          en: "Moral damage",
        },
      },
      {
        key: "consumer-material-damage",
        label: {
          uz: "Moddiy zarar",
          ru: "Материальный ущерб",
          en: "Material damage",
        },
      },
      {
        key: "consumer-traffic-accident-damage",
        label: {
          uz: "Yo'l-transport hodisasidan zarar",
          ru: "Ущерб от дорожно-транспортного происшествия",
          en: "Damage from a traffic accident",
        },
      },
      {
        key: "consumer-insurance-dispute",
        label: {
          uz: "Sug'urta to'lovi bo'yicha nizo",
          ru: "Спор по страховой выплате",
          en: "Insurance payout dispute",
        },
      },
    ],
  },
  {
    key: "business-protection",
    label: {
      uz: "Tadbirkorlik va biznes himoyasi",
      ru: "Предпринимательство и защита бизнеса",
      en: "Entrepreneurship & business protection",
    },
    services: [
      {
        key: "business-protection-disputes",
        label: {
          uz: "Biznes nizolari",
          ru: "Бизнес-споры",
          en: "Business disputes",
        },
      },
      {
        key: "business-protection-partner-dispute",
        label: {
          uz: "Hamkorlar o'rtasidagi nizo",
          ru: "Спор между партнёрами",
          en: "Dispute between partners",
        },
      },
      {
        key: "business-protection-receivables",
        label: {
          uz: "Debitor qarzdorlik",
          ru: "Дебиторская задолженность",
          en: "Accounts receivable",
        },
      },
      {
        key: "business-protection-creditors",
        label: {
          uz: "Kreditorlar bilan munosabat",
          ru: "Отношения с кредиторами",
          en: "Relations with creditors",
        },
      },
      {
        key: "business-protection-court-defense",
        label: {
          uz: "Kompaniyani sudda himoya qilish",
          ru: "Защита компании в суде",
          en: "Defending the company in court",
        },
      },
      {
        key: "business-protection-counterparty-check",
        label: {
          uz: "Kontragentni tekshirish",
          ru: "Проверка контрагента",
          en: "Counterparty due diligence",
        },
      },
      {
        key: "business-protection-risk-assessment",
        label: {
          uz: "Biznes xavflarini huquqiy baholash",
          ru: "Правовая оценка бизнес-рисков",
          en: "Legal assessment of business risks",
        },
      },
      {
        key: "business-protection-inspection-preparation",
        label: {
          uz: "Tekshiruvlarga tayyorgarlik",
          ru: "Подготовка к проверкам",
          en: "Preparation for inspections",
        },
      },
      {
        key: "business-protection-ongoing-legal-service",
        label: {
          uz: "Korxonaga doimiy yuridik xizmat",
          ru: "Постоянное юридическое обслуживание предприятия",
          en: "Ongoing legal services for a business",
        },
      },
    ],
  },
  {
    key: "ip",
    label: {
      uz: "Brend, intellektual mulk va internet",
      ru: "Бренд, интеллектуальная собственность и интернет",
      en: "Brand, IP & internet",
    },
    services: [
      {
        key: "ip-trademark-registration",
        label: {
          uz: "Tovar belgisini ro'yxatdan o'tkazish",
          ru: "Регистрация товарного знака",
          en: "Trademark registration",
        },
      },
      {
        key: "ip-brand-protection",
        label: {
          uz: "Brend himoyasi",
          ru: "Защита бренда",
          en: "Brand protection",
        },
      },
      {
        key: "ip-copyright",
        label: {
          uz: "Mualliflik huquqi",
          ru: "Авторское право",
          en: "Copyright",
        },
      },
      {
        key: "ip-disputes",
        label: {
          uz: "Intellektual mulk nizolari",
          ru: "Споры по интеллектуальной собственности",
          en: "Intellectual property disputes",
        },
      },
      {
        key: "ip-online-infringement",
        label: {
          uz: "Internetda huquqbuzarlik",
          ru: "Правонарушения в интернете",
          en: "Online infringement",
        },
      },
      {
        key: "ip-content-rights",
        label: {
          uz: "Kontent huquqlari",
          ru: "Права на контент",
          en: "Content rights",
        },
      },
      {
        key: "ip-domain-name",
        label: {
          uz: "Domen nomi bilan bog'liq masalalar",
          ru: "Вопросы, связанные с доменным именем",
          en: "Domain name matters",
        },
      },
      {
        key: "ip-licensing",
        label: {
          uz: "Litsenziyalash",
          ru: "Лицензирование",
          en: "Licensing",
        },
      },
    ],
  },
  {
    key: "migration",
    label: {
      uz: "Xorij, viza va migratsiya",
      ru: "Заграница, виза и миграция",
      en: "Abroad, visa & migration",
    },
    services: [
      {
        key: "migration-visa",
        label: {
          uz: "Viza masalalari",
          ru: "Визовые вопросы",
          en: "Visa matters",
        },
      },
      {
        key: "migration-matters",
        label: {
          uz: "Migratsiya masalalari",
          ru: "Миграционные вопросы",
          en: "Migration matters",
        },
      },
      {
        key: "migration-work-abroad",
        label: {
          uz: "Xorijda ishlash",
          ru: "Работа за рубежом",
          en: "Working abroad",
        },
      },
      {
        key: "migration-foreign-citizens-rights",
        label: {
          uz: "Xorijiy fuqarolarning O'zbekistondagi huquqlari",
          ru: "Права иностранных граждан в Узбекистане",
          en: "Rights of foreign citizens in Uzbekistan",
        },
      },
      {
        key: "migration-foreign-companies",
        label: {
          uz: "Xorijiy kompaniyalar",
          ru: "Иностранные компании",
          en: "Foreign companies",
        },
      },
      {
        key: "migration-international-contracts",
        label: {
          uz: "Xalqaro shartnomalar",
          ru: "Международные договоры",
          en: "International contracts",
        },
      },
      {
        key: "migration-documents-abroad",
        label: {
          uz: "Xorijdagi hujjatlar bo'yicha huquqiy yordam",
          ru: "Правовая помощь по документам за рубежом",
          en: "Legal assistance with documents abroad",
        },
      },
    ],
  },
];

// Flat map of every category AND subservice key -> its label object.
const LABEL_INDEX: Record<string, Record<CatalogLocale, string>> = (() => {
  const m: Record<string, Record<CatalogLocale, string>> = {};
  for (const c of LEGAL_SERVICES) {
    m[c.key] = c.label;
    for (const s of c.services) m[s.key] = s.label;
  }
  return m;
})();

// Resolve a category/subservice key to a label. A key this catalog does not
// know (one seeded by the backend, e.g. "fixture-nikoh-shartnomasi") is
// shown as words rather than as a slug: its test prefix dropped, dashes
// turned into spaces, the first letter capitalised.
const SEED_PREFIX = /^(fixture|test|demo|e2e|qa)[-_]+/i;
export function legalServiceLabel(key: string, locale: CatalogLocale): string {
  const hit = LABEL_INDEX[key] ?? LABEL_INDEX[key.replace(SEED_PREFIX, "")];
  if (hit) return hit[locale];
  const words = key.replace(SEED_PREFIX, "").replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase(locale) + words.slice(1) : key;
}

// All subservice keys (flat).
export const LEGAL_SUBSERVICE_KEYS: string[] = LEGAL_SERVICES.flatMap((c) =>
  c.services.map((s) => s.key),
);
