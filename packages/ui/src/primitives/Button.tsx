"use client";

/**
 * ChiSetup button (покупатель). Variants: surface (neutral) | accent (primary, chamfered orange) |
 * ink (orange outline, сайт) | ghost (bare text). Лицо (Mini App / сайт) — из UiLookProvider.
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "../button-styles";
import { useUiLook } from "../look";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  fullWidth?: boolean;
  size?: ButtonSize;
}

export function Button({
  variant = "surface",
  loading = false,
  icon,
  children,
  fullWidth,
  size = "md",
  disabled,
  className,
  ...rest
}: Props) {
  const look = useUiLook() === "miniapp" ? "miniapp" : "site";
  return (
    <motion.button
      transition={{ duration: 0.07 }}
      disabled={disabled || loading}
      className={`${buttonClass(look, variant, size, fullWidth)} ${className ?? ""}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={look === "miniapp" ? 2.75 : 2.25} /> : icon}
      <span className="truncate">{children}</span>
    </motion.button>
  );
}
