import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store/useStore'
import { alertApi } from '@/lib/api'
import {
  getSeverityColor,
  truncateTxid,
  truncateAddress,
} from '@/lib/utils'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  Check,
  RefreshCw,
} from 'lucide-react'
import type { AlertSeverity, AlertType } from '@/types'

const severityIcons = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
}

const alertTypeNames: Record<AlertType, string> = {
  cioh: 'CIOH',
  address_reuse: 'Reutilização',
  kyc_contamination: 'KYC',
  peeling_chain: 'Peeling Chain',
  dust_attack: 'Dust Attack',
  large_amount: 'Valor Alto',
  fee_anomaly: 'Fee Anómala',
  entity_detected: 'Entidade',
  change_exposed: 'Troco Exposto',
}

export function AlertList() {
  const { alerts, setAlerts, acknowledgeAlert, alertSummary, setAlertSummary } =
    useStore()
  const [isLoading, setIsLoading] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'all'>('all')
  const [filterType, setFilterType] = useState<AlertType | 'all'>('all')
  const [showAcknowledged, setShowAcknowledged] = useState(false)

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    setIsLoading(true)
    try {
      const [alertsData, summaryData] = await Promise.all([
        alertApi.getAll(),
        alertApi.getSummary(),
      ])
      setAlerts(alertsData.alerts)
      setAlertSummary(summaryData)
    } catch (err) {
      console.error('Failed to load alerts:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredAlerts = alerts.filter((alert) => {
    if (!showAcknowledged && alert.acknowledged) return false
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false
    if (filterType !== 'all' && alert.type !== filterType) return false
    return true
  })

  return (
    <div className="space-y-6">
      {alertSummary && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-white border-[#E8E8E8]">
            <div className="text-center">
              <p className="text-3xl font-bold text-[#0A0A0A]">
                {alertSummary.total_alerts}
              </p>
              <p className="text-xs text-[#6B6B6B]">Total Alertas</p>
            </div>
          </Card>
          <Card className="bg-[#e02020]/10 border-[#e02020]/30">
            <div className="text-center">
              <p className="text-3xl font-bold text-[#e02020]">
                {alertSummary.critical_count}
              </p>
              <p className="text-xs text-[#e02020]/70">Críticos</p>
            </div>
          </Card>
          <Card className="bg-[#d97706]/10 border-[#d97706]/30">
            <div className="text-center">
              <p className="text-3xl font-bold text-[#d97706]">
                {alertSummary.warning_count}
              </p>
              <p className="text-xs text-[#d97706]/70">Avisos</p>
            </div>
          </Card>
          <Card className="bg-white border-[#E8E8E8]">
            <div className="text-center">
              <p className="text-3xl font-bold text-[#0A0A0A]">
                {alertSummary.unacknowledged}
              </p>
              <p className="text-xs text-[#6B6B6B]">Não Reconhecidos</p>
            </div>
          </Card>
        </div>
      )}

      <Card
        title="Todos os Alertas"
        action={
          <Button variant="outline" size="sm" onClick={loadAlerts} isLoading={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterSeverity}
              onChange={(e) =>
                setFilterSeverity(e.target.value as AlertSeverity | 'all')
              }
              className="text-sm bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-[#0A0A0A] focus:border-[#FF5533]/50 focus:ring-2 focus:ring-[#FF5533]/20 outline-none"
            >
              <option value="all">Todas Severidades</option>
              <option value="critical">Crítico</option>
              <option value="warning">Aviso</option>
              <option value="info">Info</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as AlertType | 'all')}
              className="text-sm bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-[#0A0A0A] focus:border-[#FF5533]/50 focus:ring-2 focus:ring-[#FF5533]/20 outline-none"
            >
              <option value="all">Todos Tipos</option>
              {Object.entries(alertTypeNames).map(([type, name]) => (
                <option key={type} value={type}>
                  {name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-[#6B6B6B]">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-[#D0D0D0] text-[#FF5533] focus:ring-[#FF5533]/20"
              />
              Mostrar reconhecidos
            </label>
          </div>

          <div className="space-y-2">
            {filteredAlerts.length === 0 ? (
              <p className="text-sm text-[#6B6B6B] text-center py-8">
                Sem alertas para mostrar
              </p>
            ) : (
              filteredAlerts.map((alert) => {
                const Icon = severityIcons[alert.severity] || Info
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border ${
                      alert.acknowledged
                        ? 'bg-[#F8F8F8] border-[#E8E8E8] opacity-60'
                        : 'bg-white border-[#E8E8E8]'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-full ${getSeverityColor(
                        alert.severity
                      )}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#0A0A0A]">
                          {alert.title}
                        </p>
                        <Badge variant={alert.severity as any}>{alert.severity}</Badge>
                        <Badge variant="outline">
                          {alertTypeNames[alert.type]}
                        </Badge>
                        {alert.acknowledged && (
                          <Badge variant="secondary">Reconhecido</Badge>
                        )}
                      </div>

                      <p className="text-sm text-[#6B6B6B] mt-1">
                        {alert.message}
                      </p>

                      <p className="text-sm mt-2">
                        <span className="text-[#FF5533] font-medium">Sugestão:</span>{' '}
                        <span className="text-[#0A0A0A]">{alert.suggestion}</span>
                      </p>

                      <div className="flex items-center gap-3 mt-3 text-xs text-[#9B9B9B]">
                        {alert.txid && (
                          <span className="font-mono">
                            {truncateTxid(alert.txid)}
                          </span>
                        )}
                        {alert.address && (
                          <span className="font-mono">
                            {truncateAddress(alert.address)}
                          </span>
                        )}
                        <span>•</span>
                        <span>
                          {format(new Date(alert.timestamp), 'HH:mm dd/MM/yyyy', {
                            locale: pt,
                          })}
                        </span>
                      </div>
                    </div>

                    {!alert.acknowledged && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="text-[#16a34a] hover:text-[#16a34a] hover:bg-[#16a34a]/10"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Reconhecer
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
