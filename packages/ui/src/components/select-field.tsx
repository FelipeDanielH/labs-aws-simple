import { ChevronDown } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  id: string;
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

export function SelectField({
  id,
  label,
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
  className,
}: SelectFieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label
        htmlFor={id}
        className={compact ? "text-xs font-medium" : "text-sm font-medium"}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={cn(
            "w-full appearance-none border bg-background px-3 pr-9 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60",
            compact ? "h-9 rounded-md" : "h-10 rounded-lg",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}
