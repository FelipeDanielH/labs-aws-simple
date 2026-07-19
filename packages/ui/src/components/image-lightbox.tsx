"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { X, ZoomIn } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@workspace/ui/lib/utils";

export type ImageLightboxLabels = {
  imageFallback: string;
  expand: string;
  dialogTitle: string;
  dialogDescription: string;
  close: string;
  zoomIn: string;
  zoomOut: string;
  zoomHint: string;
  zoomActiveHint: string;
};

export type ImageLightboxProps = ComponentPropsWithoutRef<"img"> & {
  triggerClassName?: string;
  labels?: ImageLightboxLabels;
};

const defaultLabels: ImageLightboxLabels = {
  imageFallback: "Imagen",
  expand: "Ampliar imagen",
  dialogTitle: "Vista ampliada",
  dialogDescription:
    "Pulsa Escape, el botón cerrar o fuera de la imagen para volver al contenido.",
  close: "Cerrar imagen ampliada",
  zoomIn: "Activar zoom",
  zoomOut: "Desactivar zoom",
  zoomHint: "Haz clic para ampliar",
  zoomActiveHint: "Mueve el cursor · clic para reducir",
};

export function ImageLightbox({
  alt = "",
  className,
  triggerClassName,
  labels = defaultLabels,
  ...props
}: ImageLightboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const viewportRef = useRef<HTMLButtonElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingOriginRef = useRef({ x: 50, y: 50 });
  const imageName = alt.trim() || labels.imageFallback;
  const {
    width: _importedWidth,
    height: _importedHeight,
    ...lightboxImageProps
  } = props;

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  const writePendingOrigin = () => {
    animationFrameRef.current = null;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.style.setProperty(
      "--image-zoom-x",
      `${pendingOriginRef.current.x}%`,
    );
    viewport.style.setProperty(
      "--image-zoom-y",
      `${pendingOriginRef.current.y}%`,
    );
  };

  const scheduleOriginUpdate = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    pendingOriginRef.current = {
      x: clamp(((clientX - bounds.left) / bounds.width) * 100),
      y: clamp(((clientY - bounds.top) / bounds.height) * 100),
    };

    if (animationFrameRef.current === null) {
      animationFrameRef.current =
        window.requestAnimationFrame(writePendingOrigin);
    }
  };

  const resetZoom = () => {
    setIsZoomed(false);
    pendingOriginRef.current = { x: 50, y: 50 };
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const viewport = viewportRef.current;
    viewport?.style.setProperty("--image-zoom-x", "50%");
    viewport?.style.setProperty("--image-zoom-y", "50%");
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) resetZoom();
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isZoomed || event.pointerType !== "mouse") return;
    scheduleOriginUpdate(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return;
    if (!isZoomed) scheduleOriginUpdate(event.clientX, event.clientY);
    setIsZoomed((current) => !current);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setIsZoomed((current) => !current);
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group relative my-5 block max-w-full cursor-zoom-in rounded-xl text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            triggerClassName,
          )}
          aria-label={`${labels.expand}: ${imageName}`}
        >
          {/* Content images do not always provide intrinsic dimensions. */}
          <img
            {...props}
            alt={alt}
            className={cn(
              "max-h-[36rem] max-w-full rounded-xl border object-contain",
              className,
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-3 bottom-3 grid size-9 place-items-center rounded-full",
              "bg-black/70 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          >
            <ZoomIn className="size-5" />
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            "pointer-events-none fixed inset-0 z-[101] grid grid-rows-[4.5rem_minmax(0,1fr)]",
            "outline-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {labels.dialogTitle}: {imageName}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {labels.dialogDescription}
          </DialogPrimitive.Description>

          <div className="pointer-events-none row-start-2 flex min-h-0 min-w-0 items-center justify-center px-4 pb-4">
            <button
              ref={viewportRef}
              type="button"
              className={cn(
                "pointer-events-auto relative block max-h-full max-w-full overflow-hidden rounded-lg bg-transparent p-0",
                "shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              )}
              aria-label={isZoomed ? labels.zoomOut : labels.zoomIn}
              aria-pressed={isZoomed}
              data-native-cursor={isZoomed ? "zoom-out" : "zoom-in"}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onKeyDown={handleKeyDown}
            >
              {/* Keep the original image URL and resolution in the enlarged view. */}
              <img
                {...lightboxImageProps}
                alt={alt}
                loading="eager"
                draggable={false}
                className={cn(
                  "pointer-events-none block h-auto w-auto max-h-[calc(100dvh-5.5rem)] max-w-full rounded-lg object-contain",
                  "transform-gpu will-change-transform motion-safe:transition-transform motion-safe:duration-150",
                  isZoomed && "scale-[2]",
                )}
                style={{
                  transformOrigin:
                    "var(--image-zoom-x, 50%) var(--image-zoom-y, 50%)",
                }}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full",
                  "bg-black/75 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg backdrop-blur-sm",
                  "[@media(pointer:fine)]:flex",
                )}
              >
                <ZoomIn className="size-3.5" />
                {isZoomed ? labels.zoomActiveHint : labels.zoomHint}
              </span>
            </button>
          </div>

          <DialogPrimitive.Close
            className={cn(
              "pointer-events-auto absolute top-4 right-4 grid size-11 cursor-pointer place-items-center rounded-full",
              "border border-white/50 bg-black/70 text-white shadow-lg transition-colors hover:bg-black",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            )}
            aria-label={labels.close}
          >
            <X className="size-7" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}
