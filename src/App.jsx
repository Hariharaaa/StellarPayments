import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from './context/WalletContext'
import {
  getWalletBalance,
  getFundBalance,
  getRecipients,
  getDisbursementHistory,
  donate,
  registerRecipient,
  disburse,
  formatXlm,
  subscribeToFundEvents
} from './stellar'
import { ADMIN_ADDRESS, STELLAR_EXPERT_URL, MAX_DISBURSEMENT_CAP } from './config'
import { getActiveCampaigns, recordDonation, recordDisbursement, getDisbursementCampaignTag } from './services/campaignStore'
import TransactionModal from './components/TransactionModal'
import OnboardingOverlay from './components/OnboardingOverlay'
import FeedbackWidget from './components/FeedbackWidget'
import DisasterFeed from './components/DisasterFeed'
import CampaignCards from './components/CampaignCards'
import CreateCampaignModal from './components/CreateCampaignModal'
import { SkeletonBalance, SkeletonRow } from './components/SkeletonLoader'
import { trackEvent } from './analytics'
import * as Sentry from '@sentry/react'
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
  FileText,
  Target,
  Plus
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

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)
  const firstLoadRef = useRef(true)

  // Form Inputs
  const [donateAmount, setDonateAmount] = useState('')
  const [newRecipientAddr, setNewRecipientAddr] = useState('')
  const [newRecipientRegion, setNewRecipientRegion] = useState('')
  const [newRecipientVerifyId, setNewRecipientVerifyId] = useState('')
  const [disburseRecipient, setDisburseRecipient] = useState('')
  const [disburseAmount, setDisburseAmount] = useState('')

  // Tx Status State
  const [txStage, setTxStage] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [txError, setTxError] = useState(null)

  // Toast Notifications State
  const [notifications, setNotifications] = useState([])

  // ── Campaign State ──────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState([])
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [disburseCampaignId, setDisburseCampaignId] = useState('')
  const [showCreateCampaign, setShowCreateCampaign] = useState(false)
  const [linkedDisaster, setLinkedDisaster] = useState(null)

  // Load campaigns from localStorage
  const refreshCampaigns = useCallback(() => {
    setCampaigns(getActiveCampaigns())
  }, [])

  useEffect(() => {
    refreshCampaigns()
  }, [refreshCampaigns])

  // Fetch all on-chain data
  const refreshData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setIsLoadingData(true)
        setIsLoadingBalance(true)
      }

      // 1. Contract Balance
      const fBalance = await getFundBalance()
      setFundBalance(formatXlm(fBalance, 4))
      setIsLoadingBalance(false)

      // 2. Recipients Details
      const rList = await getRecipients()
      setRecipients(rList)

      // 3. Disbursement History
      const hList = await getDisbursementHistory()
      setHistory([...hList].reverse())

      // 4. Wallet Balance (if connected)
      if (address) {
        const wBalance = await getWalletBalance(address)
        setWalletBalance(Number(wBalance).toFixed(4))
      }
    } catch (e) {
      console.error('Data refresh error:', e)
      Sentry.captureException(e, { extra: { context: 'refreshData' } })
    } finally {
      if (isInitial) {
        setIsLoadingData(false)
      }
    }
  }, [address])

  // First load + polling every 5 seconds
  useEffect(() => {
    refreshData(true)
    firstLoadRef.current = false
    const interval = setInterval(() => refreshData(false), 5000)
    return () => clearInterval(interval)
  }, [refreshData])

  // Event Streaming for Real-Time Toast Notifications
  useEffect(() => {
    const unsubscribe = subscribeToFundEvents((evt) => {
      const id = Date.now() + Math.random()
      const amountXlm = formatXlm(evt.amount, 2)
      let title = ''
      let message = ''

      if (evt.type === 'donation_received') {
        title = 'Donation Received!'
        message = `Received ${amountXlm} XLM from ${evt.address.slice(0, 6)}...${evt.address.slice(-4)}`
      } else if (evt.type === 'aid_disbursed') {
        title = 'Aid Disbursed'
        message = `Sent ${amountXlm} XLM to ${evt.address.slice(0, 6)}...${evt.address.slice(-4)}`
      }

      const newToast = { id, title, message, type: evt.type }
      setNotifications(prev => [...prev, newToast])

      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, 6000)

      refreshData(false)
    })

    return () => unsubscribe()
  }, [refreshData])

  // Clear inputs helper
  const clearInputs = () => {
    setDonateAmount('')
    setNewRecipientAddr('')
    setNewRecipientRegion('')
    setNewRecipientVerifyId('')
    setDisburseRecipient('')
    setDisburseAmount('')
    setSelectedCampaignId('')
    setDisburseCampaignId('')
  }

  // ── Campaign Handlers ───────────────────────────────────────────────────────

  // When user clicks "Fund this crisis" on a disaster card
  const handleFundCrisis = (disaster) => {
    // Check if a campaign already exists for this disaster
    const existing = campaigns.find(c => c.disasterId === disaster.id)
    if (existing) {
      // Pre-select the existing campaign and scroll to donate form
      setSelectedCampaignId(existing.id)
      setActiveTab('donor')
    } else {
      // Open create campaign modal with this disaster pre-linked
      setLinkedDisaster(disaster)
      setShowCreateCampaign(true)
    }
  }

  // When a campaign is created successfully
  const handleCampaignCreated = (newCampaign) => {
    refreshCampaigns()
    setSelectedCampaignId(newCampaign.id)
    trackEvent('campaign_created', { name: newCampaign.name, region: newCampaign.region })
  }

  // When user clicks "Donate to this campaign" on a campaign card
  const handleSelectCampaign = (campaign) => {
    setSelectedCampaignId(campaign.id)
    setActiveTab('donor')
    // Scroll to donation form
    setTimeout(() => {
      document.getElementById('donate-amount')?.focus()
    }, 200)
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
      const wBal = await getWalletBalance(address)
      if (Number(wBal) < Number(donateAmount)) {
        throw Object.assign(
          new Error("Your wallet doesn't have enough XLM to cover this donation amount. Check your balance and try a smaller amount."),
          { code: 'INSUFFICIENT_BALANCE' }
        )
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

      // Record donation against campaign if one is selected
      if (selectedCampaignId) {
        recordDonation(selectedCampaignId, Number(donateAmount), address)
        refreshCampaigns()
      }

      setTxStage('Success')
      clearInputs()
      refreshData(false)
      trackEvent('donation_submitted', { amount: donateAmount, campaignId: selectedCampaignId || 'general' })
    } catch (err) {
      console.error('Donate error:', err)
      setTxStage('Failed')
      setTxError(err.message || String(err))
      if (err.code !== 'USER_REJECTED' && err.code !== 'INSUFFICIENT_BALANCE') {
        Sentry.captureException(err, { extra: { operation: 'donate', amount: donateAmount } })
      }
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
      refreshData(false)
      trackEvent('recipient_registered', { region: newRecipientRegion })
    } catch (err) {
      console.error('Register recipient error:', err)
      setTxStage('Failed')
      setTxError(err.message || String(err))
      if (err.code !== 'USER_REJECTED') {
        Sentry.captureException(err, { extra: { operation: 'register_recipient' } })
      }
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
      const fBalance = await getFundBalance()
      const fBalanceXlm = Number(fBalance) / 10_000_000
      if (fBalanceXlm < Number(disburseAmount)) {
        throw Object.assign(
          new Error(`The Relief Fund only has ${fBalanceXlm.toFixed(2)} XLM available — not enough for a ${disburseAmount} XLM disbursement. Collect more donations first.`),
          { code: 'INSUFFICIENT_FUND_BALANCE' }
        )
      }

      const target = recipients.find(r => r.recipient === disburseRecipient)
      if (target) {
        const totalReceivedXlm = Number(target.totalReceived) / 10_000_000
        if (totalReceivedXlm + Number(disburseAmount) > MAX_DISBURSEMENT_CAP) {
          throw Object.assign(
            new Error(`This disbursement would exceed the ${MAX_DISBURSEMENT_CAP} XLM cap for this recipient. They've already received ${totalReceivedXlm.toFixed(2)} XLM.`),
            { code: 'CAP_EXCEEDED' }
          )
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

      // Record disbursement against campaign if one is selected
      if (disburseCampaignId) {
        recordDisbursement(disburseCampaignId, Number(disburseAmount), disburseRecipient)
        refreshCampaigns()
      }

      setTxStage('Success')
      clearInputs()
      refreshData(false)
      trackEvent('disbursement_submitted', { amount: disburseAmount, campaignId: disburseCampaignId || 'general' })
    } catch (err) {
      console.error('Disburse error:', err)
      setTxStage('Failed')
      setTxError(err.message || String(err))
      if (err.code !== 'USER_REJECTED' && err.code !== 'INSUFFICIENT_FUND_BALANCE' && err.code !== 'CAP_EXCEEDED') {
        Sentry.captureException(err, { extra: { operation: 'disburse', amount: disburseAmount, recipient: disburseRecipient } })
      }
    }
  }

  const handleConnect = async () => {
    await connect()
    trackEvent('wallet_connected')
  }

  const isAdmin = address === ADMIN_ADDRESS

  return (
    <div className="container">
      {/* ONBOARDING OVERLAY */}
      <OnboardingOverlay />

      {/* HEADER SECTION */}
      <header className="header">
        <div className="brand">
          <Coins className="brand-icon" />
          <div>
            <h1 className="brand-title">Disaster ReliefRail</h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: '700', textTransform: 'uppercase', marginTop: '2px' }}>
              Direct Aid Portal
            </p>
          </div>
        </div>

        <div className="header-wallet-group">
          {address ? (
            <button className="btn-wallet connected" onClick={disconnect} title="Disconnect wallet">
              <Wallet size={16} />
              <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
              <LogOut size={14} style={{ marginLeft: '4px' }} />
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <button
                className="btn-wallet"
                onClick={handleConnect}
                disabled={connecting}
                id="btn-connect-wallet"
                title="Connect your Stellar wallet"
              >
                <Wallet size={16} />
                <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
                {connecting && <span className="btn-spinner" aria-label="Connecting…" />}
              </button>
              <a
                href="https://freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="freighter-hint"
              >
                Don't have a wallet? Install Freighter →
              </a>
            </div>
          )}
        </div>
      </header>

      {/* WALLET ERROR NOTIFICATION */}
      {walletError && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle className="alert-icon" />
          <div>
            <p style={{ fontWeight: 600 }}>Wallet Error</p>
            <p>{walletError}</p>
          </div>
        </div>
      )}

      {/* ── FULL-WIDTH TOP SECTIONS ──────────────────────────────────────── */}

      {/* AVAILABLE FUNDS DISPLAY */}
      <section className="card funds-display" aria-label="Relief Fund Balance">
        {isLoadingBalance ? (
          <SkeletonBalance />
        ) : (
          <>
            <h2 className="funds-title">Active Relief Fund Balance</h2>
            <p className="funds-amount">
              {fundBalance} <span className="funds-symbol">XLM</span>
            </p>
            <div className="funds-info">
              <RefreshCw size={14} className="spin-on-update" aria-hidden="true" />
              <span>Synced live with Soroban Testnet smart contract</span>
            </div>
            {address && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '2px solid #5C5657', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: '700' }}>Your Wallet Balance:</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-white)', fontSize: '1.1rem', fontWeight: '800' }}>{walletBalance} XLM</strong>
              </div>
            )}
          </>
        )}
      </section>

      {/* VIEW SWITCHING TABS */}
      <nav className="tabs-nav" role="tablist" aria-label="Portal tabs">
        <button
          role="tab"
          aria-selected={activeTab === 'donor'}
          className={`tab-btn ${activeTab === 'donor' ? 'active' : ''}`}
          onClick={() => setActiveTab('donor')}
          id="tab-donor"
        >
          <Heart size={16} aria-hidden="true" />
          <span>Donor Portal</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'admin'}
          className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
          id="tab-admin"
        >
          <Lock size={16} aria-hidden="true" />
          <span>Admin Portal</span>
        </button>
      </nav>

      {/* DONOR-ONLY: FULL-WIDTH DISASTER FEED + CAMPAIGNS */}
      {activeTab === 'donor' && (
        <>
          <DisasterFeed onFundCrisis={handleFundCrisis} />
          <CampaignCards
            campaigns={campaigns}
            onSelectCampaign={handleSelectCampaign}
          />
        </>
      )}

      {/* ── TWO-COLUMN DASHBOARD GRID ──────────────────────────────────── */}
      <div className="dashboard-grid">
        {/* LEFT COLUMN: INTERACTION PANELS */}
        <main className="left-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* DONOR TAB VIEW */}
          {activeTab === 'donor' && (
            <section className="card" role="tabpanel" aria-labelledby="tab-donor">
              <h3 className="card-title"><Heart size={20} style={{ color: 'var(--c-black)' }} aria-hidden="true" /> Make a Direct Donation</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Donated funds flow securely into the transparent Soroban contract, ready to be disbursed directly to registered aid recipients without middlemen.
              </p>

              {!address ? (
                <div className="empty-placeholder">
                  <Wallet className="empty-icon" aria-hidden="true" />
                  <p>Please connect your wallet to make a donation.</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    New to Stellar wallets?{' '}
                    <a href="https://freighter.app" target="_blank" rel="noopener noreferrer">Install Freighter</a>
                    {' '}— it's free and takes 2 minutes.
                  </p>
                  <button className="btn btn-primary" onClick={handleConnect} style={{ maxWidth: '220px', marginTop: '0.5rem' }} id="btn-connect-donate">
                    {connecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDonate} noValidate>
                  {/* Campaign Selector */}
                  {campaigns.length > 0 && (
                    <div className="campaign-selector-group">
                      <label className="form-label" htmlFor="donate-campaign">
                        <Target size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tag to Campaign (Optional)
                      </label>
                      <select
                        id="donate-campaign"
                        className="form-input"
                        value={selectedCampaignId}
                        onChange={(e) => setSelectedCampaignId(e.target.value)}
                        disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                      >
                        <option value="">— General Fund (no campaign) —</option>
                        {campaigns.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {c.region} ({c.raised.toFixed(0)}/{c.goal} XLM)
                          </option>
                        ))}
                      </select>
                      <p className="form-helper">Optionally link your donation to a specific disaster campaign for transparent tracking.</p>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="donate-amount">
                      Donation Amount (XLM)
                    </label>
                    <input
                      id="donate-amount"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      placeholder="e.g. 50"
                      className="form-input"
                      value={donateAmount}
                      onChange={(e) => setDonateAmount(e.target.value)}
                      disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                    />
                    <p className="form-helper">Minimum 0.0001 XLM. Your wallet must have this amount plus a small network fee (~0.001 XLM).</p>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                    id="btn-donate-submit"
                  >
                    <span>Donate to Relief Fund</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </form>
              )}
            </section>
          )}

          {/* ADMIN/ORGANIZATION TAB VIEW */}
          {activeTab === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} role="tabpanel" aria-labelledby="tab-admin">

              {/* ADMIN LOCK NOTICE */}
              {address && !isAdmin && (
                <div className="alert alert-info" role="status">
                  <Lock className="alert-icon" aria-hidden="true" />
                  <div>
                    <p style={{ fontWeight: 600 }}>Viewing Mode Only</p>
                    <p>Your connected wallet is not the authorized Admin Organization. Admin actions will be rejected by the contract.</p>
                  </div>
                </div>
              )}

              {/* CREATE CAMPAIGN BUTTON (Admin Only) */}
              <section className="card">
                <h3 className="card-title"><Target size={20} aria-hidden="true" /> Campaign Management</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Create named campaigns linked to specific disaster events. Donors can then direct their contributions to the crises that matter most to them.
                </p>
                <button
                  className="btn-create-campaign"
                  onClick={() => { setLinkedDisaster(null); setShowCreateCampaign(true) }}
                  id="btn-open-create-campaign"
                >
                  <Plus size={18} aria-hidden="true" />
                  <span>Create New Campaign</span>
                </button>

                {campaigns.length > 0 && (
                  <div className="campaign-grid" style={{ marginTop: '0.5rem' }}>
                    {campaigns.map(c => {
                      const pct = c.goal > 0 ? Math.min((c.raised / c.goal) * 100, 100) : 0
                      return (
                        <div key={c.id} className="campaign-card" style={{ cursor: 'default' }}>
                          <div className="campaign-card-header">
                            <h4 className="campaign-card-name">{c.name}</h4>
                            <span className="campaign-region-tag">
                              <MapPin size={11} aria-hidden="true" />
                              {c.region}
                            </span>
                          </div>
                          <div className="campaign-progress-section">
                            <div className="progress-labels">
                              <span><strong>{c.raised.toFixed(2)}</strong> / {c.goal} XLM</span>
                              <span>{pct.toFixed(0)}%</span>
                            </div>
                            <div className="progress-container" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                              <div className={`progress-bar-fill ${pct >= 100 ? 'progress-complete' : ''}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* REGISTER RECIPIENT */}
              <section className="card">
                <h3 className="card-title"><UserPlus size={20} aria-hidden="true" /> Register Verified Recipient</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Register verified recipient wallet addresses and regions to make them eligible for relief payouts. Only the Admin can invoke this.
                </p>

                {!address ? (
                  <div className="empty-placeholder">
                    <Wallet className="empty-icon" aria-hidden="true" />
                    <p>Connect your admin wallet to register recipients.</p>
                  </div>
                ) : (
                  <form onSubmit={handleRegisterRecipient} noValidate>
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-addr">Recipient Wallet Address (G...)</label>
                      <input
                        id="reg-addr"
                        type="text"
                        required
                        pattern="G[A-Z0-9]{55}"
                        placeholder="G..."
                        className="form-input"
                        value={newRecipientAddr}
                        onChange={(e) => setNewRecipientAddr(e.target.value)}
                        disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                      />
                      <p className="form-helper">Must be a valid Stellar address starting with G (56 characters total).</p>
                    </div>
                    <div className="form-group-split">
                      <div>
                        <label className="form-label" htmlFor="reg-region">Recipient Region</label>
                        <input
                          id="reg-region"
                          type="text"
                          required
                          placeholder="e.g. Region-North"
                          className="form-input"
                          value={newRecipientRegion}
                          onChange={(e) => setNewRecipientRegion(e.target.value)}
                          disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                        />
                      </div>
                      <div>
                        <label className="form-label" htmlFor="reg-verify">Verification ID / Name</label>
                        <input
                          id="reg-verify"
                          type="text"
                          required
                          placeholder="e.g. ID-892A"
                          className="form-input"
                          value={newRecipientVerifyId}
                          onChange={(e) => setNewRecipientVerifyId(e.target.value)}
                          disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!isAdmin || (!!txStage && txStage !== 'Success' && txStage !== 'Failed')}
                      id="btn-register-submit"
                      title={!isAdmin ? 'Only the admin wallet can register recipients' : undefined}
                    >
                      <span>Register Recipient</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </form>
                )}
              </section>

              {/* DISBURSE AID */}
              <section className="card">
                <h3 className="card-title"><Coins size={20} aria-hidden="true" /> Disburse Aid to Recipient</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Distribute funds directly from the Relief Fund. The contract verifies eligibility and enforces a cap of <strong>{MAX_DISBURSEMENT_CAP} XLM</strong> per recipient.
                </p>

                {!address ? (
                  <div className="empty-placeholder">
                    <Wallet className="empty-icon" aria-hidden="true" />
                    <p>Connect your admin wallet to disburse aid.</p>
                  </div>
                ) : (
                  <form onSubmit={handleDisburse} noValidate>
                    {/* Campaign tag for disbursement */}
                    {campaigns.length > 0 && (
                      <div className="campaign-selector-group">
                        <label className="form-label" htmlFor="disburse-campaign">
                          <Target size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tag to Campaign (Optional)
                        </label>
                        <select
                          id="disburse-campaign"
                          className="form-input"
                          value={disburseCampaignId}
                          onChange={(e) => setDisburseCampaignId(e.target.value)}
                          disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                        >
                          <option value="">— No campaign tag —</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {c.region}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label" htmlFor="disburse-recipient">Select Verified Recipient</label>
                      {isLoadingData ? (
                        <div className="skeleton skeleton-line" style={{ height: '48px', width: '100%', borderRadius: '16px' }} aria-hidden="true" />
                      ) : (
                        <select
                          id="disburse-recipient"
                          required
                          className="form-input"
                          value={disburseRecipient}
                          onChange={(e) => setDisburseRecipient(e.target.value)}
                          style={{ cursor: 'pointer' }}
                          disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
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
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="disburse-amount">Disbursement Amount (XLM)</label>
                      <input
                        id="disburse-amount"
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        required
                        placeholder="e.g. 100"
                        className="form-input"
                        value={disburseAmount}
                        onChange={(e) => setDisburseAmount(e.target.value)}
                        disabled={!!txStage && txStage !== 'Success' && txStage !== 'Failed'}
                      />
                      <p className="form-helper">Max cap per recipient: {MAX_DISBURSEMENT_CAP} XLM total across all disbursements.</p>
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!isAdmin || recipients.length === 0 || (!!txStage && txStage !== 'Success' && txStage !== 'Failed')}
                      id="btn-disburse-submit"
                      title={!isAdmin ? 'Only the admin wallet can disburse aid' : undefined}
                    >
                      <span>Send Direct Aid Payment</span>
                      <ArrowRight size={16} aria-hidden="true" />
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
          <section className="card" aria-label="Verified Recipient Registry">
            <h3 className="card-title"><Users size={18} aria-hidden="true" /> Verified Recipient Registry</h3>
            {isLoadingData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[0, 1, 2].map(i => <SkeletonRow key={i} lines={3} />)}
              </div>
            ) : recipients.length === 0 ? (
              <div className="empty-placeholder" style={{ padding: '2rem 1rem' }}>
                <Users className="empty-icon" style={{ width: '2rem', height: '2rem' }} aria-hidden="true" />
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
                            <Shield size={14} aria-hidden="true" />
                            {r.verificationId}
                          </span>
                          <span className="item-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} aria-hidden="true" />
                            {r.region}
                          </span>
                        </div>
                        <div className="item-right">
                          <span className="brand-tag">Verified</span>
                        </div>
                      </div>
                      <div className="item-subtitle" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        {r.recipient}
                      </div>
                      <div className="progress-wrapper">
                        <div className="progress-labels">
                          <span>Disbursed: {receivedXlm.toFixed(2)} / {MAX_DISBURSEMENT_CAP} XLM</span>
                          <span>{capPercentage.toFixed(0)}%</span>
                        </div>
                        <div className="progress-container" role="progressbar" aria-valuenow={capPercentage} aria-valuemin={0} aria-valuemax={100}>
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
          <section className="card" aria-label="Disbursement History">
            <h3 className="card-title"><History size={18} aria-hidden="true" /> Disbursement History Feed</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              Public ledger records of all direct payments made from this Relief Fund. Click a recipient to audit on Stellar Expert.
            </p>

            {isLoadingData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[0, 1, 2, 3].map(i => <SkeletonRow key={i} lines={2} />)}
              </div>
            ) : history.length === 0 ? (
              <div className="empty-placeholder">
                <History className="empty-icon" aria-hidden="true" />
                <p>No disbursements recorded yet.</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((h, i) => {
                  const recipientInfo = recipients.find(r => r.recipient === h.recipient)
                  const displayName = recipientInfo ? recipientInfo.verificationId : 'Recipient'
                  const campaignTag = getDisbursementCampaignTag(h.recipient)
                  return (
                    <a
                      key={i}
                      href={`${STELLAR_EXPERT_URL}/account/${h.recipient}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="history-item"
                      aria-label={`Audit ${displayName} disbursement of ${formatXlm(h.amount, 2)} XLM on Stellar Expert`}
                    >
                      <div className="item-left">
                        <span className="item-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FileText size={14} style={{ color: 'var(--c-black)' }} aria-hidden="true" />
                          {displayName}
                          {campaignTag && (
                            <span className="campaign-tag">
                              <Target size={9} /> {campaignTag}
                            </span>
                          )}
                        </span>
                        <span className="item-subtitle">{h.recipient.slice(0, 10)}...{h.recipient.slice(-10)}</span>
                      </div>
                      <div className="item-right">
                        <span className="amount-display negative">
                          -{formatXlm(h.amount, 2)} XLM
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          Audit Trail <ExternalLink size={8} aria-hidden="true" />
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
        onClose={() => { setTxStage(null); setTxError(null); setTxHash(null) }}
      />

      {/* CREATE CAMPAIGN MODAL */}
      <CreateCampaignModal
        isOpen={showCreateCampaign}
        onClose={() => { setShowCreateCampaign(false); setLinkedDisaster(null) }}
        onCreated={handleCampaignCreated}
        linkedDisaster={linkedDisaster}
      />

      {/* FEEDBACK WIDGET */}
      <FeedbackWidget />

      {/* TOAST NOTIFICATIONS */}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {notifications.map(toast => (
          <div key={toast.id} className={`toast-notification ${toast.type}`} role="status">
            <div className="toast-icon">
              {toast.type === 'donation_received' ? <Heart size={18} aria-hidden="true" /> : <Coins size={18} aria-hidden="true" />}
            </div>
            <div className="toast-content">
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
