import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { WalletManager } from '@/components/wallet/WalletManager'
import { useState } from 'react'
import { Shield, Bell, Database } from 'lucide-react'

export function SettingsPage() {
  const [rpcConfig, setRpcConfig] = useState({
    host: '127.0.0.1',
    port: '15443',
    user: '',
    password: '',
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Configurações</h1>
        <p className="text-[#6B6B6B] mt-1.5 text-sm">
          Configurações do sistema e ligação Bitcoin Core
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WalletManager />

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
