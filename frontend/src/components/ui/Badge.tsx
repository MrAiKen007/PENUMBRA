import { cn } from '@/lib/utils'

type BadgeVariant = 
  | 'default' 
  | 'secondary' 
  | 'outline' 
  | 'safe' 
  | 'warning' 
  | 'danger' 
  | 'info'
  | 'primary'
  | 'black'
  | 'utxo-safe'
  | 'utxo-kyc'
  | 'utxo-mixed'
  | 'utxo-doxxic'
  | 'utxo-unknown'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

/**
 * Badge component following PENUMBRA DESIGN.md
 * Semantic colors: safe (#16a34a), warning (#d97706), danger (#e02020), info (#2563eb)
 * Primary: #FF5533 with 10% opacity background
 */
export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    // Default variants
    default: 'bg-primary/10 text-primary border border-primary/20',
    secondary: 'bg-secondary/10 text-secondary border border-secondary/20',
    outline: 'border border-[#E0E0E0] text-[#0A0A0A] bg-transparent',
    
    // Semantic status variants - DESIGN.md colors
    safe: 'bg-[#16a34a1a] text-[#16a34a] border border-[#16a34a]/30',
    warning: 'bg-[#d977061a] text-[#d97706] border border-[#d97706]/30',
    danger: 'bg-[#e020201a] text-[#e02020] border border-[#e02020]/30',
    info: 'bg-[#2563eb1a] text-[#2563eb] border border-[#2563eb]/30',
    
    // Accent variants
    primary: 'bg-[#FF5533]/10 text-[#FF5533] border border-[#FF5533]/20 font-semibold',
    black: 'bg-[#0A0A0A]/8 text-[#0A0A0A] border border-[#0A0A0A]/15',
    
    // UTXO Label variants - DESIGN.md specification
    'utxo-safe': 'bg-[#16a34a1a] text-[#16a34a] border border-[#16a34a]/30',
    'utxo-kyc': 'bg-[#e020201a] text-[#e02020] border border-[#e02020]/30',
    'utxo-mixed': 'bg-[#d977061a] text-[#d97706] border border-[#d97706]/30',
    'utxo-doxxic': 'bg-[#FF5533]/10 text-[#FF5533] border border-[#FF5533]/20 font-semibold',
    'utxo-unknown': 'bg-transparent text-[#0A0A0A] border border-[#0A0A0A]/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
