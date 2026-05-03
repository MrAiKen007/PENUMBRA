import { PrivacyScoreCard } from '@/components/dashboard/PrivacyScoreCard'
import { RecentAlerts } from '@/components/dashboard/RecentAlerts'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { useStore } from '@/store/useStore'
import { ArrowUpRight } from 'lucide-react'

export function Dashboard() {
  const { utxos } = useStore()
  const hasWallet = utxos.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Dashboard</h1>
          <p className="text-[#6B6B6B] mt-1.5 text-sm">
            Visão geral da privacidade da sua carteira
          </p>
        </div>
        {hasWallet && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#16a34a]/10 rounded-full border border-[#16a34a]/20">
            <div className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <span className="text-sm text-[#16a34a] font-medium">Carteira ativa</span>
          </div>
        )}
      </div>

      {/* Primary zone: Privacy Score + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PrivacyScoreCard />
        </div>
        <QuickActions />
      </div>

      {/* Secondary zone: Alerts */}
      <div className="grid grid-cols-1 gap-6">
        <RecentAlerts />
      </div>

      {/* First-run state / Empty state */}
      {!hasWallet && (
        <div className="bg-gradient-to-br from-[#F5F5F5] to-white border border-[#E0E0E0] rounded-xl p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#FF5533]/10 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <ArrowUpRight className="w-7 h-7 text-[#FF5533]" />
          </div>
          <h3 className="text-lg font-semibold text-[#0A0A0A] mb-2">
            Configure a sua carteira
          </h3>
          <p className="text-sm text-[#6B6B6B] max-w-sm mx-auto mb-5 leading-relaxed">
            Para começar a monitorizar a privacidade da sua carteira Bitcoin, conecte-a através das definições.
          </p>
          <button className="px-5 py-2.5 bg-[#FF5533] text-white rounded-lg text-sm font-medium hover:bg-[#E6421F] transition-all shadow-sm hover:shadow-md">
            Ir para Definições
          </button>
        </div>
      )}
    </div>
  )
}
