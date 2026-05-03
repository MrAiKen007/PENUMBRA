import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { useStore } from '@/store/useStore'
import { utxoApi } from '@/lib/api'
import { formatBTC, truncateTxid, getUTXOLabelName } from '@/lib/utils'
import { AlertCircle, WifiOff } from 'lucide-react'
import type { UTXO, UTXOLabel } from '@/types'

interface UTXOListProps {
  selectable?: boolean
  onSelectionChange?: (selected: string[]) => void
}

const labelStyles: Record<string, { bg: string; text: string; border: string }> = {
  safe: { bg: 'bg-[#16a34a]/10', text: 'text-[#16a34a]', border: 'border-[#16a34a]/30' },
  kyc: { bg: 'bg-[#e02020]/10', text: 'text-[#e02020]', border: 'border-[#e02020]/30' },
  mixed: { bg: 'bg-[#d97706]/10', text: 'text-[#d97706]', border: 'border-[#d97706]/30' },
  doxxic: { bg: 'bg-[#FF5533]/10', text: 'text-[#FF5533]', border: 'border-[#FF5533]/30' },
  unknown: { bg: 'bg-[#6B6B6B]/10', text: 'text-[#6B6B6B]', border: 'border-[#6B6B6B]/30' },
}

export function UTXOList({ selectable, onSelectionChange }: UTXOListProps) {
  const { utxos, setUtxos, selectedUtxos, setSelectedUtxos } = useStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<UTXOLabel | 'all'>('all')

  useEffect(() => {
    loadUTXOs()
  }, [])

  useEffect(() => {
    onSelectionChange?.(selectedUtxos)
  }, [selectedUtxos, onSelectionChange])

  const loadUTXOs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await utxoApi.getAll()
      setUtxos(data.utxos)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar UTXOs'
      setError(message)
      console.error('Failed to load UTXOs:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleUtxo = (id: string) => {
    if (!selectable) return
    const newSelection = selectedUtxos.includes(id)
      ? selectedUtxos.filter((u) => u !== id)
      : [...selectedUtxos, id]
    setSelectedUtxos(newSelection)
  }

  const filteredUtxos = filter === 'all' ? utxos : utxos.filter((u) => u.label === filter)

  const renderUtxoItem = (utxo: UTXO, useLabelStyles: boolean) => {
    const isSelected = selectedUtxos.includes(utxo.utxo_id)
    const styles = labelStyles[utxo.label] || labelStyles.unknown

    return (
      <div
        key={utxo.utxo_id}
        onClick={() => selectable && toggleUtxo(utxo.utxo_id)}
        className={`group flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${
          isSelected
            ? 'border-[#FF5533] bg-[#FF5533]/5'
            : useLabelStyles
              ? `border-transparent ${styles.bg} hover:brightness-[0.98]`
              : 'border-[#E8E8E8] bg-white hover:border-[#D0D0D0]'
        }`}
      >
        {selectable && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleUtxo(utxo.utxo_id)}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-[#0A0A0A]">
              {truncateTxid(utxo.txid)}
              <span className="text-[#6B6B6B]">:{utxo.vout}</span>
            </span>
            <span className="font-semibold text-[#0A0A0A]">{formatBTC(utxo.value)} BTC</span>
          </div>
          {useLabelStyles ? (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={`${styles.text} ${styles.border} bg-white/50`}>
                {getUTXOLabelName(utxo.label)}
              </Badge>
              {!utxo.confirmed && <span className="text-xs text-[#d97706]">Pendente</span>}
            </div>
          ) : (
            !utxo.confirmed && <span className="text-xs text-[#d97706]">Aguardando confirmação</span>
          )}
        </div>
      </div>
    )
  }

  const renderFilteredList = () => {
    return (
      <div className="space-y-2">
        {filteredUtxos.map((utxo) => renderUtxoItem(utxo, true))}
      </div>
    )
  }

  const renderGroupedList = () => {
    const groupedUtxos = filteredUtxos.reduce((acc, utxo) => {
      const label = utxo.label
      if (!acc[label]) acc[label] = []
      acc[label].push(utxo)
      return acc
    }, {} as Record<string, UTXO[]>)

    const labelOrder: UTXOLabel[] = ['safe', 'kyc', 'mixed', 'doxxic', 'unknown']

    return (
      <div className="space-y-4">
        {labelOrder.map((label) => {
          const group = groupedUtxos[label]
          if (!group || group.length === 0) return null

          return (
            <div key={label} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${labelStyles[label].bg.replace('/10', '')}`} />
                <h4 className="text-sm font-semibold text-[#0A0A0A]">{getUTXOLabelName(label)}s</h4>
                <span className="text-xs text-[#6B6B6B]">({group.length})</span>
              </div>
              <div className="space-y-2">
                {group.map((utxo) => renderUtxoItem(utxo, false))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card
      title={`UTXOs (${filteredUtxos.length})`}
      subtitle={filter !== 'all' ? `Filtrado por ${getUTXOLabelName(filter)}` : undefined}
      action={
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as UTXOLabel | 'all')}
            className="text-sm bg-white border border-[#E0E0E0] rounded-lg px-3 py-1.5 focus:border-[#FF5533]/50 focus:ring-2 focus:ring-[#FF5533]/20 outline-none"
          >
            <option value="all">Todos</option>
            <option value="safe">Seguro</option>
            <option value="kyc">KYC</option>
            <option value="mixed">Mixado</option>
            <option value="doxxic">Doxxic</option>
            <option value="unknown">Desconhecido</option>
          </select>
          <Button variant="outline" size="sm" onClick={loadUTXOs} isLoading={isLoading}>
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-h-[500px] overflow-auto">
        {error && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#e02020]/10 flex items-center justify-center mb-3">
              {error.includes('network') || error.includes('fetch') ? (
                <WifiOff className="w-5 h-5 text-[#e02020]" />
              ) : (
                <AlertCircle className="w-5 h-5 text-[#e02020]" />
              )}
            </div>
            <p className="text-sm font-medium text-[#0A0A0A]">Erro ao carregar UTXOs</p>
            <p className="text-xs text-[#6B6B6B] mt-1 max-w-[200px]">{error}</p>
            <Button variant="outline" size="sm" onClick={loadUTXOs} className="mt-3">
              Tentar novamente
            </Button>
          </div>
        )}

        {isLoading && !error && utxos.length === 0 && (
          <div className="space-y-4 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl border border-[#E8E8E8] animate-pulse">
                {selectable && <div className="w-5 h-5 rounded bg-[#E8E8E8]" />}
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-4 w-24 bg-[#E8E8E8] rounded" />
                    <div className="h-4 w-16 bg-[#E8E8E8] rounded" />
                  </div>
                  <div className="h-3 w-20 bg-[#E8E8E8] rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredUtxos.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[#6B6B6B]">Sem UTXOs encontrados</p>
            <p className="text-xs text-[#9B9B9B] mt-1">Verifique os filtros ou conecte uma carteira</p>
          </div>
        )}

        {!error && !isLoading && filteredUtxos.length > 0 && (
          filter !== 'all' ? renderFilteredList() : renderGroupedList()
        )}
      </div>

      {selectable && selectedUtxos.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#E8E8E8]">
          <p className="text-sm text-[#6B6B6B]">
            <span className="font-semibold text-[#0A0A0A]">{selectedUtxos.length}</span> selecionado(s) ·{' '}
            <span className="font-semibold text-[#0A0A0A]">
              {formatBTC(
                utxos.filter((u) => selectedUtxos.includes(u.utxo_id)).reduce((sum, u) => sum + u.value, 0)
              )} BTC
            </span>
          </p>
        </div>
      )}
    </Card>
  )
}
