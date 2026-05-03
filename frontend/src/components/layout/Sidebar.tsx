import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import {
  LayoutDashboard,
  Wallet,
  Send,
  GitGraph,
  Bell,
  Settings,
  Shield,
  X,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/utxos', icon: Wallet, label: 'UTXOs' },
  { to: '/send', icon: Send, label: 'Enviar' },
  { to: '/graph', icon: GitGraph, label: 'Rastreio' },
  { to: '/alerts', icon: Bell, label: 'Alertas' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <aside className="w-60 m-4 h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-xl shadow-black/8 border border-[#E8E8E8] flex flex-col overflow-hidden">
      <div className="p-5 border-b border-[#E8E8E8]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#FF5533]/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#FF5533]" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-[#0A0A0A] tracking-tight">PENUMBRA</h1>
              <p className="text-xs text-[#6B6B6B] font-medium">Privacy Wallet</p>
            </div>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-[#FF5533]/10 text-[#FF5533] font-semibold shadow-sm'
                  : 'text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#0A0A0A]'
              )
            }
          >
            <item.icon className={cn('w-4 h-4', 'transition-colors')} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-[#E8E8E8] bg-[#FAFAFA]">
        <div className="flex items-center gap-2.5 text-xs text-[#6B6B6B]">
          <div className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
          <span className="font-medium">Sistema operacional</span>
        </div>
      </div>
    </aside>
  )
}
