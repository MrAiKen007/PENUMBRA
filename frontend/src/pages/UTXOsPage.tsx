import { UTXOList } from '@/components/utxos/UTXOList'
import { Card } from '@/components/ui/Card'
import { useStore } from '@/store/useStore'
import { formatBTC, getUTXOLabelColor, getUTXOLabelName } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

export function UTXOsPage() {
  const { utxos } = useStore()

  const distribution = [
    { name: 'Seguro', value: utxos.filter((u) => u.label === 'safe').length, color: '#16a34a' },
    { name: 'KYC', value: utxos.filter((u) => u.label === 'kyc').length, color: '#d97706' },
    { name: 'Mixado', value: utxos.filter((u) => u.label === 'mixed').length, color: '#2563eb' },
    { name: 'Doxxic', value: utxos.filter((u) => u.label === 'doxxic').length, color: '#e02020' },
    { name: 'Desconhecido', value: utxos.filter((u) => u.label === 'unknown').length, color: '#6B6B6B' },
  ].filter((d) => d.value > 0)

  const totalValue = utxos.reduce((sum, u) => sum + u.value, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">UTXOs</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Gestão e análise dos teus UTXOs com scoring de privacidade
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <UTXOList />
        </div>

        <div className="space-y-6">
          <Card title="Distribuição">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Resumo Financeiro">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[#6B6B6B]">Total em BTC</p>
                <p className="text-2xl font-bold text-[#0A0A0A]">
                  {formatBTC(totalValue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#6B6B6B]">Número de UTXOs</p>
                <p className="text-xl font-semibold text-[#0A0A0A]">
                  {utxos.length}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#6B6B6B]">UTXOs Confirmados</p>
                <p className="text-lg font-medium text-[#0A0A0A]">
                  {utxos.filter((u) => u.confirmed).length} / {utxos.length}
                </p>
              </div>
            </div>
          </Card>

          <Card title="Legenda">
            <div className="space-y-2 text-sm">
              {['safe', 'kyc', 'mixed', 'doxxic', 'unknown'].map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${getUTXOLabelColor(label)}`}>
                    {getUTXOLabelName(label)}
                  </span>
                  <span className="text-[#6B6B6B]">
                    {label === 'safe' && 'Sem riscos conhecidos'}
                    {label === 'kyc' && 'Identidade associada'}
                    {label === 'mixed' && 'Passou por mixer'}
                    {label === 'doxxic' && 'Risco elevado'}
                    {label === 'unknown' && 'Não classificado'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
