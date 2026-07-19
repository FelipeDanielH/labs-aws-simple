import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminLoginForm } from "@/features/admin/ui/admin-login-form";
import { hasAdminSession } from "@/features/content-management/server/admin-session";

export const metadata = { title: "Ingreso administrativo | AWS Labs" };

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AdminLoginFallback />}>
      <AdminLoginContent />
    </Suspense>
  );
}

async function AdminLoginContent() {
  await connection();
  if (await hasAdminSession()) redirect("/admin");
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
      <AdminLoginForm />
    </main>
  );
}

function AdminLoginFallback() {
  return <main aria-busy="true" className="min-h-[calc(100vh-4rem)]" />;
}
