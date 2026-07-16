"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import type { Application, SPEObject } from "@splinetool/runtime";

import {
  HOME_SPLINE_COMPUTER_ID,
  HOME_SPLINE_DESKTOP_COMPUTER_X_OFFSET,
  HOME_SPLINE_SCENE_URL,
} from "@/features/home/config/spline-scene";

const DESKTOP_MEDIA_QUERY = "(min-width: 64rem)";

type SceneObjectState = {
  object: SPEObject;
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
  const computerStateRef = useRef<SceneObjectState | null>(null);
  const computerFrameRef = useRef<number | null>(null);
  const didLoadRef = useRef(false);

  const positionComputer = useCallback((isDesktop: boolean) => {
    const computerState = computerStateRef.current;

    if (!computerState) {
      return;
    }

    computerState.object.position.x =
      computerState.initialX +
      (isDesktop ? HOME_SPLINE_DESKTOP_COMPUTER_X_OFFSET : 0);
    appRef.current?.requestRender();
  }, []);

  const positionComputerAfterSceneRender = useCallback(
    (isDesktop: boolean) => {
      if (computerFrameRef.current !== null) {
        window.cancelAnimationFrame(computerFrameRef.current);
      }

      computerFrameRef.current = window.requestAnimationFrame(() => {
        computerFrameRef.current = window.requestAnimationFrame(() => {
          computerFrameRef.current = null;
          positionComputer(isDesktop);
        });
      });
    },
    [positionComputer],
  );

  const handleLoad = useCallback(
    (app: Application) => {
      appRef.current = app;
      app.setGlobalEvents(true);

      const computer = app.findObjectById(HOME_SPLINE_COMPUTER_ID);

      if (computer) {
        computerStateRef.current = {
          object: computer,
          initialX: computer.position.x,
        };
        positionComputerAfterSceneRender(
          window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
        );
      }

      if (!didLoadRef.current) {
        didLoadRef.current = true;
        onReady();
      }
    },
    [onReady, positionComputerAfterSceneRender],
  );

  useEffect(() => {
    const desktopMedia = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleBreakpointChange = () => positionComputer(desktopMedia.matches);

    desktopMedia.addEventListener("change", handleBreakpointChange);

    return () => {
      desktopMedia.removeEventListener("change", handleBreakpointChange);

      if (computerFrameRef.current !== null) {
        window.cancelAnimationFrame(computerFrameRef.current);
        computerFrameRef.current = null;
      }

      const computerState = computerStateRef.current;

      if (computerState) {
        computerState.object.position.x = computerState.initialX;
        appRef.current?.requestRender();
      }

      appRef.current?.setGlobalEvents(false);
      computerStateRef.current = null;
      appRef.current = null;
    };
  }, [positionComputer]);

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
