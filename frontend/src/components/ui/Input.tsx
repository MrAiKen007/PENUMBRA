import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className={cn('space-y-1.5', className)}>
        {label && (
          <label className="text-sm font-medium text-[#0A0A0A]">{label}</label>
        )}
        <input
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border border-[#E0E0E0] bg-white px-3.5 py-2 text-sm text-[#0A0A0A] transition-all',
            'placeholder:text-[#9B9B9B]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5533]/30 focus-visible:border-[#FF5533]/50',
            'hover:border-[#D0D0D0]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-[#e02020] focus-visible:ring-[#e02020]/30',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
