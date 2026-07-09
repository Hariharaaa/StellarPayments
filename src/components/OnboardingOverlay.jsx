import { useState, useEffect } from 'react'
import { Coins, ArrowRight } from 'lucide-react'

const STORAGE_KEY = 'reliefRailOnboardingSeen'

const STEPS = [
  {
    icon: '🔗',
    title: 'Connect Your Wallet',
    desc: 'Install Freighter (free browser extension) or xBull and connect to the Stellar testnet. No sign-up needed — your wallet is your identity.',
  },
  {
    icon: '💛',
    title: 'Donate or Get Registered',
    desc: 'Donors send XLM directly to the smart contract. Aid organizations register verified recipient wallets with a region and ID.',
  },
  {
    icon: '⛓️',
    title: 'Funds Move On-Chain',
    desc: 'The admin disburses aid directly from the contract to recipients. Every transfer is enforced by code — no middlemen can intercept it.',
  },
  {
    icon: '🔍',
    title: 'Track Everything Publicly',
    desc: 'Every donation and disbursement is recorded in the public history feed. Click any entry to audit the full transaction on Stellar Expert.',
  },
]

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY)
    if (!seen) {
      setVisible(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <div className="onboarding-badge">
          <Coins size={12} aria-hidden="true" />
          Welcome to Disaster ReliefRail
        </div>

        <h2 className="onboarding-title" id="onboarding-title">
          Direct Aid.<br />On-Chain. Transparent.
        </h2>
        <p className="onboarding-subtitle">
          Here's how this works in 4 simple steps — takes 30 seconds to read.
        </p>

        <div className="onboarding-steps" role="list">
          {STEPS.map((step, i) => (
            <div key={i} className="onboarding-step" role="listitem">
              <div className="onboarding-step-num" aria-hidden="true">{i + 1}</div>
              <div className="onboarding-step-text">
                <strong>{step.icon} {step.title}</strong>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={dismiss}
          id="btn-onboarding-dismiss"
          autoFocus
        >
          <span>Got it — take me to the dashboard</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
          New to Stellar?{' '}
          <a href="https://freighter.app" target="_blank" rel="noopener noreferrer">
            Install Freighter wallet
          </a>
          {' '}— it's free and takes 2 minutes.
        </p>
      </div>
    </div>
  )
}
