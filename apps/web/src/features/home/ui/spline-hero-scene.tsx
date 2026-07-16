"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import type { Application, SPEObject } from "@splinetool/runtime";

import {
  HOME_SPLINE_CAMERA_ID,
  HOME_SPLINE_DESKTOP_CAMERA_X_OFFSET,
  HOME_SPLINE_SCENE_URL,
} from "@/features/home/config/spline-scene";

const DESKTOP_MEDIA_QUERY = "(min-width: 64rem)";

type CameraState = {
  camera: SPEObject;
  initialX: number;
};

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
  const cameraStateRef = useRef<CameraState | null>(null);
  const didLoadRef = useRef(false);

  const positionCamera = useCallback((isDesktop: boolean) => {
    const cameraState = cameraStateRef.current;

    if (!cameraState) {
      return;
    }

    cameraState.camera.position.x =
      cameraState.initialX +
      (isDesktop ? HOME_SPLINE_DESKTOP_CAMERA_X_OFFSET : 0);
    appRef.current?.requestRender();
  }, []);

  const handleLoad = useCallback(
    (app: Application) => {
      appRef.current = app;
      app.setGlobalEvents(true);

      const camera = app.findObjectById(HOME_SPLINE_CAMERA_ID);

      if (camera) {
        cameraStateRef.current = {
          camera,
          initialX: camera.position.x,
        };
        positionCamera(window.matchMedia(DESKTOP_MEDIA_QUERY).matches);
      }

      if (!didLoadRef.current) {
        didLoadRef.current = true;
        onReady();
      }
    },
    [onReady, positionCamera],
  );

  useEffect(() => {
    const desktopMedia = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleBreakpointChange = () => positionCamera(desktopMedia.matches);

    desktopMedia.addEventListener("change", handleBreakpointChange);

    return () => {
      desktopMedia.removeEventListener("change", handleBreakpointChange);

      const cameraState = cameraStateRef.current;

      if (cameraState) {
        cameraState.camera.position.x = cameraState.initialX;
        appRef.current?.requestRender();
      }

      appRef.current?.setGlobalEvents(false);
      cameraStateRef.current = null;
      appRef.current = null;
    };
  }, [positionCamera]);

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
