import { Card } from '@/components/ui/Card'
import { formatBTC } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { Wallet, AlertCircle, Activity, GitBranch } from 'lucide-react'

export function StatsCard() {
  const { utxos, alerts, alertSummary } = useStore()

  const stats = [
    {
      label: 'Total UTXOs',
      value: utxos.length,
      icon: Wallet,
      color: 'text-[#FF5533]',
    },
    {
      label: 'Valor Total',
      value: formatBTC(utxos.reduce((sum, u) => sum + u.value, 0)) + ' BTC',
      icon: Activity,
      color: 'text-[#16a34a]',
    },
    {
      label: 'Alertas Ativos',
      value: alertSummary?.unacknowledged || alerts.filter((a) => !a.acknowledged).length,
      icon: AlertCircle,
      color: alerts.length > 0 ? 'text-[#e02020]' : 'text-[#6B6B6B]',
    },
    {
      label: 'Clusters Detectados',
      value: '0',
      icon: GitBranch,
      color: 'text-[#2563eb]',
    },
  ]

  return (
    <Card title="Estatísticas">
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#F5F5F5]">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0A0A0A]">{stat.value}</p>
              <p className="text-xs text-[#6B6B6B]">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
