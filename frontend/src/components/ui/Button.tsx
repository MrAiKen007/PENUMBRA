import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  isLoading?: boolean
}

/**
 * Button component following PENUMBRA DESIGN.md
 * Primary: #FF5533 (laranja-rosa-vermelho)
 * Secondary: #0A0A0A (preto quase puro)
 * Border radius: 6px (0.375rem)
 * Padding: 8px 16px (0.5rem 1rem)
 */
export function Button({
  children,
  className,
  variant = 'default',
  size = 'default',
  isLoading,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    // Primary: #FF5533 - for main actions only
    default: 'bg-[#FF5533] text-white hover:bg-[#E6421F] active:bg-[#CC3A19]',
    // Secondary: #0A0A0A - for secondary actions
    secondary: 'bg-[#0A0A0A] text-white hover:bg-[#2A2A2A] active:bg-[#1A1A1A]',
    // Outline: transparent with border
    outline: 'border border-[#E0E0E0] bg-transparent text-[#0A0A0A] hover:bg-[#F5F5F5]',
    // Ghost: minimal, for subtle actions
    ghost: 'bg-transparent text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F5F5F5]',
    // Danger: distinct from primary, pure red
    danger: 'bg-[#e02020] text-white hover:bg-[#c91919] active:bg-[#b01717]',
  }

  const sizes = {
    default: 'h-9 px-4 py-2 text-sm font-medium',
    sm: 'h-8 px-3 text-sm font-medium',
    lg: 'h-11 px-6 text-base font-medium',
    icon: 'h-9 w-9',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5533] focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
