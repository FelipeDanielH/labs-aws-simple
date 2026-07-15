import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminContent } from "@/features/admin/ui/admin-content";
import { hasAdminSession } from "@/features/content-management/server/admin-session";

export const metadata: Metadata = {
  title: "Administración | AWS Labs",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <AdminContent />;
}
