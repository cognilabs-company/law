"use client";
export { glyph, SxIconScope, ArrowLeftIcon, ExternalLinkIcon, RefreshCwIcon, CalendarCheckIcon, MessageSquareTextIcon, CircleCheckIcon, CheckIcon, CircleDashedIcon, ClipboardListIcon, TimerIcon, CoinsIcon, FileTextIcon, HandCoinsIcon, HourglassIcon, ListChecksIcon, LockIcon, PaperclipIcon, CirclePauseIcon, PencilIcon, BanIcon, RocketIcon, BadgeCheckIcon, StarIcon, CircleUserIcon, VideoIcon, CircleAlertIcon, XIcon, DownloadIcon, StoreIcon, HandshakeIcon, LifeBuoyIcon, SearchIcon, ImageIcon, ArrowRightLeftIcon, HistoryIcon, UserCheckIcon } from "@/components/admin/studio/sx/icons";
export { PhoneIcon, ForwardIcon, ImagePlusIcon, ShieldCheckIcon, EyeIcon, EyeOffIcon, BellRingIcon, ArrowRightIcon, MapPinIcon } from "lucide-react";

import type { CSSProperties } from "react";

// The dashboard's line drawings (public/img/xizmatlar, the image catalog's
// family M), drawn in a white circle by orderDetail1920.css (.odx-art).
export type OrderArt = "xizmatlar" | "Tezkor_Advokat" | "Huquqiy_hujjatlar" | "Hujjat_tayyor" | "Muammo_tahlili" | "Kafolat" | "Boshqa_mutaxassis" | "Pul_qaytarish" | "Guruh_video" | "Guruh_chat" | "Xavfsiz_tolov" | "Maxfiy_yozishma" | "Advokat_tekshiruvi" | "Operator";
export const artStyle = (name: OrderArt): CSSProperties => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;
