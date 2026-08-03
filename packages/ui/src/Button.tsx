import { forwardRef, ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const Button = forwardRef<HTMLButtonElement, Props>(
  (
    { className, variant = "primary", size = "md", type = "button", ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        {...props}
        className={clsx(
          // Base
          "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
          "disabled:opacity-50 disabled:pointer-events-none",

          // Variants
          variant === "primary" &&
            "bg-primary text-white hover:bg-primary-hover",

          variant === "outline" &&
            "border border-border bg-surface text-text hover:border-primary",

          variant === "ghost" && "text-text hover:bg-surface",

          // Sizes
          size === "sm" && "px-4 py-2 text-sm",
          size === "md" && "px-6 py-3 text-sm",
          size === "lg" && "px-8 py-4 text-base",

          className,
        )}
      />
    );
  },
);

Button.displayName = "Button";

export default Button;
