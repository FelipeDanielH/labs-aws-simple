import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/features/admin/ui/admin-login-form";
import { hasAdminSession } from "@/features/content-management/server/admin-session";

export const metadata = { title: "Ingreso administrativo | AWS Labs" };

export default async function AdminLoginPage() {
  if (await hasAdminSession()) redirect("/admin");
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
      <AdminLoginForm />
    </main>
  );
}
