import DocumentSettingsPage from "@/components/admin/docsettings/DocumentSettingsPage";
import AdminTabs from "@/components/admin/AdminTabs";

export default function Page() {
  return (
    <>
      <AdminTabs set="documents" />
      <DocumentSettingsPage />
    </>
  );
}
