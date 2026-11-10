// The duty lawyer's desk (call_center_lawyer, role profile navbatchi_yurist):
// its Hozir is the urgent work assigned to it, not the operator queues
// (LEXGO_CALLCENTER_URGENT_WORK_ACCESS_2026_11_03).
export function isDutyDesk(roles: readonly string[], roleProfile = ""): boolean {
  return roleProfile === "navbatchi_yurist" || (roles.includes("call_center_lawyer") && !["superadmin", "admin", "manager"].some((r) => roles.includes(r)));
}
