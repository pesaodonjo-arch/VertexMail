import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900",
        "placeholder:text-ink-400",
        "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
