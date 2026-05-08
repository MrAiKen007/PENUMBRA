import { useState } from 'react'
import { externalAddressApi } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { formatBTC, getUTXOLabelColor, getUTXOLabelName } from '@/lib/utils'
import type { UTXO } from '@/types'

export function ExternalAddressPage() {
  const [address, setAddress] = useState('')
  const [utxos, setUtxos] = useState<UTXO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) return

    setLoading(true)
    setError(null)
    setUtxos([])

    try {
      const result = await externalAddressApi.getUTXOs(address.trim())
      setUtxos(result.utxos)
      setSource(result.source)
      if (result.warning) {
        setError(result.warning)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao buscar UTXOs')
    } finally {
      setLoading(false)
    }
  }

  const totalValue = utxos.reduce((sum, u) => sum + u.value, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Endereço Externo</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Consulta UTXOs de qualquer endereço Bitcoin (watch-only)
        </p>
      </div>

      <Card title="Buscar Endereço">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0A0A0A] mb-2">
              Endereço Bitcoin
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="bc1q... ou 1... ou 3..."
              className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5533] font-mono text-sm text-[#0A0A0A] bg-white placeholder:text-[#9B9B9B]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="px-4 py-2 bg-[#FF5533] text-white rounded-lg hover:bg-[#E64A2D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Buscando...' : 'Buscar UTXOs'}
          </button>
        </form>
      </Card>

      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 text-sm">{error}</p>
        </div>
      )}

      {utxos.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Resumo">
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-[#6B6B6B]">Total em BTC</p>
                  <p className="text-2xl font-bold text-[#0A0A0A]">{formatBTC(totalValue)}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6B6B6B]">Número de UTXOs</p>
                  <p className="text-xl font-semibold text-[#0A0A0A]">{utxos.length}</p>
                </div>
                <div>
                  <p className="text-sm text-[#6B6B6B]">Fonte</p>
                  <p className="text-sm font-medium text-[#0A0A0A]">
                    {source === 'mempool_api' ? 'Mempool API' : source === 'scantxoutset' ? 'Bitcoin Core' : source}
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Endereço Analisado">
              <p className="font-mono text-xs text-[#6B6B6B] break-all">{address}</p>
            </Card>

            <Card title="Ações">
              <div className="space-y-2">
                <button
                  onClick={() => window.location.href = `/graph?address=${encodeURIComponent(address)}`}
                  className="w-full px-3 py-2 bg-[#0A0A0A] text-white text-sm rounded hover:bg-[#333] transition-colors"
                >
                  Ver Grafo de Rastreio
                </button>
                <button
                  onClick={() => window.location.href = `/graph/forensic?address=${encodeURIComponent(address)}`}
                  className="w-full px-3 py-2 border border-[#0A0A0A] text-[#0A0A0A] text-sm rounded hover:bg-[#F5F5F5] transition-colors"
                >
                  Análise Forense
                </button>
              </div>
            </Card>
          </div>

          <Card title={`UTXOs Encontrados (${utxos.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="text-left py-2 px-3 font-medium text-[#6B6B6B]">TXID</th>
                    <th className="text-left py-2 px-3 font-medium text-[#6B6B6B]">Vout</th>
                    <th className="text-right py-2 px-3 font-medium text-[#6B6B6B]">Valor</th>
                    <th className="text-center py-2 px-3 font-medium text-[#6B6B6B]">Status</th>
                    <th className="text-center py-2 px-3 font-medium text-[#6B6B6B]">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {utxos.map((utxo) => (
                    <tr key={`${utxo.txid}:${utxo.vout}`} className="border-b border-[#E5E5E5] last:border-0">
                      <td className="py-3 px-3 font-mono text-xs text-[#6B6B6B]">
                        {utxo.txid.slice(0, 16)}...{utxo.txid.slice(-8)}
                      </td>
                      <td className="py-3 px-3 text-[#0A0A0A]">{utxo.vout}</td>
                      <td className="py-3 px-3 text-right font-medium text-[#0A0A0A]">
                        {formatBTC(utxo.value)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${utxo.confirmed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {utxo.confirmed ? 'Confirmado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${getUTXOLabelColor(utxo.label)}`}>
                          {getUTXOLabelName(utxo.label)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {utxos.length === 0 && !loading && !error && address && (
        <Card title="Resultado">
          <p className="text-[#6B6B6B]">Nenhum UTXO encontrado para este endereço.</p>
          <p className="text-sm text-[#6B6B6B] mt-2">
            O endereço pode estar vazio ou nunca ter recebido transações.
          </p>
        </Card>
      )}
    </div>
  )
}
