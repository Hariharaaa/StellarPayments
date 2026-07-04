import { createContext, useContext, useState, useCallback } from 'react'
import freighterApi from '@stellar/freighter-api'

// StellarWalletsKit v2.5.0 — singleton static class API
let kitReady = false
let Kit = null

class CustomFreighterModule {
  moduleType = "hot_wallet"
  productId = "freighter"
  productName = "Freighter"
  productUrl = "https://freighter.app"
  productIcon = "data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23000'/%3E%3Cpath d='M73.5 35.5h-47L50 59l23.5-23.5z' fill='%23fff'/%3E%3C/svg%3E"

  async isAvailable() {
    try {
      const res = await freighterApi.isConnected()
      return !res.error && res.isConnected
    } catch {
      return false
    }
  }
  async getNetwork() {
    const res = await freighterApi.getNetwork()
    if (res.error) throw new Error(res.error)
    return res.network
  }
  async getAddress() {
    await freighterApi.requestAccess()
    const res = await freighterApi.getAddress()
    if (res.error) throw new Error(res.error)
    return { address: res.address }
  }
  async signTransaction(xdr, opts) {
    const freighterOpts = {
      network: opts?.network || (opts?.networkPassphrase?.includes('Test') ? 'TESTNET' : 'PUBLIC'),
      networkPassphrase: opts?.networkPassphrase,
      accountToSign: opts?.address || opts?.accountToSign,
    }
    const res = await freighterApi.signTransaction(xdr, freighterOpts)
    if (res.error) throw new Error(res.error)
    return { signedTxXdr: res.signedTxXdr || res.signedTransaction }
  }
}

async function ensureKit() {
  if (kitReady) return Kit
  try {
    const sdkMod = await import('@creit.tech/stellar-wallets-kit/sdk')
    const xBullMod = await import('@creit.tech/stellar-wallets-kit/modules/xbull')
    Kit = sdkMod.StellarWalletsKit

    // Initialize with both our custom Freighter module and the standard xBull module
    Kit.init({
      modules: [
        new CustomFreighterModule(),
        new xBullMod.xBullModule()
      ],
      network: 'Test SDF Network ; September 2015',
    })
    kitReady = true
    return Kit
  } catch (e) {
    console.error('Wallet kit init error:', e)
    throw new Error('Could not initialize wallet kit: ' + e.message)
  }
}

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [walletError, setWalletError] = useState(null)

  const connect = useCallback(async () => {
    setConnecting(true)
    setWalletError(null)
    try {
      const kit = await ensureKit()

      // authModal opens the wallet selector modal and returns the connected address directly
      const { address: addr } = await kit.authModal()
      if (!addr) {
        throw new Error('No address returned from wallet connection')
      }
      setAddress(addr)
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg.includes('not found') || msg.includes('install') || msg.includes('not installed')) {
        setWalletError('Wallet extension not found. Please install Freighter or xBull.')
      } else if (msg.includes('reject') || msg.includes('cancel') || msg.includes('denied') || msg.includes('User declined') || msg.includes('rejected')) {
        setWalletError('Action cancelled — you rejected the request in your wallet')
      } else {
        setWalletError('Wallet connection failed: ' + msg)
      }
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      const kit = await ensureKit()
      await kit.disconnect()
    } catch {}
    setAddress(null)
    setWalletError(null)
  }, [])

  const signTransaction = useCallback(async (xdr, opts) => {
    const kit = await ensureKit()
    try {
      const { signedTxXdr } = await kit.signTransaction(xdr, opts)
      return signedTxXdr
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg.includes('reject') || msg.includes('cancel') || msg.includes('denied') || msg.includes('declined') || msg.includes('rejected')) {
        throw Object.assign(new Error('Action cancelled — you rejected the request in your wallet'), { code: 'USER_REJECTED' })
      }
      throw new Error('Signing failed: ' + msg)
    }
  }, [])

  return (
    <WalletContext.Provider value={{
      address,
      connecting,
      walletError,
      setWalletError,
      connect,
      disconnect,
      signTransaction,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}
