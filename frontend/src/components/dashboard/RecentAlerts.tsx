import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AlertCard } from './AlertCard'
import { useStore } from '@/store/useStore'
import { alertApi } from '@/lib/api'
import { useEffect, useState } from 'react'
import { RefreshCw, Bell, AlertCircle, WifiOff } from 'lucide-react'

export function RecentAlerts() {
  const { alerts, setAlerts, acknowledgeAlert } = useStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await alertApi.getAll()
      setAlerts(data.alerts)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar alertas'
      setError(message)
      console.error('Failed to load alerts:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const recentAlerts = alerts.slice(0, 5)
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length

  return (
    <Card
      title="Alertas Recentes"
      subtitle={unacknowledgedCount > 0 ? `${unacknowledgedCount} para rever` : 'Tudo em ordem'}
      accent={unacknowledgedCount > 0 ? 'warning' : 'safe'}
      action={
        <Button variant="outline" size="sm" onClick={loadAlerts} isLoading={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      }
    >
      <div className="space-y-3">
        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#e02020]/10 flex items-center justify-center mb-3">
              {error.includes('network') || error.includes('fetch') ? (
                <WifiOff className="w-5 h-5 text-[#e02020]" />
              ) : (
                <AlertCircle className="w-5 h-5 text-[#e02020]" />
              )}
            </div>
            <p className="text-sm font-medium text-[#0A0A0A]">Erro ao carregar</p>
            <p className="text-xs text-[#6B6B6B] mt-1 max-w-[200px]">{error}</p>
            <Button variant="outline" size="sm" onClick={loadAlerts} className="mt-3">
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && !error && alerts.length === 0 && (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl border border-[#E8E8E8] animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-[#E8E8E8]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-[#E8E8E8] rounded" />
                  <div className="h-3 w-1/2 bg-[#E8E8E8] rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && recentAlerts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#16a34a]/10 to-[#16a34a]/5 flex items-center justify-center mb-4">
              <Bell className="w-6 h-6 text-[#16a34a]" />
            </div>
            <p className="text-sm font-semibold text-[#0A0A0A]">Sem alertas ativos</p>
            <p className="text-xs text-[#6B6B6B] mt-1.5 max-w-[200px]">A sua carteira está em boa forma. Monitorizamos continuamente.</p>
          </div>
        )}

        {/* Alerts list */}
        {!isLoading && !error && recentAlerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onAcknowledge={acknowledgeAlert}
          />
        ))}
      </div>
    </Card>
  )
}
