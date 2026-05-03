import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Send, Eye, Bell, Shield } from 'lucide-react'
import { useStore } from '@/store/useStore'

export function QuickActions() {
  const navigate = useNavigate()
  const { alerts } = useStore()
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length

  const actions = [
    {
      icon: Send,
      label: 'Enviar',
      description: 'Nova transação',
      onClick: () => navigate('/send'),
      primary: true,
    },
    {
      icon: Eye,
      label: 'Ver UTXOs',
      description: 'Gerir entradas',
      onClick: () => navigate('/utxos'),
    },
    {
      icon: Bell,
      label: 'Alertas',
      description: unacknowledgedCount > 0 ? `${unacknowledgedCount} pendentes` : 'Tudo em ordem',
      onClick: () => navigate('/alerts'),
      badge: unacknowledgedCount > 0 ? unacknowledgedCount : undefined,
    },
    {
      icon: Shield,
      label: 'Gráfico',
      description: 'Visualizar ligações',
      onClick: () => navigate('/graph'),
    },
  ]

  const primaryAction = actions.find((a) => a.primary)
  const secondaryActions = actions.filter((a) => !a.primary)

  return (
    <Card title="Ações Rápidas" subtitle="Atalhos frequentes">
      <div className="space-y-2">
        {/* Primary action - featured prominently */}
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            className="group w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-[#FF5533]/10 to-[#FF5533]/5 border border-[#FF5533]/20 hover:border-[#FF5533]/40 transition-all duration-200 text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-[#FF5533] flex items-center justify-center shadow-lg shadow-[#FF5533]/20">
              <primaryAction.icon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <span className="text-base font-semibold text-[#FF5533]">{primaryAction.label}</span>
              <p className="text-sm text-[#6B6B6B]">{primaryAction.description}</p>
            </div>
            <svg className="w-5 h-5 text-[#FF5533]/50 group-hover:text-[#FF5533] group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Secondary actions - compact horizontal rows */}
        <div className="grid grid-cols-3 gap-2">
          {secondaryActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                className="group flex flex-col items-center p-3 rounded-xl bg-white border border-[#E8E8E8] hover:border-[#D0D0D0] hover:bg-[#FAFAFA] transition-all duration-200 text-center"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] group-hover:bg-[#EBEBEB] flex items-center justify-center transition-colors">
                    <Icon className="w-5 h-5 text-[#6B6B6B] group-hover:text-[#0A0A0A] transition-colors" />
                  </div>
                  {action.badge && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#e02020] text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                      {action.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-[#0A0A0A] mt-2">{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
