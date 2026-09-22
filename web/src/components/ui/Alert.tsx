import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type AlertTone = "danger" | "warning";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

const toneClasses: Record<AlertTone, string> = {
  danger: "border-destructive/30 bg-destructive-surface",
  warning: "border-warning-border bg-warning-surface",
};

export const Alert = ({ className, tone = "danger", ...props }: AlertProps) => (
  <div
    className={cn(
      "text-foreground rounded-[var(--radius-md)] border p-4",
      toneClasses[tone],
      className,
    )}
    {...props}
  />
);
