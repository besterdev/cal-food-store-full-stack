import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "default" | "icon";
}

export const Button = ({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonProps) => (
  <button
    className={cn(
      "focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-[color,background-color,border-color,opacity,transform] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0",
      size === "icon" ? "size-11 shrink-0 p-0" : "px-4 py-2.5",
      variant === "primary" &&
        "bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary),black_10%)]",
      variant === "secondary" &&
        "bg-secondary text-secondary-foreground hover:bg-accent",
      variant === "outline" &&
        "border-input bg-card text-foreground hover:bg-accent border",
      className,
    )}
    {...props}
  />
);
