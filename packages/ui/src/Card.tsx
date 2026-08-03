import { HTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "ghost";
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={cn(
          // Base
          "rounded-2xl border transition-all duration-200",

          // Variants
          variant === "default" && "bg-surface border-border",

          variant === "elevated" &&
            "bg-surface border-border shadow-lg hover:shadow-xl hover:-translate-y-1",

          variant === "ghost" && "bg-transparent border-transparent",

          className,
        )}
      />
    );
  },
);

Card.displayName = "Card";

export default Card;
