"use client";

import type { ComponentProps } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@workspace/ui/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 8,
  children,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      >
        {children}
        <PopoverPrimitive.Arrow className="fill-border" />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
