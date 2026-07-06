/**
 * analytics.js — Thin PostHog wrapper for Disaster ReliefRail
 *
 * Events tracked:
 *   page_view           — automatic on init (PostHog autocapture)
 *   wallet_connected    — user successfully connects a wallet
 *   donation_submitted  — user submits a donation transaction
 *   disbursement_submitted — admin submits a disbursement transaction
 *   recipient_registered — admin registers a new recipient
 *   feedback_submitted  — user submits the feedback form
 *
 * Setup: set VITE_POSTHOG_KEY and VITE_POSTHOG_HOST in .env
 * If keys are not set, all tracking calls are no-ops (safe for dev).
 */

let posthog = null

export function initAnalytics() {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com'

  if (!apiKey) {
    console.info('[Analytics] VITE_POSTHOG_KEY not set — analytics disabled.')
    return
  }

  import('posthog-js').then(({ default: ph }) => {
    ph.init(apiKey, {
      api_host: apiHost,
      autocapture: false,          // Manual event tracking only — no PII captured
      capture_pageview: true,      // Auto page_view on load
      capture_pageleave: true,
      disable_session_recording: true,
      persistence: 'localStorage',
    })
    posthog = ph
    console.info('[Analytics] PostHog initialized.')
  }).catch(err => {
    console.warn('[Analytics] PostHog failed to load:', err)
  })
}

/**
 * Track a named event with optional properties.
 * Always safe to call — silently no-ops if PostHog isn't loaded.
 */
export function trackEvent(eventName, properties = {}) {
  try {
    if (posthog) {
      posthog.capture(eventName, {
        ...properties,
        app: 'disaster-relief-rail',
        network: 'testnet',
      })
    }
  } catch (err) {
    console.warn('[Analytics] trackEvent error:', err)
  }
}

/**
 * Identify the current user by their wallet address.
 * Called when a wallet connects.
 */
export function identifyUser(walletAddress) {
  try {
    if (posthog && walletAddress) {
      posthog.identify(walletAddress)
    }
  } catch (err) {
    console.warn('[Analytics] identifyUser error:', err)
  }
}
