"use client";

// Button component with consistent styling and dark mode support
import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...props
}: ButtonProps) {
  // Base button styles
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded transition-colors";

  // Size classes
  const sizeClasses = {
    sm: "px-3 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };

  // Variant classes
  const variantClasses = {
    primary:
      "bg-primary-light/25 text-primary hover:bg-primary-light/40 disabled:opacity-50 dark:bg-primary-light/10 dark:text-primary dark:hover:bg-primary-light/20",
    secondary:
      "bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-[#3b2d27] dark:text-amber-300/80 dark:hover:bg-[#4d3c34]",
    outline:
      "bg-transparent border border-gray-200 text-gray-700 hover:bg-gray-100/70 disabled:opacity-50 dark:border-[#3b2d27] dark:text-amber-300/80 dark:hover:bg-[#2a201c]",
  };

  const classes = `${baseStyles} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
