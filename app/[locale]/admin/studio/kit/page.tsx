import { notFound } from "next/navigation";
import { KitPreview } from "@/components/admin/studio/sx/KitPreview";

export default function AdminStudioKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitPreview />;
}
