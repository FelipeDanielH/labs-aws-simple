import { redirect } from "next/navigation";
import { Suspense } from "react";

type Props = { params: Promise<{ slug: string }> };

export default function LegacyLaboratoryPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <LegacyLaboratoryRedirect params={params} />
    </Suspense>
  );
}

async function LegacyLaboratoryRedirect({ params }: Props) {
  const { slug } = await params;
  return redirect(`/es/laboratorios/${slug}`);
}
