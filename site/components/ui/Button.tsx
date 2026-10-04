"use client";

/**
 * ChiSetup button: graphite surface, chamfered orange accent CTA, slight scale on press.
 * Variants: surface (neutral) | accent (primary) | ink (orange outline) | ghost (bare text).
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  BUTTON_BASE as base,
  BUTTON_SIZES as sizes,
  BUTTON_VARIANTS as variants,
  type ButtonSize,
  type ButtonVariant as Variant,
} from "./button-styles";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
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
  return (
    <motion.button
      transition={{ duration: 0.07 }}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className ?? ""}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2.25} /> : icon}
      <span className="truncate">{children}</span>
    </motion.button>
  );
}

