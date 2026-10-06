"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { listOrgMembers, listOrganizations } from "@/lib/services/backend";
import { IconUsers } from "@/components/icons";

async function findOrg(me: string, memberId: string): Promise<string> {
  const orgs = (await listOrganizations()).filter((o) => o.ownerUserId === me);
  for (const o of orgs) {
    const members = await listOrgMembers(o.id).catch(() => []);
    if (members.some((m) => m.userId === memberId)) return o.id;
  }
  return "";
}

export default function OrgMemberResolver({ memberId }: { memberId: string }) {
  const t = useTranslations("orgOwner");
  const tl = useTranslations("secureChat");
  const { session } = useAuth();
  const router = useRouter();
  const me = session?.id ?? "";
  const [missing, setMissing] = useState("");

  useEffect(() => {
    if (!me) return;
    let alive = true;
    findOrg(me, memberId)
      .then((orgId) => {
        if (!alive) return;
        if (orgId) router.replace(`/portal/advocate/organization/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}/services`);
        else setMissing(memberId);
      })
      .catch(() => {
        if (alive) setMissing(memberId);
      });
    return () => {
      alive = false;
    };
  }, [me, memberId, router]);

  if (missing !== memberId) {
    return (
      <div className="portal portal--redirect" aria-busy="true">
        <span className="rf__spinner" />
        <span className="advmuted">{tl("loading")}</span>
      </div>
    );
  }
  return (
    <div className="supsoon">
      <span className="supsoon__ic">
        <IconUsers />
      </span>
      <b>{t("member.notFoundTitle")}</b>
      <p>{t("member.notFoundText")}</p>
      <Link href="/portal/advocate/organization" className="btn btn--line btn--sm">
        {t("allOrgs")}
      </Link>
    </div>
  );
}
