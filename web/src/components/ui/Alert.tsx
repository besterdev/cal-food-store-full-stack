import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type AlertTone = "danger" | "warning";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

const toneClasses: Record<AlertTone, string> = {
  danger: "border-destructive/30 bg-destructive-surface",
  warning: "border-warning-border bg-warning-surface",
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone = "danger", ...props }, ref) => (
    <div
      className={cn(
        "text-foreground rounded-[var(--radius-md)] border p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        toneClasses[tone],
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

Alert.displayName = "Alert";
