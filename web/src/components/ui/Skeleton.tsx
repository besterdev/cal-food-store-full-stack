import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Skeleton = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "bg-muted animate-pulse rounded-[var(--radius-sm)] motion-reduce:animate-none",
      className,
    )}
    {...props}
  />
);
