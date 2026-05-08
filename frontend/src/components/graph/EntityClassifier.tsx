import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { entityApi } from '@/lib/api'
import { truncateAddress, getRiskColor } from '@/lib/utils'
import type { Entity, EntityType, EntityRiskLevel } from '@/types'
import {
  Building2,
  Dice5,
  UserCircle,
  HelpCircle,
  Save,
  Trash2,
  Search,
  Plus,
  X,
  Building,
  Shuffle
} from 'lucide-react'

interface EntityClassifierProps {
  address?: string
  onEntitySaved?: (entity: Entity) => void
  onClose?: () => void
}

const ENTITY_TYPES: { value: EntityType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'exchange', label: 'Exchange', icon: <Building className="w-4 h-4" />, description: 'Binance, Coinbase, etc.' },
  { value: 'kyc', label: 'KYC Service', icon: <UserCircle className="w-4 h-4" />, description: 'Serviço com identidade verificada' },
  { value: 'mixer', label: 'Mixer/Tumbler', icon: <Shuffle className="w-4 h-4" />, description: 'BitcoinFog, Wasabi, etc.' },
  { value: 'gambling', label: 'Gambling', icon: <Dice5 className="w-4 h-4" />, description: 'Casino, apostas' },
  { value: 'service', label: 'Service', icon: <Building2 className="w-4 h-4" />, description: 'Outro serviço conhecido' },
  { value: 'unknown', label: 'Unknown', icon: <HelpCircle className="w-4 h-4" />, description: 'Tipo desconhecido' },
]

const RISK_LEVELS: { value: EntityRiskLevel; label: string; color: string }[] = [
  { value: 'safe', label: 'Safe', color: 'bg-green-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500' },
]

export function EntityClassifier({ address, onEntitySaved, onClose }: EntityClassifierProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(!!address)

  // Form state
  const [formAddress, setFormAddress] = useState(address || '')
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<EntityType>('exchange')
  const [formRisk, setFormRisk] = useState<EntityRiskLevel>('high')
  const [formNotes, setFormNotes] = useState('')
  const [addressError, setAddressError] = useState<string | null>(null)

  // Valida endereço Bitcoin (mainnet/testnet/regtest)
  const validateBitcoinAddress = (addr: string): boolean => {
    if (!addr || addr.length < 26) return false

    // P2PKH (1...)
    const p2pkh = /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/
    // P2SH (3...)
    const p2sh = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/
    // Bech32 mainnet (bc1...)
    const bech32 = /^bc1[ac-hj-np-z02-9]{11,71}$/i
    // Bech32 testnet (tb1...)
    const bech32Test = /^tb1[ac-hj-np-z02-9]{11,71}$/i
    // Bech32 regtest (bcrt1...)
    const bech32Reg = /^bcrt1[ac-hj-np-z02-9]{11,71}$/i

    return p2pkh.test(addr) || p2sh.test(addr) || bech32.test(addr) || bech32Test.test(addr) || bech32Reg.test(addr)
  }

  // Load entities on mount
  useEffect(() => {
    loadEntities()
  }, [])

  const loadEntities = async () => {
    setIsLoading(true)
    try {
      const response = await entityApi.getAll()
      setEntities(response.entities)
    } catch (err) {
      console.error('Failed to load entities:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formAddress || !formName) return

    // Valida endereço Bitcoin
    if (!validateBitcoinAddress(formAddress)) {
      setAddressError('Endereço Bitcoin inválido. Use formato: 1..., 3..., bc1..., tb1... ou bcrt1...')
      return
    }
    setAddressError(null)

    setIsSaving(true)
    try {
      const entity = await entityApi.create({
        address: formAddress,
        name: formName,
        entity_type: formType,
        risk_level: formRisk,
        notes: formNotes,
      })

      // Add to local list
      setEntities(prev => [entity, ...prev.filter(e => e.address !== entity.address)])

      // Reset form
      setFormAddress('')
      setFormName('')
      setFormNotes('')
      setShowForm(false)

      onEntitySaved?.(entity)
    } catch (err) {
      console.error('Failed to save entity:', err)
      alert('Erro ao salvar entidade')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (addr: string) => {
    if (!confirm(`Remover entidade para ${truncateAddress(addr)}?`)) return

    try {
      await entityApi.delete(addr)
      setEntities(prev => prev.filter(e => e.address !== addr))
    } catch (err) {
      console.error('Failed to delete entity:', err)
      alert('Erro ao remover entidade')
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadEntities()
      return
    }

    setIsLoading(true)
    try {
      const response = await entityApi.search(searchQuery)
      setEntities(response.entities)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getEntityIcon = (type: EntityType) => {
    const et = ENTITY_TYPES.find(t => t.value === type)
    return et?.icon || <HelpCircle className="w-4 h-4" />
  }

  const getEntityLabel = (type: EntityType) => {
    return ENTITY_TYPES.find(t => t.value === type)?.label || type
  }

  const filteredEntities = entities.filter(e =>
    !searchQuery ||
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.notes && e.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <Card
      title="Base de Entidades (KYC/Exchanges)"
      subtitle="Marque endereços conhecidos para deteção no grafo"
      className="w-full max-w-2xl"
    >
      <div className="space-y-4">
        {/* Header actions */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Procurar entidades..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#FF5533]/50 focus:ring-2 focus:ring-[#FF5533]/20 outline-none"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancelar' : 'Nova'}
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <Badge variant="outline" className="flex items-center gap-1">
            <Building className="w-3 h-3" />
            {entities.filter(e => e.entity_type === 'exchange').length} Exchanges
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Shuffle className="w-3 h-3" />
            {entities.filter(e => e.entity_type === 'mixer').length} Mixers
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <UserCircle className="w-3 h-3" />
            {entities.filter(e => e.entity_type === 'kyc').length} KYC
          </Badge>
          <span className="text-gray-400">Total: {entities.length}</span>
        </div>

        {/* Form */}
        {showForm && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#FF5533]" />
              Nova Entidade
            </h4>

            <div>
              <Input
                label="Endereço Bitcoin"
                placeholder="bc1q... ou 1... ou 3..."
                value={formAddress}
                onChange={(e) => {
                  setFormAddress(e.target.value)
                  if (addressError) setAddressError(null)
                }}
                error={addressError || undefined}
              />
              <p className="text-xs text-gray-400 mt-1">
                Formatos aceites: 1... (P2PKH), 3... (P2SH), bc1... (Bech32)
              </p>
            </div>

            <Input
              label="Nome da Entidade"
              placeholder="Ex: Binance, Coinbase, BitcoinFog..."
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo</label>
                <div className="space-y-1">
                  {ENTITY_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormType(type.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        formType === type.value
                          ? 'border-[#FF5533] bg-[#FF5533]/5 text-[#FF5533]'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {type.icon}
                      <span className="flex-1 text-left">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nível de Risco</label>
                <div className="space-y-1">
                  {RISK_LEVELS.map(risk => (
                    <button
                      key={risk.value}
                      onClick={() => setFormRisk(risk.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        formRisk === risk.value
                          ? 'border-[#FF5533] bg-[#FF5533]/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${risk.color}`} />
                      <span className="flex-1 text-left">{risk.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Notas (opcional)</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Como identificou esta entidade?"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#FF5533]/50 focus:ring-2 focus:ring-[#FF5533]/20 outline-none resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !formAddress || !formName}
                className="flex-1"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Entity list */}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-[#FF5533] rounded-full animate-spin mx-auto mb-2" />
              A carregar...
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma entidade cadastrada</p>
              <p className="text-xs mt-1">Adicione exchanges, mixers ou serviços KYC</p>
            </div>
          ) : (
            filteredEntities.map(entity => (
              <div
                key={entity.address}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  {getEntityIcon(entity.entity_type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{entity.name}</span>
                    <Badge
                      variant="outline"
                      className="text-xs flex-shrink-0"
                    >
                      {getEntityLabel(entity.entity_type)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono">{truncateAddress(entity.address, 8, 8)}</span>
                    <span className={`w-2 h-2 rounded-full ${getRiskColor(entity.risk_level)}`} />
                    <span className="capitalize">{entity.risk_level}</span>
                  </div>
                  {entity.notes && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{entity.notes}</p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(entity.address)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  )
}

export default EntityClassifier
