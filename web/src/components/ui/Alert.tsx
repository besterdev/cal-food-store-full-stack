import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Alert = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "border-destructive/30 bg-destructive-surface text-foreground rounded-[var(--radius-md)] border p-4",
      className,
    )}
    {...props}
  />
);
