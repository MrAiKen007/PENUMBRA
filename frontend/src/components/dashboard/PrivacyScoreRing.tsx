import { useMemo } from 'react'
import { getPrivacyScoreLabel } from '@/lib/utils'

interface PrivacyScoreRingProps {
  score: number
  size?: number
  strokeWidth?: number
}

export function PrivacyScoreRing({ score, size = 120, strokeWidth = 8 }: PrivacyScoreRingProps) {
  const { color, circumference, offset } = useMemo(() => {
    let strokeColor: string
    if (score >= 80) strokeColor = '#16a34a'
    else if (score >= 50) strokeColor = '#d97706'
    else strokeColor = '#e02020'

    const radius = (size - strokeWidth) / 2
    const circ = 2 * Math.PI * radius
    const progressOffset = circ - (score / 100) * circ

    return { color: strokeColor, circumference: circ, offset: progressOffset }
  }, [score, size, strokeWidth])

  const radius = (size - strokeWidth) / 2
  const center = size / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#E0E0E0" strokeWidth={strokeWidth} strokeLinecap="round" />
        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-[#0A0A0A]">{score}</span>
        <span className="text-xs text-[#6B6B6B]">/ 100</span>
      </div>
    </div>
  )
}

export function PrivacyScoreBadge({ score }: { score: number }) {
  const label = getPrivacyScoreLabel(score)
  const styles = {
    safe: 'bg-[#16a34a1a] text-[#16a34a] border-[#16a34a]/30',
    warning: 'bg-[#d977061a] text-[#d97706] border-[#d97706]/30',
    danger: 'bg-[#e020201a] text-[#e02020] border-[#e02020]/30',
  }
  const variant = score >= 80 ? 'safe' : score >= 50 ? 'warning' : 'danger'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[variant]}`}>{label}</span>
}
