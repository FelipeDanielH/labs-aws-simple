"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const SCENE_URL =
  "https://my.spline.design/cutecomputerfollowcursor-t2nYvcrFzPfaJWM45QnLl5ka/scene.splinecode";

function SceneLoading({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center bg-card/70 backdrop-blur-sm"
      role="status"
    >
      <div className="flex items-center gap-3 rounded-full border bg-background/80 px-4 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        <span>{label}</span>
      </div>
    </div>
  );
}

const Spline = dynamic(
  () =>
    import("@splinetool/react-spline").then(
      (splineModule) => splineModule.default,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

export function SplineHeroScene({
  label,
  loadingLabel,
}: {
  label: string;
  loadingLabel: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="spline-hero-scene relative h-full min-h-0 w-full overflow-hidden">
      <span className="sr-only">{label}</span>
      {isLoaded ? null : <SceneLoading label={loadingLabel} />}
      <Spline
        aria-hidden="true"
        onLoad={() => setIsLoaded(true)}
        scene={SCENE_URL}
      />
    </div>
  );
}
