import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '@/store/useStore'
import type { WebSocketMessage, Alert } from '@/types'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { addAlert } = useStore()

  const connect = useCallback(() => {
    const wsUrl = `ws://${window.location.host}/api/ws/alerts`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        handleMessage(message)
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
      // Reconnect after 3 seconds
      setTimeout(() => connect(), 3000)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    wsRef.current = ws
  }, [])

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case 'alert':
          addAlert(message.data as Alert)
          break
        case 'system':
          console.log('System message:', message.data)
          break
        case 'transaction_received':
          console.log('Transaction received:', message.data)
          break
        default:
          console.log('Unknown message type:', message)
      }
    },
    [addAlert]
  )

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return { isConnected }
}
