"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import type { Application } from "@splinetool/runtime";

import { HOME_SPLINE_SCENE_URL } from "@/features/home/config/spline-scene";

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
  onReady,
}: {
  label: string;
  onReady: () => void;
}) {
  const appRef = useRef<Application | null>(null);
  const didLoadRef = useRef(false);

  const handleLoad = useCallback(
    (app: Application) => {
      appRef.current = app;
      app.setGlobalEvents(true);

      if (!didLoadRef.current) {
        didLoadRef.current = true;
        onReady();
      }
    },
    [onReady],
  );

  useEffect(
    () => () => {
      appRef.current?.setGlobalEvents(false);
      appRef.current = null;
    },
    [],
  );

  return (
    <div className="spline-hero-scene relative h-full min-h-0 w-full overflow-hidden">
      <span className="sr-only">{label}</span>
      <Spline
        aria-hidden="true"
        onLoad={handleLoad}
        scene={HOME_SPLINE_SCENE_URL}
      />
    </div>
  );
}
