"use client";

import { createElement, type ReactElement, type ReactNode } from "react";
import { IconContext } from "@phosphor-icons/react/dist/lib/context";
import type { IconProps } from "@phosphor-icons/react/dist/lib/types";
import { studioReferenceKey } from "@/lib/services/studio";
import type { SxIcon, SxSection, SxStatusKey } from "./types";
import { ArchiveIcon } from "@phosphor-icons/react/dist/csr/Archive";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { ArrowUUpLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowUUpLeft";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { ArrowsDownUpIcon } from "@phosphor-icons/react/dist/csr/ArrowsDownUp";
import { ArrowsSplitIcon } from "@phosphor-icons/react/dist/csr/ArrowsSplit";
import { BarcodeIcon } from "@phosphor-icons/react/dist/csr/Barcode";
import { BellRingingIcon } from "@phosphor-icons/react/dist/csr/BellRinging";
import { BinocularsIcon } from "@phosphor-icons/react/dist/csr/Binoculars";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/csr/Briefcase";
import { BroadcastIcon } from "@phosphor-icons/react/dist/csr/Broadcast";
import { BrowserIcon } from "@phosphor-icons/react/dist/csr/Browser";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { CalendarDotsIcon } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { CalendarStarIcon } from "@phosphor-icons/react/dist/csr/CalendarStar";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { ChartBarIcon } from "@phosphor-icons/react/dist/csr/ChartBar";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import { ChatsCircleIcon } from "@phosphor-icons/react/dist/csr/ChatsCircle";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CircleDashedIcon } from "@phosphor-icons/react/dist/csr/CircleDashed";
import { ClipboardTextIcon } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { ClockClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockClockwise";
import { ClockCountdownIcon } from "@phosphor-icons/react/dist/csr/ClockCountdown";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { CodeIcon } from "@phosphor-icons/react/dist/csr/Code";
import { CoinsIcon } from "@phosphor-icons/react/dist/csr/Coins";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { CrownIcon } from "@phosphor-icons/react/dist/csr/Crown";
import { CubeIcon } from "@phosphor-icons/react/dist/csr/Cube";
import { DatabaseIcon } from "@phosphor-icons/react/dist/csr/Database";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { ExportIcon } from "@phosphor-icons/react/dist/csr/Export";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { FileArrowDownIcon } from "@phosphor-icons/react/dist/csr/FileArrowDown";
import { FileLockIcon } from "@phosphor-icons/react/dist/csr/FileLock";
import { FileTextIcon } from "@phosphor-icons/react/dist/csr/FileText";
import { FingerprintIcon } from "@phosphor-icons/react/dist/csr/Fingerprint";
import { FlagIcon } from "@phosphor-icons/react/dist/csr/Flag";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { FrameCornersIcon } from "@phosphor-icons/react/dist/csr/FrameCorners";
import { FunnelIcon } from "@phosphor-icons/react/dist/csr/Funnel";
import { FunnelSimpleIcon } from "@phosphor-icons/react/dist/csr/FunnelSimple";
import { GaugeIcon } from "@phosphor-icons/react/dist/csr/Gauge";
import { GavelIcon } from "@phosphor-icons/react/dist/csr/Gavel";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { HandCoinsIcon } from "@phosphor-icons/react/dist/csr/HandCoins";
import { HandshakeIcon } from "@phosphor-icons/react/dist/csr/Handshake";
import { HardDrivesIcon } from "@phosphor-icons/react/dist/csr/HardDrives";
import { HashIcon } from "@phosphor-icons/react/dist/csr/Hash";
import { HeadsetIcon } from "@phosphor-icons/react/dist/csr/Headset";
import { HourglassMediumIcon } from "@phosphor-icons/react/dist/csr/HourglassMedium";
import { IdentificationBadgeIcon } from "@phosphor-icons/react/dist/csr/IdentificationBadge";
import { ImageSquareIcon } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { KanbanIcon } from "@phosphor-icons/react/dist/csr/Kanban";
import { LayoutIcon } from "@phosphor-icons/react/dist/csr/Layout";
import { LifebuoyIcon } from "@phosphor-icons/react/dist/csr/Lifebuoy";
import { LinkSimpleIcon } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/csr/ListBullets";
import { ListChecksIcon } from "@phosphor-icons/react/dist/csr/ListChecks";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { ListPlusIcon } from "@phosphor-icons/react/dist/csr/ListPlus";
import { LockKeyIcon } from "@phosphor-icons/react/dist/csr/LockKey";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MedalIcon } from "@phosphor-icons/react/dist/csr/Medal";
import { MegaphoneIcon } from "@phosphor-icons/react/dist/csr/Megaphone";
import { MegaphoneSimpleIcon } from "@phosphor-icons/react/dist/csr/MegaphoneSimple";
import { NotebookIcon } from "@phosphor-icons/react/dist/csr/Notebook";
import { NotePencilIcon } from "@phosphor-icons/react/dist/csr/NotePencil";
import { PackageIcon } from "@phosphor-icons/react/dist/csr/Package";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { PaperclipIcon } from "@phosphor-icons/react/dist/csr/Paperclip";
import { PathIcon } from "@phosphor-icons/react/dist/csr/Path";
import { PauseCircleIcon } from "@phosphor-icons/react/dist/csr/PauseCircle";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PlugIcon } from "@phosphor-icons/react/dist/csr/Plug";
import { PlugsConnectedIcon } from "@phosphor-icons/react/dist/csr/PlugsConnected";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { PresentationChartIcon } from "@phosphor-icons/react/dist/csr/PresentationChart";
import { ProhibitIcon } from "@phosphor-icons/react/dist/csr/Prohibit";
import { PulseIcon } from "@phosphor-icons/react/dist/csr/Pulse";
import { RankingIcon } from "@phosphor-icons/react/dist/csr/Ranking";
import { RocketLaunchIcon } from "@phosphor-icons/react/dist/csr/RocketLaunch";
import { RowsIcon } from "@phosphor-icons/react/dist/csr/Rows";
import { ScrollIcon } from "@phosphor-icons/react/dist/csr/Scroll";
import { SealCheckIcon } from "@phosphor-icons/react/dist/csr/SealCheck";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { ShieldStarIcon } from "@phosphor-icons/react/dist/csr/ShieldStar";
import { ShieldWarningIcon } from "@phosphor-icons/react/dist/csr/ShieldWarning";
import { ShoppingBagOpenIcon } from "@phosphor-icons/react/dist/csr/ShoppingBagOpen";
import { ShoppingCartSimpleIcon } from "@phosphor-icons/react/dist/csr/ShoppingCartSimple";
import { SignpostIcon } from "@phosphor-icons/react/dist/csr/Signpost";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { StampIcon } from "@phosphor-icons/react/dist/csr/Stamp";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { StepsIcon } from "@phosphor-icons/react/dist/csr/Steps";
import { StorefrontIcon } from "@phosphor-icons/react/dist/csr/Storefront";
import { SwatchesIcon } from "@phosphor-icons/react/dist/csr/Swatches";
import { TagIcon } from "@phosphor-icons/react/dist/csr/Tag";
import { TargetIcon } from "@phosphor-icons/react/dist/csr/Target";
import { TextAaIcon } from "@phosphor-icons/react/dist/csr/TextAa";
import { TextAlignLeftIcon } from "@phosphor-icons/react/dist/csr/TextAlignLeft";
import { TextTIcon } from "@phosphor-icons/react/dist/csr/TextT";
import { TimerIcon } from "@phosphor-icons/react/dist/csr/Timer";
import { ToggleRightIcon } from "@phosphor-icons/react/dist/csr/ToggleRight";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { TreeStructureIcon } from "@phosphor-icons/react/dist/csr/TreeStructure";
import { TrendUpIcon } from "@phosphor-icons/react/dist/csr/TrendUp";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UserCheckIcon } from "@phosphor-icons/react/dist/csr/UserCheck";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { UserGearIcon } from "@phosphor-icons/react/dist/csr/UserGear";
import { UserSwitchIcon } from "@phosphor-icons/react/dist/csr/UserSwitch";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { WalletIcon } from "@phosphor-icons/react/dist/csr/Wallet";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { WrenchIcon } from "@phosphor-icons/react/dist/csr/Wrench";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

export {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  ArrowUUpLeftIcon,
  ArrowsClockwiseIcon,
  ArrowsDownUpIcon,
  ArrowsSplitIcon,
  BarcodeIcon,
  BellRingingIcon,
  BinocularsIcon,
  BooksIcon,
  BriefcaseIcon,
  BroadcastIcon,
  BrowserIcon,
  CalendarBlankIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CalendarStarIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartBarIcon,
  ChatCircleTextIcon,
  ChatsCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleDashedIcon,
  ClipboardTextIcon,
  ClockClockwiseIcon,
  ClockCountdownIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  CoinsIcon,
  CopyIcon,
  CreditCardIcon,
  CrownIcon,
  CubeIcon,
  DatabaseIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  ExportIcon,
  EyeIcon,
  EyeSlashIcon,
  FileArrowDownIcon,
  FileLockIcon,
  FileTextIcon,
  FingerprintIcon,
  FlagIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  FrameCornersIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  GaugeIcon,
  GavelIcon,
  GearSixIcon,
  HandCoinsIcon,
  HandshakeIcon,
  HardDrivesIcon,
  HashIcon,
  HeadsetIcon,
  HourglassMediumIcon,
  IdentificationBadgeIcon,
  ImageSquareIcon,
  InfoIcon,
  KanbanIcon,
  LayoutIcon,
  LifebuoyIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListIcon,
  ListPlusIcon,
  LockKeyIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  MedalIcon,
  MegaphoneIcon,
  MegaphoneSimpleIcon,
  NotebookIcon,
  NotePencilIcon,
  PackageIcon,
  PaperPlaneTiltIcon,
  PaperclipIcon,
  PathIcon,
  PauseCircleIcon,
  PencilSimpleIcon,
  PlugIcon,
  PlugsConnectedIcon,
  PlusIcon,
  PresentationChartIcon,
  ProhibitIcon,
  PulseIcon,
  RankingIcon,
  RocketLaunchIcon,
  RowsIcon,
  ScrollIcon,
  SealCheckIcon,
  ShareNetworkIcon,
  ShieldCheckIcon,
  ShieldStarIcon,
  ShieldWarningIcon,
  ShoppingBagOpenIcon,
  ShoppingCartSimpleIcon,
  SignpostIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StackIcon,
  StampIcon,
  StarIcon,
  StepsIcon,
  StorefrontIcon,
  SwatchesIcon,
  TagIcon,
  TargetIcon,
  TextAaIcon,
  TextAlignLeftIcon,
  TextTIcon,
  TimerIcon,
  ToggleRightIcon,
  TrashIcon,
  TreeStructureIcon,
  TrendUpIcon,
  UploadSimpleIcon,
  UserCheckIcon,
  UserCircleIcon,
  UserGearIcon,
  UserSwitchIcon,
  VideoCameraIcon,
  WalletIcon,
  WarningCircleIcon,
  WarningIcon,
  WrenchIcon,
  XIcon,
};

export const SX_ICON_DEFAULTS = { color: "currentColor", size: 18, weight: "duotone", mirrored: false } as const;

export function SxIconScope({ children }: { children: ReactNode }): ReactElement {
  return createElement(IconContext.Provider, { value: SX_ICON_DEFAULTS }, children);
}

export function glyph(icon: SxIcon, props?: IconProps): ReactElement {
  return createElement(icon, { "aria-hidden": true, ...props });
}

export function moreGlyph(props?: IconProps): ReactElement {
  return glyph(DotsThreeIcon, { weight: "bold", ...props });
}

export const FALLBACK_ICON: SxIcon = StackIcon;

export const NAV_ICON: Readonly<Record<SxSection, SxIcon>> = {
  home: SquaresFourIcon,
  approvals: SealCheckIcon,
  monitoring: PulseIcon,
  settings: GearSixIcon,
};

export const STATUS_ICON: Readonly<Record<SxStatusKey, SxIcon>> = {
  draft: NotePencilIcon,
  submitted: PaperPlaneTiltIcon,
  in_review: HourglassMediumIcon,
  approved: CheckCircleIcon,
  scheduled: CalendarCheckIcon,
  published: BroadcastIcon,
  active: BroadcastIcon,
  returned: ArrowUUpLeftIcon,
  rejected: ProhibitIcon,
  archived: ArchiveIcon,
  inactive: PauseCircleIcon,
  paused: PauseCircleIcon,
  deleted: TrashIcon,
  expired: ClockCountdownIcon,
  failed: WarningCircleIcon,
  unknown: CircleDashedIcon,
};

export const FIELD_TYPE_ICON: Readonly<Record<string, SxIcon>> = {
  text: TextTIcon,
  textarea: TextAlignLeftIcon,
  richtext: TextAaIcon,
  number: HashIcon,
  money: CoinsIcon,
  boolean: ToggleRightIcon,
  date: CalendarBlankIcon,
  datetime: CalendarDotsIcon,
  select: ListBulletsIcon,
  multiselect: ListChecksIcon,
  list: RowsIcon,
  object: SlidersHorizontalIcon,
  url: LinkSimpleIcon,
  email: EnvelopeSimpleIcon,
  code: CodeIcon,
  file: PaperclipIcon,
};

export const SOURCE_ICON: Readonly<Record<string, SxIcon>> = {
  "service-categories": FolderOpenIcon,
  services: BriefcaseIcon,
  "document-templates": FileTextIcon,
  "service-packages": PackageIcon,
  "consent-documents": ScrollIcon,
  "promotion-packages": MegaphoneSimpleIcon,
  "promotion-placements": FrameCornersIcon,
  roles: UserGearIcon,
  "subscription-plans": CrownIcon,
  "studio-constructors": StackIcon,
  users: UserCircleIcon,
  "studio-objects": StackIcon,
  "organization-units": TreeStructureIcon,
  permissions: LockKeyIcon,
  "client-guarantees": ShieldStarIcon,
  "local:service-packages": PackageIcon,
  "local:consent-documents": ScrollIcon,
  "local:studio-objects": StackIcon,
};

export const PLACEMENT_ICON: Readonly<Record<string, SxIcon>> = {
  banner: ImageSquareIcon,
  profile_boost: UserCircleIcon,
  service_boost: BriefcaseIcon,
};

export const GROUP_ICON: Readonly<Record<string, SxIcon>> = {
  services_packages: StorefrontIcon,
  documents_texts: NotebookIcon,
  process_quality: StepsIcon,
  communications: ChatsCircleIcon,
  finance_tariffs: WalletIcon,
  security_access: ShieldCheckIcon,
  operations: WrenchIcon,
  integrations: PlugsConnectedIcon,
  system_reference: DatabaseIcon,
  advertising: MegaphoneIcon,
};

export const CTOR_ICON: Readonly<Record<string, SxIcon>> = {
  K01: FolderOpenIcon,
  K34: TrendUpIcon,
  K31: GavelIcon,
  K32: ShieldStarIcon,
  K33: LayoutIcon,
  K02: BriefcaseIcon,
  K29: ListPlusIcon,
  "K03-M": PackageIcon,
  K30: SignpostIcon,
  K07: ScrollIcon,
  K06: FileTextIcon,
  K05: ClipboardTextIcon,
  K26: FileArrowDownIcon,
  K11: HandshakeIcon,
  K08: KanbanIcon,
  K10: TimerIcon,
  K09: ListChecksIcon,
  K13: MedalIcon,
  "K12-M": UserSwitchIcon,
  MP05: ShoppingCartSimpleIcon,
  K27: BellRingingIcon,
  K14: EnvelopeSimpleIcon,
  CALL01: VideoCameraIcon,
  K22: HeadsetIcon,
  MP08: FlagIcon,
  K17: CrownIcon,
  K04: TagIcon,
  K18: CreditCardIcon,
  K25: HandCoinsIcon,
  MP02: GaugeIcon,
  MP03: ShoppingBagOpenIcon,
  MP07: StarIcon,
  SEC01: UserGearIcon,
  SEC02: EyeSlashIcon,
  SEC03: ShieldWarningIcon,
  SEC04: FingerprintIcon,
  SEC05: FileLockIcon,
  K20: PathIcon,
  K21: LockKeyIcon,
  MP06: IdentificationBadgeIcon,
  OPS01: ToggleRightIcon,
  OPS02: ClockClockwiseIcon,
  OPS03: CalendarBlankIcon,
  OPS04: HardDrivesIcon,
  OPS05: ExportIcon,
  OPS06: ChartBarIcon,
  ORG01: TreeStructureIcon,
  K23: LifebuoyIcon,
  K24: FunnelSimpleIcon,
  MP01: UserCheckIcon,
  MP10: CalendarCheckIcon,
  K28: RankingIcon,
  K19: BrowserIcon,
  INT01: PlugIcon,
  INT02: ShareNetworkIcon,
  INT03: ArrowsSplitIcon,
  CORE: CubeIcon,
  K16: BooksIcon,
  OPS07: BarcodeIcon,
  OPS08: SwatchesIcon,
  SEARCH01: BinocularsIcon,
  M1: TargetIcon,
  M2: StampIcon,
  M3: PresentationChartIcon,
  MP04: FrameCornersIcon,
  "K12-PROMO": MegaphoneSimpleIcon,
  MP09: CalendarStarIcon,
};

const has = Object.prototype.hasOwnProperty;

function pick(map: Readonly<Record<string, SxIcon>>, key: string | undefined): SxIcon | undefined {
  return key && has.call(map, key) ? map[key] : undefined;
}

export function ctorIcon(code: string, group?: string): SxIcon {
  const c = String(code ?? "").trim();
  return pick(CTOR_ICON, c) ?? pick(CTOR_ICON, c.toUpperCase()) ?? pick(GROUP_ICON, group) ?? FALLBACK_ICON;
}

export function ctorGlyph(code: string, group?: string, props?: IconProps): ReactElement {
  return glyph(ctorIcon(code, group), props);
}

export function sourceIcon(source: string): SxIcon {
  return pick(SOURCE_ICON, studioReferenceKey(String(source ?? "")).key) ?? MagnifyingGlassIcon;
}
