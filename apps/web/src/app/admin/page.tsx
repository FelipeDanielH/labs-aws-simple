import type { Metadata } from "next";

import { AdminContent } from "@/features/admin/ui/admin-content";

export const metadata: Metadata = {
  title: "Administración | AWS Labs",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return <AdminContent />;
}
