'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

interface Notification {
  decision_id: string
  title: string
  created_at: string | null
  confidence: number | null
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [rated, setRated] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [rating, setRating] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/user/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
      }
    } catch {
      // silently fail — notifications are non-critical
    } finally {
      setLoading(false)
    }
  }

  const rate = async (decisionId: string, helpful: boolean) => {
    setRating(decisionId)
    try {
      await fetch(`/api/user/notifications/${decisionId}/rate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ helpful }),
      })
      setRated(prev => new Set([...prev, decisionId]))
    } finally {
      setRating(null)
    }
  }

  const pending = notifications.filter(n => !rated.has(n.decision_id))
  const hasBadge = pending.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {hasBadge && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: '#ef4444' }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl border overflow-hidden z-50"
          style={{
            width: 340,
            background: 'var(--card)',
            borderColor: 'var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Decision Check-ins
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Were these decisions helpful?
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Loading…
              </div>
            ) : pending.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {notifications.length === 0 ? 'No check-ins yet' : 'All caught up!'}
              </div>
            ) : (
              pending.map(n => (
                <div
                  key={n.decision_id}
                  className="px-4 py-3 border-b last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <p className="text-sm font-medium mb-0.5 truncate" style={{ color: 'var(--foreground)' }}>
                    {n.title}
                  </p>
                  <p className="text-xs mb-2.5" style={{ color: 'var(--muted-foreground)' }}>
                    {n.created_at ? new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    {n.confidence != null ? ` · ${(n.confidence * 100).toFixed(0)}% confidence` : ''}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => rate(n.decision_id, true)}
                      disabled={rating === n.decision_id}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)', border: '1px solid rgba(34,197,94,0.25)' }}
                    >
                      Yes, it helped
                    </button>
                    <button
                      onClick={() => rate(n.decision_id, false)}
                      disabled={rating === n.decision_id}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(239,68,68,0.1)', color: 'rgb(239,68,68)', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      No, it didn't
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
