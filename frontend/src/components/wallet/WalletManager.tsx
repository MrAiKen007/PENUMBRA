import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useStore } from '@/store/useStore'
import { walletApi } from '@/lib/api'
import { Wallet, Plus, Copy, AlertCircle, CheckCircle2 } from 'lucide-react'

export function WalletManager() {
  const { currentWallet, wallets, setCurrentWallet, setWallets, setWalletBalance } = useStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newWalletName, setNewWalletName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newAddress, setNewAddress] = useState<string | null>(null)
  const [loadedWallets, setLoadedWallets] = useState<string[]>([])

  const loadWallets = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await walletApi.list()
      setWallets(data.wallets)
      setLoadedWallets(data.loaded || [])
      setCurrentWallet(data.current)
      if (data.current) {
        const balanceData = await walletApi.getBalance()
        setWalletBalance(balanceData.balance)
      }
    } catch (err) {
      setError('Erro ao carregar carteiras')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadWallets()
  }, [])

  const handleCreateWallet = async () => {
    if (!newWalletName.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      await walletApi.create(newWalletName.trim())
      setNewWalletName('')
      setShowCreateForm(false)
      await loadWallets()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar carteira')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadWallet = async (name: string) => {
    setIsLoading(true)
    setError(null)
    try {
      // Always call load API - backend handles "already loaded" case
      const result = await walletApi.load(name)
      console.log('Load wallet result:', result)
      
      // Add to loaded wallets if not already there
      if (!loadedWallets.includes(name)) {
        setLoadedWallets([...loadedWallets, name])
      }
      
      // Set as current and fetch balance
      setCurrentWallet(name)
      const balanceData = await walletApi.getBalance()
      setWalletBalance(balanceData.balance)
    } catch (err: any) {
      console.error('Load wallet error:', err)
      setError(err.response?.data?.detail || 'Erro ao carregar carteira')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGetNewAddress = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await walletApi.getNewAddress()
      setNewAddress(data.address)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar endereço')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Card title="Gestão de Carteiras" subtitle="Criar e gerir carteiras Bitcoin">
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-[#e02020]/10 border border-[#e02020]/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-[#e02020]" />
            <span className="text-sm text-[#e02020]">{error}</span>
          </div>
        )}

        {currentWallet && (
          <div className="p-4 bg-[#16a34a]/5 border border-[#16a34a]/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-[#16a34a]" />
              <span className="font-medium text-[#0A0A0A]">Carteira Ativa</span>
              <Badge variant="safe">Activa</Badge>
            </div>
            <p className="text-lg font-semibold text-[#0A0A0A]">{currentWallet}</p>
          </div>
        )}

        {showCreateForm ? (
          <div className="p-4 bg-[#F5F5F5] rounded-lg space-y-3">
            <label className="block text-sm font-medium text-[#0A0A0A]">
              Nome da Carteira
            </label>
            <input
              type="text"
              value={newWalletName}
              onChange={(e) => setNewWalletName(e.target.value)}
              placeholder="ex: minha-carteira"
              className="w-full px-3 py-2 border border-[#E0E0E0] bg-white rounded-md text-sm text-[#0A0A0A] placeholder:text-[#9B9B9B] focus:outline-none focus:ring-2 focus:ring-[#FF5533]/30 focus:border-[#FF5533]/50"
            />
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleCreateWallet}
                disabled={!newWalletName.trim() || isLoading}
              >
                <Plus className="w-4 h-4 mr-1" />
                Criar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(true)}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Carteira
          </Button>
        )}

        {wallets.length > 0 && (
          <div className="space-y-4">
            {/* Loaded wallets section */}
            {loadedWallets.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-[#16a34a] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Carteiras Carregadas
                </h4>
                {wallets
                  .filter((w) => loadedWallets.includes(w.name))
                  .map((wallet) => (
                    <div
                      key={wallet.name}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        currentWallet === wallet.name
                          ? 'bg-[#16a34a]/5 border-[#16a34a]/30'
                          : 'bg-white border-[#16a34a]/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-[#16a34a]" />
                        <span className="text-sm font-medium text-[#0A0A0A]">
                          {wallet.name}
                        </span>
                        {currentWallet === wallet.name ? (
                          <Badge variant="safe">Activa</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[#16a34a] border-[#16a34a]/30">Carregada</Badge>
                        )}
                      </div>
                      {currentWallet !== wallet.name && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadWallet(wallet.name)}
                          disabled={isLoading}
                          className="border-[#16a34a]/30 text-[#16a34a] hover:bg-[#16a34a]/10"
                        >
                          Selecionar
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Not loaded wallets section */}
            {wallets.filter((w) => !loadedWallets.includes(w.name)).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-[#6B6B6B]">Carteiras para Carregar</h4>
                {wallets
                  .filter((w) => !loadedWallets.includes(w.name))
                  .map((wallet) => (
                    <div
                      key={wallet.name}
                      className="flex items-center justify-between p-3 rounded-lg border bg-white border-[#E0E0E0]"
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-[#6B6B6B]" />
                        <span className="text-sm font-medium text-[#0A0A0A]">
                          {wallet.name}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLoadWallet(wallet.name)}
                        disabled={isLoading}
                      >
                        Carregar
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {currentWallet && (
          <div className="pt-4 border-t border-[#E0E0E0]">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGetNewAddress}
              disabled={isLoading}
              className="w-full"
            >
              Gerar Novo Endereço
            </Button>

            {newAddress && (
              <div className="mt-3 p-3 bg-[#F5F5F5] rounded-lg">
                <p className="text-xs text-[#6B6B6B] mb-1">Novo Endereço:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-[#E0E0E0] break-all">
                    {newAddress}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(newAddress)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
