import { cn } from '@/lib/utils'

type CardAccent = 'none' | 'primary' | 'black' | 'safe' | 'warning' | 'danger' | 'info'

interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: React.ReactNode
  accent?: CardAccent
}

/**
 * Card component following PENUMBRA DESIGN.md
 * - Background: #FFFFFF
 * - Border: 0.5px solid #E0E0E0
 * - Border radius: 8px (0.5rem)
 * - Padding: 14px 16px
 * - Accent: border-top 3px (optional)
 */
export function Card({ children, className, title, subtitle, action, accent = 'none' }: CardProps) {
  const accentStyles: Record<CardAccent, string> = {
    none: '',
    primary: 'border-t-[3px] border-t-[#FF5533]',
    secondary: 'border-t-[3px] border-t-[#FF016B]',
    black: 'border-t-[3px] border-t-[#0A0A0A]',
    safe: 'border-t-[3px] border-t-[#16a34a]',
    warning: 'border-t-[3px] border-t-[#d97706]',
    danger: 'border-t-[3px] border-t-[#e02020]',
    info: 'border-t-[3px] border-t-[#2563eb]',
  }

  return (
    <div
      className={cn(
        'bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        accentStyles[accent],
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E0E0]/80">
          <div>
            {title && <h3 className="font-semibold text-[#0A0A0A] text-base">{title}</h3>}
            {subtitle && <p className="text-sm text-[#6B6B6B] mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
