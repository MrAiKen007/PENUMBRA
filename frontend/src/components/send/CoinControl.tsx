import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { UTXOList } from '@/components/utxos/UTXOList'
import { useStore } from '@/store/useStore'
import { coinControlApi } from '@/lib/api'
import {
  formatSats,
  formatBTC,
  getPrivacyScoreLabel,
} from '@/lib/utils'
import { AlertTriangle, Shield, Send } from 'lucide-react'
import type { CoinControlRequest, FeeEstimate } from '@/types'

export function CoinControl() {
  const { utxos, selectedUtxos, setLastPsbt, lastPsbt } = useStore()
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [changeAddress, setChangeAddress] = useState('')
  const [feeRate, setFeeRate] = useState<'low' | 'medium' | 'high'>('medium')
  const [isLoading, setIsLoading] = useState(false)
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null)
  const [privacyScore, setPrivacyScore] = useState<number | null>(null)

  const selectedValue = utxos
    .filter((u) => selectedUtxos.includes(u.utxo_id))
    .reduce((sum, u) => sum + u.value, 0)

  const amountSats = parseInt(amount) * 100_000_000 || 0
  const changeAmount = selectedValue - amountSats - (feeEstimate?.total_fee_sats || 0)

  const estimateFee = () => {
    const rates: Record<string, number> = { low: 10, medium: 20, high: 50 }
    const vbytes = 150 + selectedUtxos.length * 70
    const feeSats = vbytes * rates[feeRate]

    setFeeEstimate({
      total_fee_sats: feeSats,
      fee_rate_sat_vb: rates[feeRate],
      estimated_vbytes: vbytes,
      estimated_minutes: feeRate === 'high' ? 10 : feeRate === 'medium' ? 30 : 60,
    })
  }

  const buildTransaction = async () => {
    if (!destination || !amount || selectedUtxos.length === 0) return

    setIsLoading(true)
    try {
      const request: CoinControlRequest = {
        wallet_address: utxos[0]?.address || '',
        selected_utxo_ids: selectedUtxos,
        destination_address: destination,
        amount_sats: amountSats,
        change_address: changeAddress || destination,
        fee_rate: feeRate,
      }

      const result = await coinControlApi.buildPSBT(request)
      setLastPsbt(result)
      setPrivacyScore(result.privacy_score)
    } catch (err) {
      console.error('Failed to build transaction:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-safe'
    if (score >= 50) return 'text-warning'
    return 'text-danger'
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <UTXOList
            selectable
            onSelectionChange={(selected) => {
              // Update fee estimate when selection changes
              if (selected.length > 0) {
                setTimeout(estimateFee, 0)
              }
            }}
          />
        </div>

        <div className="space-y-6">
          <Card title="Construir Transação" subtitle="Coin Control">
            <div className="space-y-4">
              <Input
                label="Endereço de Destino"
                placeholder="bc1q..."
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Valor (BTC)"
                  type="number"
                  step="0.00000001"
                  placeholder="0.001"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setTimeout(estimateFee, 0)
                  }}
                />
                <Input
                  label="Endereço de Troco (opcional)"
                  placeholder="bc1q..."
                  value={changeAddress}
                  onChange={(e) => setChangeAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#0A0A0A]">
                  Taxa de Fee
                </label>
                <div className="flex gap-2 mt-1.5">
                  {(['low', 'medium', 'high'] as const).map((rate) => (
                    <Button
                      key={rate}
                      variant={feeRate === rate ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setFeeRate(rate)
                        setTimeout(estimateFee, 0)
                      }}
                      className="flex-1"
                    >
                      {rate === 'low' && 'Baixa'}
                      {rate === 'medium' && 'Média'}
                      {rate === 'high' && 'Alta'}
                    </Button>
                  ))}
                </div>
              </div>

              {feeEstimate && (
                <div className="p-4 bg-[#F8F8F8] rounded-xl space-y-2 text-sm border border-[#E8E8E8]">
                  <div className="flex justify-between">
                    <span className="text-[#6B6B6B]">Fee estimada:</span>
                    <span className="font-semibold text-[#d97706]">
                      {formatSats(feeEstimate.total_fee_sats)} sats
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B6B6B]">Rate:</span>
                    <span className="font-medium text-[#0A0A0A]">
                      {feeEstimate.fee_rate_sat_vb} sat/vB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B6B6B]">Tamanho:</span>
                    <span className="font-medium text-[#0A0A0A]">
                      {feeEstimate.estimated_vbytes} vbytes
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B6B6B]">Confirmação em:</span>
                    <span className="font-medium text-[#16a34a]">
                      ~{feeEstimate.estimated_minutes} min
                    </span>
                  </div>
                </div>
              )}

              <div className="p-4 bg-gradient-to-br from-[#FF5533]/5 to-white rounded-xl border border-[#FF5533]/20">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B6B6B]">Total Selecionado:</span>
                  <span className="font-semibold text-[#0A0A0A]">{formatBTC(selectedValue)} BTC</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-[#6B6B6B]">A Enviar:</span>
                  <span className="font-semibold text-[#FF5533]">{formatBTC(amountSats)} BTC</span>
                </div>
                <div className="flex justify-between text-sm mt-2 pt-2 border-t border-[#E8E8E8]">
                  <span className="text-[#6B6B6B]">Troco:</span>
                  <span className={changeAmount < 0 ? 'text-[#e02020] font-semibold' : 'font-semibold text-[#16a34a]'}>
                    {formatBTC(Math.max(0, changeAmount))} BTC
                  </span>
                </div>
                {changeAmount < 546 && changeAmount > 0 && (
                  <p className="text-xs text-danger mt-2">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Troco abaixo do limite dust (546 sats)
                  </p>
                )}
              </div>

              {privacyScore !== null && (
                <div className="p-4 bg-[#F0F9FF] rounded-xl border border-[#0EA5E9]/20">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#0EA5E9]" />
                    <span className="text-sm text-[#6B6B6B]">
                      Privacy Score:
                    </span>
                    <span className={`font-bold text-lg ${getScoreColor(privacyScore)}`}>
                      {privacyScore}
                    </span>
                    <Badge
                      variant={
                        privacyScore >= 80
                          ? 'safe'
                          : privacyScore >= 50
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {getPrivacyScoreLabel(privacyScore)}
                    </Badge>
                  </div>
                </div>
              )}

              <Button
                onClick={buildTransaction}
                isLoading={isLoading}
                disabled={
                  !destination ||
                  !amount ||
                  selectedUtxos.length === 0 ||
                  changeAmount < 0
                }
                className="w-full bg-[#FF5533] hover:bg-[#E04A2C] text-white font-semibold py-3 rounded-xl shadow-lg shadow-[#FF5533]/25 transition-all duration-200"
              >
                <Send className="w-4 h-4 mr-2" />
                Construir PSBT
              </Button>
            </div>
          </Card>

          {lastPsbt && (
            <Card title="PSBT Gerado" subtitle="Assine e broadcast">
              <div className="space-y-3">
                <div className="p-3 bg-[#F8F8F8] rounded-lg border border-[#E8E8E8]">
                  <p className="text-xs text-[#6B6B6B]">TXID Preview:</p>
                  <p className="font-mono text-sm text-[#0A0A0A]">
                    {lastPsbt.txid_preview}
                  </p>
                </div>

                <div className="p-3 bg-[#F8F8F8] rounded-lg border border-[#E8E8E8]">
                  <p className="text-xs text-[#6B6B6B]">PSBT (hex):</p>
                  <textarea
                    readOnly
                    value={lastPsbt.psbt_hex}
                    className="w-full h-24 mt-1 bg-white font-mono text-xs resize-none p-2 rounded border border-[#E0E0E0] text-[#0A0A0A]"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(lastPsbt.psbt_hex)
                    }}
                  >
                    Copiar PSBT
                  </Button>
                  <Button variant="secondary">Assinar com HW</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
