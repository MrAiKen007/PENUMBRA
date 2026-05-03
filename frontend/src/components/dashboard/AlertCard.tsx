import { useState } from 'react'
import { AlertTriangle, AlertOctagon, Info, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import type { Alert, AlertSeverity, AlertType } from '@/types'

interface AlertCardProps {
  alert: Alert
  onAcknowledge?: (id: string) => void
}

const severityConfig: Record<AlertSeverity, { icon: React.ElementType; label: string; badge: 'info' | 'warning' | 'danger' }> = {
  info: { icon: Info, label: 'Info', badge: 'info' },
  warning: { icon: AlertTriangle, label: 'Atenção', badge: 'warning' },
  critical: { icon: AlertOctagon, label: 'Crítico', badge: 'danger' },
}

const typeLabels: Record<AlertType, string> = {
  cioh: 'Propriedade comum detectada',
  address_reuse: 'Endereço reutilizado',
  kyc_contamination: 'Contaminação KYC',
  peeling_chain: 'Cadeia de peeling',
  dust_attack: 'Ataque de dust',
  large_amount: 'Montante elevado',
  fee_anomaly: 'Taxa anómala',
  entity_detected: 'Entidade identificada',
  change_exposed: 'Change exposto',
}

const whyItMatters: Record<AlertType, string> = {
  cioh: 'Quando vários inputs são usados juntos, provavelmente pertencem à mesma carteira. Isto permite que observadores liguem transações à sua identidade.',
  address_reuse: 'Reutilizar o mesmo endereço expõe todas as transações desse endereço, facilitando a análise de padrões.',
  kyc_contamination: 'UTXOs de exchanges KYC podem ser ligados à sua identidade real. Misturar com outros UTXOs compromete a privacidade desses também.',
  peeling_chain: 'Cadeias de peeling são padrões reconhecíveis usados para rastrear fundos.',
  dust_attack: 'Pequenas quantidades de "dust" são enviadas para rastrear futuras transações.',
  large_amount: 'Montantes elevados atraem mais atenção de analistas.',
  fee_anomaly: 'Padrões anómalos nas taxas podem revelar informações sobre a carteira utilizada.',
  entity_detected: 'Uma entidade conhecida foi identificada, o que pode significar monitorização adicional.',
  change_exposed: 'O output de change foi identificado, permitindo rastrear futuras transações.',
}

const suggestions: Record<AlertType, string> = {
  cioh: 'Evite juntar UTXOs de diferentes fontes. Use coin control.',
  address_reuse: 'Gere um novo endereço para cada receção.',
  kyc_contamination: 'Mantenha UTXOs KYC separados. Não os junte com UTXOs não-KYC.',
  peeling_chain: 'Considere usar coinjoin ou mixing.',
  dust_attack: 'Não gaste outputs de dust. Marque-os como "do not spend".',
  large_amount: 'Considere dividir em transações menores ou usar coinjoin.',
  fee_anomaly: 'Use fee estimation automático da sua carteira.',
  entity_detected: 'Seja cauteloso com transações futuras. Use endereços novos.',
  change_exposed: 'Considere não receber change ou usar técnicas de payjoin.',
}

export function AlertCard({ alert, onAcknowledge }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { icon: Icon, label, badge } = severityConfig[alert.severity]
  const humanTitle = typeLabels[alert.type] || alert.title

  return (
    <div className={`border rounded-xl transition-all ${alert.acknowledged ? 'bg-[#F8F8F8] border-[#E8E8E8] opacity-70' : 'bg-white border-[#E0E0E0] shadow-[0_1px_2px_rgba(0,0,0,0.02)]'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${
            alert.severity === 'info' ? 'bg-[#2563eb]/10 text-[#2563eb]' :
            alert.severity === 'warning' ? 'bg-[#d97706]/10 text-[#d97706]' :
            'bg-[#e02020]/10 text-[#e02020]'
          }`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-[#0A0A0A] text-sm">{humanTitle}</p>
              <Badge variant={badge}>{label}</Badge>
            </div>
            <p className="text-sm text-[#6B6B6B] mt-1.5 leading-relaxed">{alert.message}</p>
            {expanded && (
              <div className="mt-4 space-y-3 pt-4 border-t border-[#F0F0F0]">
                <div>
                  <p className="text-xs font-semibold text-[#0A0A0A] uppercase tracking-wide">Porque importa</p>
                  <p className="text-sm text-[#6B6B6B] mt-1.5 leading-relaxed">{whyItMatters[alert.type]}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#0A0A0A] uppercase tracking-wide">O que fazer</p>
                  <p className="text-sm text-[#6B6B6B] mt-1.5 leading-relaxed">{alert.suggestion || suggestions[alert.type]}</p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-[#9B9B9B] font-medium">{format(new Date(alert.timestamp), "HH:mm dd/MM", { locale: pt })}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setExpanded(!expanded)} className="text-xs text-[#6B6B6B] hover:text-[#0A0A0A] font-medium flex items-center gap-1 transition-colors">
                  {expanded ? (
                    <><span>Menos</span><ChevronUp className="w-3.5 h-3.5" /></>
                  ) : (
                    <><span>Detalhes</span><ChevronDown className="w-3.5 h-3.5" /></>
                  )}
                </button>
                {!alert.acknowledged && onAcknowledge && (
                  <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" onClick={() => onAcknowledge(alert.id)}>
                    <Check className="w-3.5 h-3.5 mr-1" />Ok
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
