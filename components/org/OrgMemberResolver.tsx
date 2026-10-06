"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { listOrgMembers, listOrganizations } from "@/lib/services/backend";
import { IconUsers } from "@/components/icons";

const activeMember = (status: string) => !status || status.toLowerCase() === "active";

async function findOrg(me: string, memberId: string): Promise<string> {
  const orgs = (await listOrganizations()).filter((o) => o.ownerUserId === me);
  const hits = await Promise.all(
    orgs.map((o) =>
      listOrgMembers(o.id)
        .then((members) => (members.some((m) => m.userId === memberId && activeMember(m.status)) ? o.id : ""))
        .catch(() => ""),
    ),
  );
  return hits.find(Boolean) ?? "";
}

export default function OrgMemberResolver({ memberId }: { memberId: string }) {
  const t = useTranslations("orgOwner");
  const tl = useTranslations("secureChat");
  const { session, ready } = useAuth();
  const router = useRouter();
  const me = session?.id ?? "";
  const role = session?.role ?? "";
  const owner = role === "advocate";
  const [missing, setMissing] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (memberId === me && (role === "advocate" || role === "lawyer")) {
      router.replace(`/portal/${role}/services`);
      return;
    }
    if (!owner) return;
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
  }, [ready, me, role, owner, memberId, router]);

  const self = memberId === me && (role === "advocate" || role === "lawyer");
  if (!ready || !me || self || (owner && missing !== memberId)) {
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
      <Link href={owner ? "/portal/advocate/organization" : `/portal/${role}`} className="btn btn--line btn--sm">
        {owner ? t("allOrgs") : t("backDashboard")}
      </Link>
    </div>
  );
}
