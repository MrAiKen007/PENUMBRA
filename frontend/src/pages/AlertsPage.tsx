import { AlertList } from '@/components/alerts/AlertList'

export function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Alertas</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Alertas de privacidade em tempo real e análise de riscos
        </p>
      </div>

      <AlertList />
    </div>
  )
}
