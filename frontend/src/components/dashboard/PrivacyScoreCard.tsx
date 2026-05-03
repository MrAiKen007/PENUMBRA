import { Card } from '@/components/ui/Card'
import { PrivacyScoreBadge } from './PrivacyScoreRing'
import { formatBTC } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { Shield, AlertTriangle, AlertOctagon, Wallet, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'

export function PrivacyScoreCard() {
  const { utxos } = useStore()

  const stats = useMemo(() => {
    const safe = utxos.filter((u) => u.label === 'safe')
    const warning = utxos.filter((u) => ['mixed', 'unknown'].includes(u.label))
    const danger = utxos.filter((u) => ['kyc', 'doxxic'].includes(u.label))

    const safeValue = safe.reduce((sum, u) => sum + u.value, 0)
    const warningValue = warning.reduce((sum, u) => sum + u.value, 0)
    const dangerValue = danger.reduce((sum, u) => sum + u.value, 0)

    const total = utxos.reduce((sum, u) => sum + u.value, 0)
    const avg = utxos.length > 0
      ? Math.round(utxos.reduce((sum, u) => {
          const scores: Record<string, number> = { safe: 90, kyc: 60, mixed: 75, doxxic: 30, unknown: 50 }
          return sum + (scores[u.label] || 50)
        }, 0) / utxos.length)
      : 0

    return {
      safe: { count: safe.length, value: safeValue },
      warning: { count: warning.length, value: warningValue },
      danger: { count: danger.length, value: dangerValue },
      totalValue: total,
      avgScore: avg,
      totalCount: utxos.length
    }
  }, [utxos])

  const hasUTXOs = stats.totalCount > 0

  return (
    <Card title="Estado da Privacidade" subtitle={`${stats.totalCount} UTXOs analisados`}>
      {/* Asymmetric layout - Score as header, not center hero */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-[#0A0A0A] tracking-tight">
              {hasUTXOs ? stats.avgScore : '--'}
            </span>
            <span className="text-lg text-[#6B6B6B]">/ 100</span>
          </div>
          <PrivacyScoreBadge score={stats.avgScore} />
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-[#6B6B6B]">
            <Wallet className="w-4 h-4" />
            <span className="text-sm">Valor total</span>
          </div>
          <p className="text-xl font-semibold text-[#0A0A0A]">{formatBTC(stats.totalValue)} BTC</p>
        </div>
      </div>

      {/* Risk distribution as horizontal bars - more scannable than ring */}
      {hasUTXOs ? (
        <div className="space-y-3">
          {/* Safe bar */}
          <div className="group">
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#16a34a]/10 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-[#16a34a]" />
                </div>
                <span className="text-[#0A0A0A] font-medium">Privados</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#6B6B6B]">{stats.safe.count} UTXOs</span>
                <span className="text-[#0A0A0A] font-medium">{formatBTC(stats.safe.value)} BTC</span>
              </div>
            </div>
            <div className="h-2 bg-[#E8E8E8] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#16a34a] rounded-full transition-all duration-500"
                style={{ width: `${stats.totalValue > 0 ? (stats.safe.value / stats.totalValue) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Warning bar */}
          <div className="group">
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#d97706]/10 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#d97706]" />
                </div>
                <span className="text-[#0A0A0A] font-medium">Atenção</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#6B6B6B]">{stats.warning.count} UTXOs</span>
                <span className="text-[#0A0A0A] font-medium">{formatBTC(stats.warning.value)} BTC</span>
              </div>
            </div>
            <div className="h-2 bg-[#E8E8E8] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#d97706] rounded-full transition-all duration-500"
                style={{ width: `${stats.totalValue > 0 ? (stats.warning.value / stats.totalValue) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Danger bar */}
          <div className="group">
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#e02020]/10 flex items-center justify-center">
                  <AlertOctagon className="w-3.5 h-3.5 text-[#e02020]" />
                </div>
                <span className="text-[#0A0A0A] font-medium">Expostos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#6B6B6B]">{stats.danger.count} UTXOs</span>
                <span className="text-[#0A0A0A] font-medium">{formatBTC(stats.danger.value)} BTC</span>
              </div>
            </div>
            <div className="h-2 bg-[#E8E8E8] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e02020] rounded-full transition-all duration-500"
                style={{ width: `${stats.totalValue > 0 ? (stats.danger.value / stats.totalValue) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#F5F5F5] to-[#EBEBEB] flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-[#9B9B9B]" />
          </div>
          <p className="text-sm text-[#6B6B6B]">Conecte uma carteira para analisar</p>
        </div>
      )}
    </Card>
  )
}
