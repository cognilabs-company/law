import { setRequestLocale } from "next-intl/server";
import SecureChat from "@/components/chat/SecureChat";

type Props = {
  params: Promise<{ locale: string; roomId: string }>;
  // ?ua= is set only by the call-centre board, whose users are the ones the
  // backend lets end a panel chat; everyone else gets the room without it.
  searchParams: Promise<{ ua?: string; wid?: string; svc?: string }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { locale, roomId } = await params;
  const { ua, wid, svc } = await searchParams;
  setRequestLocale(locale);
  return <SecureChat roomId={roomId} urgentRecordId={ua} workId={wid} serviceTitle={svc} />;
}
