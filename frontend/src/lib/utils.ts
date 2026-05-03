import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSats(sats: number): string {
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(sats)
}

export function formatBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8)
}

export function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
  }).format(value)
}

export function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function truncateTxid(txid: string, start = 8, end = 8): string {
  if (txid.length <= start + end) return txid
  return `${txid.slice(0, start)}...${txid.slice(-end)}`
}

export function getPrivacyScoreColor(score: number): string {
  if (score >= 80) return 'text-safe bg-safe/10'
  if (score >= 50) return 'text-warning bg-warning/10'
  return 'text-danger bg-danger/10'
}

export function getPrivacyScoreLabel(score: number): string {
  if (score >= 80) return 'Seguro'
  if (score >= 50) return 'Cuidado'
  return 'Exposto'
}

export function getRiskColor(risk: string): string {
  switch (risk) {
    case 'safe':
      return '#16a34a'
    case 'caution':
      return '#d97706'
    case 'high':
      return '#e02020'
    case 'critical':
      return '#e02020'
    default:
      return '#6B6B6B'
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'info':
      return 'bg-info text-white'
    case 'warning':
      return 'bg-warning text-white'
    case 'critical':
      return 'bg-danger text-white'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'info':
      return 'Info'
    case 'warning':
      return 'AlertTriangle'
    case 'critical':
      return 'AlertOctagon'
    default:
      return 'HelpCircle'
  }
}

export function getUTXOLabelColor(label: string): string {
  switch (label) {
    case 'safe':
      return 'bg-safe/20 text-safe border-safe/30'
    case 'kyc':
      return 'bg-warning/20 text-warning border-warning/30'
    case 'mixed':
      return 'bg-info/20 text-info border-info/30'
    case 'doxxic':
      return 'bg-danger/20 text-danger border-danger/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function getUTXOLabelName(label: string): string {
  switch (label) {
    case 'safe':
      return 'Seguro'
    case 'kyc':
      return 'KYC'
    case 'mixed':
      return 'Mixado'
    case 'doxxic':
      return 'Doxxic'
    default:
      return 'Desconhecido'
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
