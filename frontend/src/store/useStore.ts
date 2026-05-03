import { create } from 'zustand'
import type { UTXO, Alert, AlertSummary, GraphData, CoinControlResult, WalletInfo } from '@/types'

interface AppState {
  // UTXOs
  utxos: UTXO[]
  selectedUtxos: string[]
  setUtxos: (utxos: UTXO[]) => void
  setSelectedUtxos: (ids: string[]) => void
  toggleUtxo: (id: string) => void

  // Alerts
  alerts: Alert[]
  alertSummary: AlertSummary | null
  setAlerts: (alerts: Alert[]) => void
  setAlertSummary: (summary: AlertSummary) => void
  addAlert: (alert: Alert) => void
  acknowledgeAlert: (id: string) => void

  // Graph
  currentGraph: GraphData | null
  setCurrentGraph: (graph: GraphData | null) => void

  // Coin Control
  lastPsbt: CoinControlResult | null
  setLastPsbt: (psbt: CoinControlResult | null) => void

  // Wallet
  currentWallet: string | null
  wallets: WalletInfo[]
  walletBalance: number
  setCurrentWallet: (wallet: string | null) => void
  setWallets: (wallets: WalletInfo[]) => void
  setWalletBalance: (balance: number) => void

  // UI
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
}

export const useStore = create<AppState>((set) => ({
  // UTXOs
  utxos: [],
  selectedUtxos: [],
  setUtxos: (utxos) => set({ utxos }),
  setSelectedUtxos: (ids) => set({ selectedUtxos: ids }),
  toggleUtxo: (id) =>
    set((state) => ({
      selectedUtxos: state.selectedUtxos.includes(id)
        ? state.selectedUtxos.filter((u) => u !== id)
        : [...state.selectedUtxos, id],
    })),

  // Alerts
  alerts: [],
  alertSummary: null,
  setAlerts: (alerts) => set({ alerts }),
  setAlertSummary: (summary) => set({ alertSummary: summary }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
    })),
  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      ),
    })),

  // Graph
  currentGraph: null,
  setCurrentGraph: (graph) => set({ currentGraph: graph }),

  // Coin Control
  lastPsbt: null,
  setLastPsbt: (psbt) => set({ lastPsbt: psbt }),

  // Wallet
  currentWallet: null,
  wallets: [],
  walletBalance: 0,
  setCurrentWallet: (wallet) => set({ currentWallet: wallet }),
  setWallets: (wallets) => set({ wallets }),
  setWalletBalance: (balance) => set({ walletBalance: balance }),

  // UI
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  error: null,
  setError: (error) => set({ error }),
}))
