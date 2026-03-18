import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "primary"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    // Using explicit Tailwind classes for dark mode communication app theme
    const variantClasses = {
      default: "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90",
      primary: "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500",
      destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
      outline: "border border-border bg-transparent hover:bg-secondary text-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground text-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    }
    
    const sizeClasses = {
      default: "h-10 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-12 rounded-lg px-8 text-base",
      icon: "h-10 w-10",
    }

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover-elevate active-elevate-2",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

// buttonVariants helper for components that need button-like styling (e.g. calendar, pagination)
export function buttonVariants(options?: { variant?: ButtonProps['variant']; size?: ButtonProps['size'] }) {
  const variant = options?.variant ?? 'default';
  const size = options?.size ?? 'default';
  const variantClasses: Record<string, string> = {
    default: "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90",
    primary: "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500",
    destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline: "border border-border bg-transparent hover:bg-secondary text-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground text-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizeClasses: Record<string, string> = {
    default: "h-10 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-12 rounded-lg px-8 text-base",
    icon: "h-10 w-10",
  };
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
  );
}

export { Button }
