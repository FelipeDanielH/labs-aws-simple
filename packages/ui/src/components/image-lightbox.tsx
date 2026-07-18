"use client";

import type { ComponentPropsWithoutRef } from "react";
import { X, ZoomIn } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@workspace/ui/lib/utils";

export type ImageLightboxProps = ComponentPropsWithoutRef<"img"> & {
  triggerClassName?: string;
};

export function ImageLightbox({
  alt = "",
  className,
  triggerClassName,
  ...props
}: ImageLightboxProps) {
  const imageName = alt.trim() || "Imagen";

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group relative my-5 block max-w-full cursor-zoom-in rounded-xl text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            triggerClassName,
          )}
          aria-label={`Ampliar imagen: ${imageName}`}
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
            "fixed top-1/2 left-1/2 z-[101] -translate-x-1/2 -translate-y-1/2",
            "max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] outline-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Vista ampliada: {imageName}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Pulsa Escape, el botón cerrar o fuera de la imagen para volver al
            contenido.
          </DialogPrimitive.Description>

          {/* Keep the original image URL and resolution in the enlarged view. */}
          <img
            {...props}
            alt={alt}
            loading="eager"
            className="block max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl"
          />

          <DialogPrimitive.Close
            className={cn(
              "fixed top-4 right-4 grid size-11 cursor-pointer place-items-center rounded-full",
              "border border-white/50 bg-black/70 text-white shadow-lg transition-colors hover:bg-black",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            )}
            aria-label="Cerrar imagen ampliada"
          >
            <X className="size-7" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
