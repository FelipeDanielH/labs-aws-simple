"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const KEYBOARD_SOUND_PATH = "/assets/keyboard_stroke.mp3";
const MOUSE_SOUND_PATH = "/assets/mouse_click.mp3";
const KEYBOARD_POOL_SIZE = 6;
const MOUSE_POOL_SIZE = 3;
const KEYBOARD_VOLUME = 0.2;
const MOUSE_VOLUME = 0.24;
const SOUND_KEYS = new Set(["Backspace", "Delete", "Enter", "Tab"]);

type AudioPool = {
  items: HTMLAudioElement[];
  nextIndex: number;
};

function createAudioPool(
  source: string,
  size: number,
  volume: number,
): AudioPool {
  return {
    items: Array.from({ length: size }, () => {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.volume = volume;
      return audio;
    }),
    nextIndex: 0,
  };
}

function playNext(pool: AudioPool) {
  const audio = pool.items[pool.nextIndex];
  pool.nextIndex = (pool.nextIndex + 1) % pool.items.length;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Browsers can reject playback before the first user gesture.
  });
}

function isTypingKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
    return false;
  }

  return event.key.length === 1 || SOUND_KEYS.has(event.key);
}

export function InterfaceAudioFeedback() {
  const pathname = usePathname();
  const isHomePageRef = useRef(pathname === "/");

  useEffect(() => {
    isHomePageRef.current = pathname === "/";
  }, [pathname]);

  useEffect(() => {
    const keyboardPool = createAudioPool(
      KEYBOARD_SOUND_PATH,
      KEYBOARD_POOL_SIZE,
      KEYBOARD_VOLUME,
    );
    const mousePool = createAudioPool(
      MOUSE_SOUND_PATH,
      MOUSE_POOL_SIZE,
      MOUSE_VOLUME,
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      // The Spline scene already owns this sound on the home page.
      if (!isHomePageRef.current && isTypingKey(event)) {
        playNext(keyboardPool);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.isPrimary && event.button === 0 && event.pointerType === "mouse") {
        playNext(mousePool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);

      for (const audio of [...keyboardPool.items, ...mousePool.items]) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    };
  }, []);

  return null;
}
