import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { forwardRef } from 'react'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, onCheckedChange, className, id, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className={cn(
            'peer h-4 w-4 rounded-md border border-[#D0D0D0] bg-white',
            'appearance-none transition-all',
            'checked:bg-[#FF5533] checked:border-[#FF5533]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5533]/30',
            'hover:border-[#B0B0B0]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          id={id}
          {...props}
        />
        <Check
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3',
            'text-primary-foreground pointer-events-none opacity-0 peer-checked:opacity-100'
          )}
        />
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
