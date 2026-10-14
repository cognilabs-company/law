import NotificationsPanel from "@/components/portal/NotificationsPanel";

// Every notification of the account, with the portal's filters and actions;
// reads go through the internal routes.
export default function Page() {
  return <NotificationsPanel internal />;
}
