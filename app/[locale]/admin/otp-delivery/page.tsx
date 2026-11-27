import OtpRoutingPage from "@/components/admin/otpRouting/OtpRoutingPage";
import AdminTabs from "@/components/admin/AdminTabs";

// Superadmin: the OTP delivery channel of every account
// (LEXGO_FRONTEND_CENTRAL_OTP_DELIVERY_MANAGEMENT_2026_11_09.md).
export default function Page() {
  return (
    <>
      <AdminTabs set="audit" />
      <OtpRoutingPage />
    </>
  );
}
