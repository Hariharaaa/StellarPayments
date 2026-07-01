import { useState, useCallback } from 'react'
import confetti from 'canvas-confetti'
import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getPublicKey,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api'
import {
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk'

const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const server = new Horizon.Server(HORIZON_URL)

function isValidStellarAddress(addr) {
  return /^G[A-Z2-7]{55}$/.test(addr)
}

export default function App() {
  const [publicKey, setPublicKey] = useState(null)
  const [network, setNetwork] = useState(null)
  const [balance, setBalance] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [txResult, setTxResult] = useState(null) // { status: 'success' | 'error', message, hash }
  const [connectError, setConnectError] = useState(null)

  const fetchBalance = useCallback(async (pubKey) => {
    setBalanceLoading(true)
    try {
      const account = await server.loadAccount(pubKey)
      const xlm = account.balances.find((b) => b.asset_type === 'native')
      setBalance(xlm ? xlm.balance : '0')
    } catch (err) {
      // Account not found on testnet usually means it isn't funded yet
      if (err?.response?.status === 404) {
        setBalance('0 (unfunded — use Friendbot to fund this address)')
      } else {
        setBalance(null)
      }
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  const connectWallet = async () => {
    setConnectError(null)
    try {
      const connected = await isConnected()
      if (!connected) {
        setConnectError('Freighter extension not detected. Please install it from freighter.app.')
        return
      }

      const allowed = await isAllowed()
      if (!allowed) {
        await setAllowed()
      }

      await requestAccess()
      
      const pubKey = await getPublicKey()

      const networkName = await getNetwork()
      setNetwork(networkName)

      if (networkName !== 'TESTNET') {
        setConnectError(
          `Freighter is set to ${networkName}. Switch Freighter to Test Net in its settings, then reconnect.`
        )
      }

      setPublicKey(pubKey)
      await fetchBalance(pubKey)
    } catch (err) {
      setConnectError(err?.message || 'Failed to connect wallet.')
    }
  }

  const disconnectWallet = () => {
    setPublicKey(null)
    setBalance(null)
    setNetwork(null)
    setTxResult(null)
    setConnectError(null)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    setTxResult(null)

    if (!publicKey) {
      setTxResult({ status: 'error', message: 'Connect your wallet first.' })
      return
    }
    if (!isValidStellarAddress(destination)) {
      setTxResult({ status: 'error', message: 'Enter a valid Stellar public address (starts with G).' })
      return
    }
    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      setTxResult({ status: 'error', message: 'Enter a valid amount greater than 0.' })
      return
    }

    setSending(true)
    try {
      const sourceAccount = await server.loadAccount(publicKey)

      let isDestinationFunded = false;
      try {
        await server.loadAccount(destination);
        isDestinationFunded = true;
      } catch (err) {
        if (err?.response?.status === 404) {
          isDestinationFunded = false;
        } else {
          throw err;
        }
      }

      const operation = isDestinationFunded 
        ? Operation.payment({
            destination,
            asset: Asset.native(),
            amount: amountNum.toFixed(7),
          })
        : Operation.createAccount({
            destination,
            startingBalance: amountNum.toFixed(7),
          });

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(60)
        .build()

      const xdr = transaction.toXDR()

      const signResult = await signTransaction(xdr, {
        networkPassphrase: Networks.TESTNET,
      })

      const signedTx = TransactionBuilder.fromXDR(signResult, Networks.TESTNET)

      const submitResult = await server.submitTransaction(signedTx)

      setTxResult({
        status: 'success',
        message: 'Transaction confirmed on Stellar testnet.',
        hash: submitResult.hash,
      })

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6fd3a0', '#e8b86d', '#ffffff']
      })

      setAmount('')
      setDestination('')
      await fetchBalance(publicKey)
    } catch (err) {
      const extras = err?.response?.data?.extras?.result_codes
      const detail = extras ? JSON.stringify(extras) : err?.message
      setTxResult({ status: 'error', message: detail || 'Transaction failed. Please try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✺</span>
          <span className="brand-name">Testnet Payments</span>
        </div>
        <span className="network-chip">{network ? network : 'not connected'}</span>
      </header>

      <main className="container">
        <section className="panel wallet-panel">
          <h1>Send XLM on Stellar Testnet</h1>
          <p className="subtitle">
            Connect Freighter, check your balance, and send a testnet payment — all from one screen.
          </p>

          {!publicKey ? (
            <button className="btn primary" onClick={connectWallet}>
              Connect Freighter
            </button>
          ) : (
            <div className="wallet-info">
              <div className="wallet-row">
                <span className="label">Address</span>
                <code className="address" title={publicKey}>
                  {publicKey.slice(0, 6)}…{publicKey.slice(-6)}
                </code>
              </div>
              <div className="wallet-row">
                <span className="label">Balance</span>
                <span className="balance">
                  {balanceLoading ? 'Loading…' : balance !== null ? `${balance} XLM` : '—'}
                </span>
              </div>
              <div className="wallet-actions">
                <button className="btn ghost" onClick={() => fetchBalance(publicKey)} disabled={balanceLoading}>
                  Refresh balance
                </button>
                <button className="btn ghost danger" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {connectError && <p className="error-text">{connectError}</p>}
        </section>

        {publicKey && (
          <section className="panel send-panel">
            <h2>Send a payment</h2>
            <form onSubmit={handleSend} className="send-form">
              <label>
                Destination address
                <input
                  type="text"
                  placeholder="G..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value.trim())}
                  disabled={sending}
                />
              </label>
              <label>
                Amount (XLM)
                <input
                  type="number"
                  step="0.0000001"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={sending}
                />
              </label>
              <button className="btn primary" type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send payment'}
              </button>
            </form>

            {txResult && (
              <div className={`tx-feedback ${txResult.status}`}>
                <p>{txResult.message}</p>
                {txResult.hash && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txResult.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Stellar Expert: {txResult.hash.slice(0, 10)}…
                  </a>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="footnote">
          Stellar Testnet only. Fund your address via{' '}
          <a href="https://laboratory.stellar.org/#account-creator?network=test" target="_blank" rel="noreferrer">
            Friendbot
          </a>
          .
        </footer>
      </main>
    </div>
  )
}
