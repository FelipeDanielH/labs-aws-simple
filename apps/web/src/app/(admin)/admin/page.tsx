import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminContent } from "@/features/admin/ui/admin-content";
import { hasAdminSession } from "@/features/content-management/server/admin-session";

export const metadata: Metadata = {
  title: "Administración | AWS Labs",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <Suspense fallback={<main aria-busy="true" className="min-h-screen" />}>
      <AuthenticatedAdmin />
    </Suspense>
  );
}

async function AuthenticatedAdmin() {
  await connection();
  if (!(await hasAdminSession())) redirect("/admin/login");
  return <AdminContent />;
}
