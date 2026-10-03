import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "./button-styles";

/** A link that looks like a neo button (server-component friendly). */
export function ButtonLink({
  href,
  children,
  variant = "surface",
  size = "md",
  fullWidth,
  icon,
  className,
  ...rest
}: LinkProps & {
  children: ReactNode;
  variant?: "surface" | "accent" | "ink" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  icon?: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}) {
  return (
    <Link href={href} className={`${buttonClass(variant, size, fullWidth)} ${className ?? ""}`} {...rest}>
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}
