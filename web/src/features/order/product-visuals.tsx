import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Banana,
  Bean,
  Cherry,
  Citrus,
  Grape,
  Salad,
} from "lucide-react";

import type { ProductCode, ProductColorToken } from "@/features/order/catalog";
import { cn } from "@/lib/utils";

const iconsByColor: Record<ProductColorToken, LucideIcon> = {
  red: Apple,
  green: Salad,
  blue: Bean,
  yellow: Banana,
  pink: Cherry,
  purple: Grape,
  orange: Citrus,
};

const colorByCode: Record<ProductCode, ProductColorToken> = {
  RED: "red",
  GREEN: "green",
  BLUE: "blue",
  YELLOW: "yellow",
  PINK: "pink",
  PURPLE: "purple",
  ORANGE: "orange",
};

const iconToneClasses: Record<ProductColorToken, string> = {
  red: "bg-product-red-tint text-product-red",
  green: "bg-product-green-tint text-product-green",
  blue: "bg-product-blue-tint text-product-blue",
  yellow: "bg-product-yellow-tint text-product-yellow-foreground",
  pink: "bg-product-pink-tint text-product-pink",
  purple: "bg-product-purple-tint text-product-purple",
  orange: "bg-product-orange-tint text-product-orange",
};

interface ProductIconProps {
  colorToken?: ProductColorToken;
  productCode?: ProductCode;
  size?: "sm" | "md";
  className?: string;
}

export const ProductIcon = ({
  colorToken,
  productCode,
  size = "md",
  className,
}: ProductIconProps) => {
  const token =
    colorToken ?? (productCode ? colorByCode[productCode] : undefined);
  if (!token) {
    return null;
  }

  const Icon = iconsByColor[token];
  const iconSize = size === "sm" ? 14 : 18;
  const boxSize = size === "sm" ? "size-6" : "size-8";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
        boxSize,
        iconToneClasses[token],
        className,
      )}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </span>
  );
};
