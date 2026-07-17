"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
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

class SplineSceneErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export function SplineHeroScene({
  label,
  onReady,
}: {
  label: string;
  onReady: () => void;
}) {
  const appRef = useRef<Application | null>(null);
  const didLoadRef = useRef(false);

  const markReady = useCallback(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    onReady();
  }, [onReady]);

  const handleLoad = useCallback(
    (app: Application) => {
      appRef.current = app;
      app.setGlobalEvents(true);
      markReady();
    },
    [markReady],
  );

  useEffect(
    () => () => {
      appRef.current?.setGlobalEvents(false);
      appRef.current = null;
    },
    [],
  );

  return (
    <div className="spline-hero-scene relative h-full min-h-0 w-full overflow-hidden bg-[#0d0f0e]">
      <div className="h-full w-full transform-gpu lg:translate-x-[18vw]">
        <span className="sr-only">{label}</span>
        <SplineSceneErrorBoundary onError={markReady}>
          <Spline
            aria-hidden="true"
            onLoad={handleLoad}
            scene={HOME_SPLINE_SCENE_URL}
          />
        </SplineSceneErrorBoundary>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-[42vw] bg-gradient-to-r from-[#0d0f0e] via-[#0d0f0e]/75 to-transparent lg:block"
      />
    </div>
  );
}
