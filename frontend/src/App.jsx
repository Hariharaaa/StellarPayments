import { useState, useEffect, useCallback } from 'react'
import { useWallet } from './context/WalletContext'
import {
  getWalletBalance,
  getFundBalance,
  getRecipients,
  getDisbursementHistory,
  donate,
  registerRecipient,
  disburse,
  formatXlm
} from './stellar'
import { ADMIN_ADDRESS, STELLAR_EXPERT_URL, MAX_DISBURSEMENT_CAP } from './config'
import TransactionModal from './components/TransactionModal'
import {
  Heart,
  History,
  UserPlus,
  ArrowRight,
  ExternalLink,
  Lock,
  RefreshCw,
  LogOut,
  Wallet,
  Coins,
  AlertTriangle,
  Users,
  Shield,
  MapPin,
  FileText
} from 'lucide-react'

export default function App() {
  const {
    address,
    connecting,
    walletError,
    setWalletError,
    connect,
    disconnect,
    signTransaction
  } = useWallet()

  // Tab views: 'donor' or 'admin'
  const [activeTab, setActiveTab] = useState('donor')

  // Balances
  const [walletBalance, setWalletBalance] = useState('0.0000')
  const [fundBalance, setFundBalance] = useState('0.0000')

  // Lists
  const [recipients, setRecipients] = useState([])
  const [history, setHistory] = useState([])

  // Form Inputs
  const [donateAmount, setDonateAmount] = useState('')
  const [newRecipientAddr, setNewRecipientAddr] = useState('')
  const [newRecipientRegion, setNewRecipientRegion] = useState('')
  const [newRecipientVerifyId, setNewRecipientVerifyId] = useState('')
  const [disburseRecipient, setDisburseRecipient] = useState('')
  const [disburseAmount, setDisburseAmount] = useState('')

  // Tx Status State
  const [txStage, setTxStage] = useState(null) // 'Preparing' | 'Signing' | 'Submitting' | 'Pending' | 'Success' | 'Failed'
  const [txHash, setTxHash] = useState(null)
  const [txError, setTxError] = useState(null)

  // Fetch all on-chain data
  const refreshData = useCallback(async () => {
    try {
      // 1. Contract Balance
      const fBalance = await getFundBalance()
      setFundBalance(formatXlm(fBalance, 4))

      // 2. Recipients Details (includes region, verificationId, totalReceived, verified)
      const rList = await getRecipients()
      setRecipients(rList)

      // 3. Disbursement History
      const hList = await getDisbursementHistory()
      setHistory(hList)

      // 4. Wallet Balance (if connected)
      if (address) {
        const wBalance = await getWalletBalance(address)
        setWalletBalance(Number(wBalance).toFixed(4))
      }
    } catch (e) {
      console.error('Data refresh error:', e)
    }
  }, [address])

  // Polling every 5 seconds
  useEffect(() => {
    refreshData()
    const interval = setInterval(refreshData, 5000)
    return () => clearInterval(interval)
  }, [refreshData])

  // Clear inputs helper
  const clearInputs = () => {
    setDonateAmount('')
    setNewRecipientAddr('')
    setNewRecipientRegion('')
    setNewRecipientVerifyId('')
    setDisburseRecipient('')
    setDisburseAmount('')
  }

  // Handle donation
  const handleDonate = async (e) => {
    e.preventDefault()
    if (!address) return
    setWalletError(null)
    setTxError(null)
    setTxHash(null)
    setTxStage('Preparing')

    try {
      // Gas/Balance pre-check: Check if donor's wallet has enough XLM
      const wBal = await getWalletBalance(address)
      if (Number(wBal) < Number(donateAmount)) {
        throw Object.assign(new Error('Your wallet has insufficient balance to cover this donation.'), { code: 'INSUFFICIENT_BALANCE' })
      }

      await donate({
        donorAddress: address,
        amountXlm: donateAmount,
        signTransaction,
        onStatus: ({ stage, hash }) => {
          setTxStage(stage)
          if (hash) setTxHash(hash)
        }
      })
      
      setTxStage('Success')
      clearInputs()
      refreshData()
    } catch (err) {
      console.error('Donate error:', err)
      setTxStage('Failed')
      setTxError(err.message || String(err))
    }
  }

  // Handle register recipient
  const handleRegisterRecipient = async (e) => {
    e.preventDefault()
    if (!address) return
    setWalletError(null)
    setTxError(null)
    setTxHash(null)
    setTxStage('Preparing')

    try {
      await registerRecipient({
        adminAddress: address,
        recipientAddress: newRecipientAddr,
        region: newRecipientRegion,
        verificationId: newRecipientVerifyId,
        signTransaction,
        onStatus: ({ stage, hash }) => {
          setTxStage(stage)
          if (hash) setTxHash(hash)
        }
      })

      setTxStage('Success')
      clearInputs()
      refreshData()
    } catch (err) {
      console.error('Register recipient error:', err)
      setTxStage('Failed')
      setTxError(err.message || String(err))
    }
  }

  // Handle disburse aid
  const handleDisburse = async (e) => {
    e.preventDefault()
    if (!address) return
    setWalletError(null)
    setTxError(null)
    setTxHash(null)
    setTxStage('Preparing')

    try {
      // 1. Pre-check: Ensure Relief Fund has sufficient balance to disburse
      const fBalance = await getFundBalance()
      const fBalanceXlm = Number(fBalance) / 10_000_000
      if (fBalanceXlm < Number(disburseAmount)) {
        throw Object.assign(new Error('The Relief Fund does not have enough balance to fulfill this disbursement.'), { code: 'INSUFFICIENT_FUND_BALANCE' })
      }

      // 2. Pre-check: Verify max cap of selected recipient is not exceeded
      const target = recipients.find(r => r.recipient === disburseRecipient)
      if (target) {
        const totalReceivedXlm = Number(target.totalReceived) / 10_000_000
        if (totalReceivedXlm + Number(disburseAmount) > MAX_DISBURSEMENT_CAP) {
          throw Object.assign(new Error(`Disbursement cap exceeded. The maximum cap per recipient is ${MAX_DISBURSEMENT_CAP} XLM. Selected recipient already received ${totalReceivedXlm} XLM.`), { code: 'CAP_EXCEEDED' })
        }
      }

      await disburse({
        adminAddress: address,
        recipientAddress: disburseRecipient,
        amountXlm: disburseAmount,
        signTransaction,
        onStatus: ({ stage, hash }) => {
          setTxStage(stage)
          if (hash) setTxHash(hash)
        }
      })

      setTxStage('Success')
      clearInputs()
      refreshData()
    } catch (err) {
      console.error('Disburse error:', err)
      setTxStage('Failed')
      setTxError(err.message || String(err))
    }
  }

  // Check if current connected user is the registered admin/org
  const isAdmin = address === ADMIN_ADDRESS

  return (
    <div className="container">
      {/* HEADER SECTION */}
      <header className="header">
        <div className="brand">
          <Coins className="brand-icon" />
          <div>
            <h1 className="brand-title">Relief Rail</h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: '700', textTransform: 'uppercase', marginTop: '2px' }}>
              Direct Aid Portal
            </p>
          </div>
        </div>

        <div>
          {address ? (
            <button className="btn-wallet connected" onClick={disconnect}>
              <Wallet size={16} />
              <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
              <LogOut size={14} style={{ marginLeft: '4px' }} />
            </button>
          ) : (
            <button className="btn-wallet" onClick={connect} disabled={connecting}>
              <Wallet size={16} />
              <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
            </button>
          )}
        </div>
      </header>

      {/* ERROR MESSAGE NOTIFICATION */}
      {walletError && (
        <div className="alert alert-error">
          <AlertTriangle className="alert-icon" />
          <div>
            <p style={{ fontWeight: 600 }}>Wallet Error</p>
            <p>{walletError}</p>
          </div>
        </div>
      )}

      {/* DASHBOARD GRID */}
      <div className="dashboard-grid">
        {/* LEFT COLUMN: INTERACTION PANELS */}
        <main className="left-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* AVAILABLE FUNDS DISPLAY */}
          <section className="card funds-display">
            <h2 className="funds-title">Active Relief Fund Balance</h2>
            <p className="funds-amount">
              {fundBalance} <span className="funds-symbol">XLM</span>
            </p>
            <div className="funds-info">
              <RefreshCw size={14} className="spin-on-update" />
              <span>Synced live with Soroban Testnet smart contract</span>
            </div>
            {address && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '2px solid #5C5657', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: '700' }}>Your Wallet Balance:</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-white)', fontSize: '1.1rem', fontWeight: '800' }}>{walletBalance} XLM</strong>
              </div>
            )}
          </section>

          {/* VIEW SWITCHING TABS */}
          <nav className="tabs-nav">
            <button 
              className={`tab-btn ${activeTab === 'donor' ? 'active' : ''}`}
              onClick={() => setActiveTab('donor')}
            >
              <Heart size={16} />
              <span>Donor Portal</span>
            </button>
            <button 
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <Lock size={16} />
              <span>Admin Organization Portal</span>
            </button>
          </nav>

          {/* DONOR TAB VIEW */}
          {activeTab === 'donor' && (
            <section className="card">
              <h3 className="card-title"><Heart size={20} style={{ color: 'var(--primary)' }} /> Make a Direct Donation</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Donated funds flow securely into the transparent Soroban contract, ready to be disbursed directly to registered aid recipients without middlemen.
              </p>

              {!address ? (
                <div className="empty-placeholder">
                  <Wallet className="empty-icon" />
                  <p>Please connect your wallet to make a donation.</p>
                  <button className="btn btn-primary" onClick={connect} style={{ maxWidth: '200px', marginTop: '0.5rem' }}>Connect Wallet</button>
                </div>
              ) : (
                <form onSubmit={handleDonate}>
                  <div className="form-group">
                    <label className="form-label">Donation Amount (XLM)</label>
                    <input 
                      type="number" 
                      step="0.0001" 
                      min="0.0001" 
                      required
                      placeholder="e.g. 50" 
                      className="form-input"
                      value={donateAmount}
                      onChange={(e) => setDonateAmount(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    <span>Donate to Relief Fund</span>
                    <ArrowRight size={16} />
                  </button>
                </form>
              )}
            </section>
          )}

          {/* ADMIN/ORGANIZATION TAB VIEW */}
          {activeTab === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* ADMIN LOCK NOTICE */}
              {address && !isAdmin && (
                <div className="alert alert-info">
                  <Lock className="alert-icon" />
                  <div>
                    <p style={{ fontWeight: 600 }}>Viewing Mode Only</p>
                    <p>Your connected wallet is not the authorized Admin Organization. Admin tools will fail simulation.</p>
                  </div>
                </div>
              )}

              {/* REGISTER RECIPIENT */}
              <section className="card">
                <h3 className="card-title"><UserPlus size={20} style={{ color: 'var(--primary)' }} /> Register Verified Recipient</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Register verified recipient wallet addresses and regions to make them eligible for relief payouts. Only the Admin can invoke this.
                </p>

                {!address ? (
                  <div className="empty-placeholder">
                    <Wallet className="empty-icon" />
                    <p>Connect your admin wallet to register recipients.</p>
                  </div>
                ) : (
                  <form onSubmit={handleRegisterRecipient}>
                    <div className="form-group">
                      <label className="form-label">Recipient Wallet Address (G...)</label>
                      <input 
                        type="text" 
                        required
                        pattern="G[A-Z0-9]{55}"
                        placeholder="G..." 
                        className="form-input"
                        value={newRecipientAddr}
                        onChange={(e) => setNewRecipientAddr(e.target.value)}
                      />
                    </div>
                    <div className="form-group-split">
                      <div>
                        <label className="form-label">Recipient Region</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Region-North" 
                          className="form-input"
                          value={newRecipientRegion}
                          onChange={(e) => setNewRecipientRegion(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Verification ID / Name</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. ID-892A" 
                          className="form-input"
                          value={newRecipientVerifyId}
                          onChange={(e) => setNewRecipientVerifyId(e.target.value)}
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={!isAdmin}>
                      <span>Register Recipient</span>
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
              </section>

              {/* DISBURSE AID */}
              <section className="card">
                <h3 className="card-title"><Coins size={20} style={{ color: 'var(--primary)' }} /> Disburse Aid to Recipient</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Distribute funds directly from the Relief Fund. This will invoke inter-contract calls to verify eligibility and enforce the cap of **{MAX_DISBURSEMENT_CAP} XLM**.
                </p>

                {!address ? (
                  <div className="empty-placeholder">
                    <Wallet className="empty-icon" />
                    <p>Connect your admin wallet to disburse aid.</p>
                  </div>
                ) : (
                  <form onSubmit={handleDisburse}>
                    <div className="form-group">
                      <label className="form-label">Select Verified Recipient</label>
                      <select 
                        required
                        className="form-input"
                        value={disburseRecipient}
                        onChange={(e) => setDisburseRecipient(e.target.value)}
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="" disabled>-- Select a registered recipient --</option>
                        {recipients.map((r, i) => {
                          const receivedXlm = Number(r.totalReceived) / 10_000_000
                          return (
                            <option key={i} value={r.recipient}>
                              {r.verificationId} — {r.region} (Spent: {receivedXlm.toFixed(1)}/{MAX_DISBURSEMENT_CAP} XLM)
                            </option>
                          )
                        })}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Disbursement Amount (XLM)</label>
                      <input 
                        type="number" 
                        step="0.0001" 
                        min="0.0001" 
                        required
                        placeholder="e.g. 100" 
                        className="form-input"
                        value={disburseAmount}
                        onChange={(e) => setDisburseAmount(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={!isAdmin || recipients.length === 0}>
                      <span>Send Direct Aid Payment</span>
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
              </section>
            </div>
          )}
        </main>

        {/* RIGHT COLUMN: HISTORY FEED & AUDIT TRAIL */}
        <aside className="right-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* VERIFIED RECIPIENTS PANEL */}
          <section className="card">
            <h3 className="card-title"><Users size={18} style={{ color: 'var(--primary)' }} /> Verified Recipient Registry</h3>
            {recipients.length === 0 ? (
              <div className="empty-placeholder" style={{ padding: '2rem 1rem' }}>
                <Users className="empty-icon" style={{ width: '2rem', height: '2rem' }} />
                <p style={{ fontSize: '0.85rem' }}>No recipients registered yet.</p>
              </div>
            ) : (
              <div className="recipients-list">
                {recipients.map((r, i) => {
                  const receivedXlm = Number(r.totalReceived) / 10_000_000
                  const capPercentage = Math.min((receivedXlm / MAX_DISBURSEMENT_CAP) * 100, 100)

                  return (
                    <div key={i} className="recipient-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div className="item-left">
                          <span className="item-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Shield size={14} />
                            {r.verificationId}
                          </span>
                          <span className="item-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} />
                            {r.region}
                          </span>
                        </div>
                        <div className="item-right">
                          <span className="brand-tag">
                            Verified
                          </span>
                        </div>
                      </div>

                      {/* Recipient Address */}
                      <div className="item-subtitle" style={{ fontFamily: 'var(--font-mono)' }}>
                        {r.recipient}
                      </div>

                      {/* Cap Progress Bar */}
                      <div className="progress-wrapper">
                        <div className="progress-labels">
                          <span>Disbursed: {receivedXlm.toFixed(2)} / {MAX_DISBURSEMENT_CAP} XLM</span>
                          <span>{capPercentage.toFixed(0)}%</span>
                        </div>
                        <div className="progress-container">
                          <div className="progress-bar-fill" style={{ width: `${capPercentage}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* DISBURSEMENT HISTORY FEED */}
          <section className="card">
            <h3 className="card-title"><History size={18} style={{ color: 'var(--primary)' }} /> Disbursement History Feed</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              Public ledger records of all direct payments made from this Relief Fund. Click a recipient to audit on Stellar Expert.
            </p>

            {history.length === 0 ? (
              <div className="empty-placeholder">
                <History className="empty-icon" />
                <p>No disbursements recorded yet.</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((h, i) => {
                  const recipientInfo = recipients.find(r => r.recipient === h.recipient)
                  const displayName = recipientInfo ? recipientInfo.verificationId : 'Recipient'
                  return (
                    <a 
                      key={i} 
                      href={`${STELLAR_EXPERT_URL}/account/${h.recipient}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="history-item"
                    >
                      <div className="item-left">
                        <span className="item-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FileText size={14} style={{ color: 'var(--accent)' }} />
                          {displayName}
                        </span>
                        <span className="item-subtitle">{h.recipient.slice(0, 10)}...{h.recipient.slice(-10)}</span>
                      </div>
                      <div className="item-right">
                        <span className="amount-display negative" style={{ color: 'var(--accent)' }}>
                          -{formatXlm(h.amount, 2)} XLM
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          Audit Trail <ExternalLink size={8} />
                        </span>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* TRANSACTION PROGRESS MODAL */}
      <TransactionModal
        txStage={txStage}
        txError={txError}
        txHash={txHash}
        onClose={() => { setTxStage(null); setTxError(null); setTxHash(null); }}
      />
    </div>
  )
}
