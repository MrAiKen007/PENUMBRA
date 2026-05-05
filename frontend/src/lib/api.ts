import axios from 'axios'
import type {
  UTXO,
  UTXOSelectionSuggestion,
  CoinControlRequest,
  CoinControlResult,
  GraphData,
  ForensicReport,
  ForensicGraphResponse,
  Alert,
  AlertSummary,
  WalletInfo,
  WalletListResponse,
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// UTXO API
export const utxoApi = {
  getAll: async (): Promise<{ utxos: UTXO[]; count: number }> => {
    const { data } = await api.get('/utxos')
    return data
  },

  score: async (utxoIds: string[]): Promise<{ score: number; utxos: string[] }> => {
    const { data } = await api.post('/privacy/score', utxoIds)
    return data
  },
}

// Coin Control API
export const coinControlApi = {
  buildPSBT: async (request: CoinControlRequest): Promise<CoinControlResult> => {
    const { data } = await api.post('/psbt/build', request)
    return data
  },

  suggest: async (address: string, amountSats: number): Promise<UTXOSelectionSuggestion> => {
    const { data } = await api.get('/psbt/suggest', {
      params: { address, amount_sats: amountSats },
    })
    return data
  },
}

// Graph API
export const graphApi = {
  getGraph: async (
    address: string,
    depth = 2,
    maxNodes = 100,
    wallet?: string
  ): Promise<GraphData> => {
    const { data } = await api.get(`/graph/${address}`, {
      params: { depth, max_nodes: maxNodes, wallet },
    })
    return data
  },

  getForensicGraph: async (
    address: string,
    depth = 2,
    maxNodes = 100,
    forensic = true,
    wallet?: string
  ): Promise<ForensicGraphResponse> => {
    const { data } = await api.get(`/graph/${address}/forensic`, {
      params: { depth, max_nodes: maxNodes, forensic, wallet },
      timeout: 60000, // 60 seconds timeout for forensic analysis
    })
    return data
  },

  getForensicAnalysis: async (
    address: string,
    maxTransactions = 50,
    wallet?: string
  ): Promise<ForensicReport> => {
    const { data } = await api.get(`/forensic/analyze/${address}`, {
      params: { max_transactions: maxTransactions, wallet },
    })
    return data
  },
}

// Alerts API
export const alertApi = {
  getAll: async (): Promise<{ alerts: Alert[] }> => {
    const { data } = await api.get('/alerts')
    return data
  },

  getSummary: async (): Promise<AlertSummary> => {
    const { data } = await api.get('/alerts/summary')
    return data
  },

  analyze: async (txid: string): Promise<{ txid: string; alerts: Alert[] }> => {
    const { data } = await api.post(`/alerts/analyze/${txid}`)
    return data
  },
}

// Wallet API
export const walletApi = {
  list: async (): Promise<WalletListResponse> => {
    const { data } = await api.get('/wallet/list')
    return data
  },

  create: async (name: string, passphrase?: string): Promise<{ name: string; warning?: string }> => {
    const { data } = await api.post('/wallet/create', { name, passphrase })
    return data
  },

  load: async (name: string): Promise<{ name: string; loaded: boolean }> => {
    const { data } = await api.post('/wallet/load', { name })
    return data
  },

  unload: async (name?: string): Promise<{ name: string; unloaded: boolean }> => {
    const { data } = await api.post('/wallet/unload', null, { params: { wallet_name: name } })
    return data
  },

  getInfo: async (): Promise<WalletInfo> => {
    const { data } = await api.get('/wallet/info')
    return data
  },

  getBalance: async (): Promise<{ balance: number; currency: string }> => {
    const { data } = await api.get('/wallet/balance')
    return data
  },

  getNewAddress: async (label?: string, addressType: string = 'bech32m'): Promise<{ address: string; label?: string; type: string }> => {
    const { data } = await api.get('/wallet/address/new', { params: { label, address_type: addressType } })
    return data
  },

  getChangeAddress: async (addressType: string = 'bech32m'): Promise<{ address: string; type: string }> => {
    const { data } = await api.get('/wallet/address/change', { params: { address_type: addressType } })
    return data
  },

  getAddresses: async (): Promise<{ addresses: Array<{ address: string; label: string; txids: string[]; amount: number }> }> => {
    const { data } = await api.get('/wallet/addresses')
    return data
  },
}

export default api
