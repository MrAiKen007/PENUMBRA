import { CoinControl } from '@/components/send/CoinControl'

export function SendPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Enviar</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Coin Control - seleção manual de UTXOs com estimativa de privacidade
        </p>
      </div>

      <CoinControl />
    </div>
  )
}
