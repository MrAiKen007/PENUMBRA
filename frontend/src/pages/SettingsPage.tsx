import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { WalletManager } from '@/components/wallet/WalletManager'
import { useState } from 'react'
import { Shield, Bell, Database, Search, Plus } from 'lucide-react'
import { externalAddressApi, entityApi } from '@/lib/api'

export function SettingsPage() {
  const [rpcConfig, setRpcConfig] = useState({
    host: '127.0.0.1',
    port: '15443',
    user: '',
    password: '',
  })

  // External Address states
  const [showExternalForm, setShowExternalForm] = useState(false)
  const [externalAddress, setExternalAddress] = useState('')
  const [externalName, setExternalName] = useState('')
  const [externalLoading, setExternalLoading] = useState(false)
  const [externalError, setExternalError] = useState<string | null>(null)
  const [externalSuccess, setExternalSuccess] = useState<string | null>(null)

  const handleAddExternalAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!externalAddress.trim() || !externalName.trim()) return

    setExternalLoading(true)
    setExternalError(null)
    setExternalSuccess(null)

    try {
      // First, try to fetch UTXOs to validate the address
      const utxoResult = await externalAddressApi.getUTXOs(externalAddress.trim())

      // Then save as entity (known address)
      await entityApi.create({
        address: externalAddress.trim(),
        name: externalName.trim(),
        entity_type: 'unknown',
        risk_level: 'medium',
        source: 'user',
      })

      setExternalSuccess(`Endereço adicionado: ${externalName} (${utxoResult.count} UTXOs encontrados)`)
      setExternalAddress('')
      setExternalName('')
      setShowExternalForm(false)
    } catch (err: any) {
      setExternalError(err.response?.data?.detail || 'Erro ao adicionar endereço')
    } finally {
      setExternalLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Configurações</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Configurações do sistema e ligação Bitcoin Core
        </p>
      </div>

      {externalSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 text-sm">{externalSuccess}</p>
        </div>
      )}

      {externalError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{externalError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WalletManager />

        <Card title="Endereços Externos" subtitle="Gerir endereços Bitcoin externos">
          {!showExternalForm ? (
            <div className="space-y-4">
              <p className="text-sm text-[#6B6B6B]">
                Adiciona endereços Bitcoin externos para consultar UTXOs e monitorizar.
              </p>
              <Button
                onClick={() => setShowExternalForm(true)}
                className="w-full flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                Adicionar Endereço Externo
              </Button>
            </div>
          ) : (
            <form onSubmit={handleAddExternalAddress} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0A0A0A] mb-2">
                  Endereço Bitcoin
                </label>
                <input
                  type="text"
                  value={externalAddress}
                  onChange={(e) => setExternalAddress(e.target.value)}
                  placeholder="bc1q... ou 1... ou 3..."
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5533] font-mono text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0A0A0A] mb-2">
                  Nome/Label
                </label>
                <input
                  type="text"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  placeholder="Ex: Exchange Binance, Mixer, etc."
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5533]"
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={externalLoading}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  {externalLoading ? 'A adicionar...' : (
                    <>
                      <Plus className="w-4 h-4" />
                      Adicionar
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowExternalForm(false)
                    setExternalAddress('')
                    setExternalName('')
                    setExternalError(null)
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card title="Bitcoin Core RPC" subtitle="Configuração do nó">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Host"
                value={rpcConfig.host}
                onChange={(e) =>
                  setRpcConfig({ ...rpcConfig, host: e.target.value })
                }
              />
              <Input
                label="Porta"
                value={rpcConfig.port}
                onChange={(e) =>
                  setRpcConfig({ ...rpcConfig, port: e.target.value })
                }
              />
            </div>
            <Input
              label="Utilizador"
              value={rpcConfig.user}
              onChange={(e) =>
                setRpcConfig({ ...rpcConfig, user: e.target.value })
              }
            />
            <Input
              label="Password"
              type="password"
              value={rpcConfig.password}
              onChange={(e) =>
                setRpcConfig({ ...rpcConfig, password: e.target.value })
              }
            />
            <Button className="w-full">Guardar Configuração</Button>
          </div>
        </Card>

        <Card title="Preferências" subtitle="Configurações da carteira">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[#F8F8F8] rounded-xl border border-[#E8E8E8]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FF5533]/10 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-[#FF5533]" />
                </div>
                <div>
                  <p className="font-medium text-[#0A0A0A]">Notificações</p>
                  <p className="text-sm text-[#6B6B6B]">
                    Alertas em tempo real via WebSocket
                  </p>
                </div>
              </div>
              <Badge variant="safe">Ativo</Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#F8F8F8] rounded-xl border border-[#E8E8E8]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0A0A0A]/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#0A0A0A]" />
                </div>
                <div>
                  <p className="font-medium text-[#0A0A0A]">Modo Paranóico</p>
                  <p className="text-sm text-[#6B6B6B]">
                    Tor obrigatório, nó próprio obrigatório
                  </p>
                </div>
              </div>
              <Badge variant="outline">Desligado</Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#F8F8F8] rounded-xl border border-[#E8E8E8]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-[#2563eb]" />
                </div>
                <div>
                  <p className="font-medium text-[#0A0A0A]">Cache Local</p>
                  <p className="text-sm text-[#6B6B6B]">
                    Armazenar dados de UTXOs localmente
                  </p>
                </div>
              </div>
              <Badge variant="safe">Ativo</Badge>
            </div>
          </div>
        </Card>

        <Card title="Acerca" subtitle="Informações do sistema">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-[#F0F0F0]">
              <span className="text-[#6B6B6B]">Versão:</span>
              <span className="font-medium text-[#0A0A0A]">0.1.0</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#F0F0F0]">
              <span className="text-[#6B6B6B]">Backend:</span>
              <span className="font-medium text-[#0A0A0A]">FastAPI + Bitcoin Core RPC</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#F0F0F0]">
              <span className="text-[#6B6B6B]">Frontend:</span>
              <span className="font-medium text-[#0A0A0A]">React + TypeScript + Vite</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#6B6B6B]">Licença:</span>
              <span className="font-medium text-[#0A0A0A]">MIT</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
