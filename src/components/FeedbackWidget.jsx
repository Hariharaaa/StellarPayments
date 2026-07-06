import { useState } from 'react'
import { MessageSquare, X, Send, CheckCircle } from 'lucide-react'
import { trackEvent } from '../analytics'

const FORMSPREE_ID = import.meta.env.VITE_FORMSPREE_ID || ''

const STARS = [1, 2, 3, 4, 5]

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [bugText, setBugText] = useState('')
  const [nextText, setNextText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const resetForm = () => {
    setRating(0)
    setHoverRating(0)
    setBugText('')
    setNextText('')
    setError(null)
    setSubmitted(false)
  }

  const handleClose = () => {
    setOpen(false)
    // Brief delay so animation finishes before resetting
    setTimeout(resetForm, 300)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!rating) {
      setError('Please select a rating before submitting.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      ease_rating: rating,
      bug_or_confusion: bugText || '(nothing reported)',
      next_feature: nextText || '(no suggestion)',
      submitted_at: new Date().toISOString(),
    }

    try {
      if (FORMSPREE_ID) {
        const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || `Submission failed (${res.status})`)
        }
      } else {
        // Dev mode — just log to console so we can test UI without Formspree key
        console.log('[FeedbackWidget] Formspree ID not set — payload logged:', payload)
      }

      setSubmitted(true)
      trackEvent('feedback_submitted', { rating })
    } catch (err) {
      setError('Could not send feedback right now. Please try again in a moment.')
      console.error('Feedback submission error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="feedback-fab">
      {/* Feedback Panel */}
      {open && (
        <div className="feedback-panel" role="dialog" aria-modal="true" aria-label="Feedback form">
          {submitted ? (
            <div className="feedback-success">
              <div className="feedback-success-icon">🎉</div>
              <h4>Thanks for your feedback!</h4>
              <p>Your response helps us make ReliefRail better for everyone.</p>
              <button
                className="btn btn-primary"
                onClick={handleClose}
                style={{ marginTop: '1.25rem' }}
                id="btn-feedback-close-success"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                <h3 className="feedback-panel-title">Quick Feedback</h3>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                  aria-label="Close feedback panel"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="feedback-panel-sub">3 quick questions · takes 30 seconds</p>

              {/* Q1: Ease Rating */}
              <label className="feedback-question-label" id="star-label">
                How easy was this to use?
              </label>
              <div className="star-rating" role="radiogroup" aria-labelledby="star-label">
                {STARS.map(s => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={rating === s}
                    aria-label={`${s} star${s > 1 ? 's' : ''}`}
                    className={`star-btn ${(hoverRating || rating) >= s ? 'active' : ''}`}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                  >
                    ★
                  </button>
                ))}
                {rating > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '4px' }}>
                    {rating}/5
                  </span>
                )}
              </div>

              {/* Q2: Bug or Confusion */}
              <label className="feedback-question-label" htmlFor="feedback-bug">
                Did anything break or confuse you?
              </label>
              <textarea
                id="feedback-bug"
                className="feedback-textarea"
                placeholder="Nothing? That's great! Or tell us what was confusing…"
                value={bugText}
                onChange={e => setBugText(e.target.value)}
                maxLength={500}
                rows={2}
              />

              {/* Q3: Next Feature */}
              <label className="feedback-question-label" htmlFor="feedback-next">
                What would you want this to do next?
              </label>
              <textarea
                id="feedback-next"
                className="feedback-textarea"
                placeholder="e.g. Show donor leaderboard, mobile app, multi-currency…"
                value={nextText}
                onChange={e => setNextText(e.target.value)}
                maxLength={500}
                rows={2}
              />

              {error && (
                <p style={{ color: 'var(--error)', fontSize: '0.8rem', marginBottom: '0.75rem' }} role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                id="btn-feedback-submit"
                style={{ gap: '0.5rem' }}
              >
                {submitting ? (
                  <span>Sending…</span>
                ) : (
                  <>
                    <Send size={14} aria-hidden="true" />
                    <span>Send Feedback</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* FAB Button */}
      <button
        className="feedback-btn"
        onClick={() => setOpen(o => !o)}
        id="btn-feedback-open"
        aria-label={open ? 'Close feedback' : 'Give feedback'}
        aria-expanded={open}
      >
        {open ? <X size={15} aria-hidden="true" /> : <MessageSquare size={15} aria-hidden="true" />}
        <span>{open ? 'Close' : 'Feedback'}</span>
      </button>
    </div>
  )
}
