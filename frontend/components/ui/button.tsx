import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost" | "voltage";
type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-foreground text-background hover:opacity-90",
  outline:
    "border border-border bg-background text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  voltage: "marketing-voltage-btn border-0 normal-case tracking-normal",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  lg: "h-11 px-6 text-base",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-voltage/40 disabled:pointer-events-none disabled:opacity-50",
    variant !== "voltage" && sizeClasses[size],
    variantClasses[variant],
    className
  );

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cn(classes, (children as React.ReactElement<{ className?: string }>).props.className),
    });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
