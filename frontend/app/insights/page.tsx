'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Network, User, Shield, Target, Clock,
  Zap, Brain, Anchor, AlertTriangle, Lightbulb, Sparkles,
} from 'lucide-react'
import { TopNav } from '@/components/dashboard/top-nav'

interface ThinkingPattern {
  slug: string
  name: string
  statement: string
  confidence: number
  count: number
  last_seen: string | null
}

interface DecisionPatternRow {
  decision_id: string
  title: string
  created_at: string | null
  patterns: string[]
}

function formatSlug(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

type IconComponent = React.FC<{ className?: string }>

const ICON_RULES: [string[], IconComponent][] = [
  [['revenue', 'recovery', 'sales', 'growth', 'profit', 'loss'], TrendingUp],
  [['assumption', 'causality', 'correlation', 'link'], Network],
  [['feedback', 'user', 'social', 'customer'], User],
  [['contingency', 'shield', 'backup', 'fallback', 'risk'], Shield],
  [['metric', 'data', 'index', 'measure', 'number'], Target],
  [['delay', 'time', 'wait', 'slow', 'procrastin'], Clock],
  [['optimis', 'overconfid', 'speed', 'bias', 'aversion'], Zap],
  [['anchor', 'first', 'initial', 'status'], Anchor],
  [['uncertain', 'ambig', 'unclear'], AlertTriangle],
  [['insight', 'idea', 'innovat', 'creative'], Lightbulb],
]

function getIcon(slug: string): IconComponent {
  const lower = slug.toLowerCase()
  for (const [keywords, Icon] of ICON_RULES) {
    if (keywords.some((k) => lower.includes(k))) return Icon
  }
  return Brain
}

const GOLD = '#c9b896'
const CARD_BG = '#1a1610'

export default function InsightsPage() {
  const router = useRouter()
  const [patterns, setPatterns] = useState<ThinkingPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [decisionPatterns, setDecisionPatterns] = useState<DecisionPatternRow[]>([])

  useEffect(() => {
    fetch('/api/user/thinking-patterns')
      .then((r) => r.json())
      .then((d) => {
        const raw: ThinkingPattern[] = d.patterns ?? []
        const merged = new Map<string, ThinkingPattern>()
        for (const p of raw) {
          const key = p.name || p.slug
          const existing = merged.get(key)
          if (existing) {
            merged.set(key, {
              ...existing,
              count: existing.count + p.count,
              confidence: Math.max(existing.confidence, p.confidence),
            })
          } else {
            merged.set(key, p)
          }
        }
        setPatterns(Array.from(merged.values()).sort((a, b) => b.count - a.count))
      })
      .finally(() => setLoading(false))

    fetch('/api/user/decision-patterns')
      .then((r) => r.json())
      .then((d) => setDecisionPatterns(d.decisions ?? []))
      .catch(() => {})
  }, [])

  const totalCount = patterns.reduce((s, p) => s + p.count, 0)
  const topFive = patterns.slice(0, 5)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <TopNav onLogoClick={() => router.push('/')} />

      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: 64, height: 'calc(100vh - 64px)' }}>

        {/* ── Left Panel ── */}
        <div className="w-64 shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'rgba(201,184,150,0.2)' }}>

          {/* Nav links */}
          <nav className="px-4 pt-6 pb-4 space-y-0.5 shrink-0">
            {([
              { label: 'Active Decisions', href: '/' },
              { label: 'Decision Output', href: '/' },
              { label: 'Insights', active: true },
              { label: 'Failure Analysis', href: '/' },
              { label: 'Decision History', href: '/' },
            ] as { label: string; href?: string; active?: boolean }[]).map((item) => (
              <button
                key={item.label}
                onClick={() => item.href && router.push(item.href)}
                className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: item.active ? 'rgba(201,184,150,0.1)' : 'transparent',
                  color: item.active ? GOLD : 'var(--muted-foreground)',
                  cursor: item.href ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (!item.active) e.currentTarget.style.color = 'var(--foreground)' }}
                onMouseLeave={(e) => { if (!item.active) e.currentTarget.style.color = 'var(--muted-foreground)' }}
              >
                {item.label}
                {item.active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />}
              </button>
            ))}
          </nav>

          <div className="h-px mx-4 shrink-0" style={{ background: 'var(--border)' }} />

          {/* Recent Decisions */}
          <div className="px-4 pt-4 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(201,184,150,0.4)' }}>
              Recent Decisions
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 space-y-3 min-h-0">
            {decisionPatterns.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No decisions yet</p>
            ) : (
              decisionPatterns.slice(0, 8).map((d) => (
                <div key={d.decision_id} className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'rgba(201,184,150,0.4)' }} />
                    <p className="text-xs truncate" style={{ color: 'var(--foreground)' }}>{d.title}</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                    {relativeTime(d.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="h-px mx-4 mt-4 shrink-0" style={{ background: 'var(--border)' }} />

          {/* Pattern Clusters */}
          <div className="px-4 py-4 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(201,184,150,0.4)' }}>
              Pattern Clusters
            </p>
            {topFive.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No patterns yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {topFive.map((p) => (
                  <span
                    key={p.slug}
                    className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(201,184,150,0.08)', color: GOLD, border: '1px solid rgba(201,184,150,0.2)' }}
                  >
                    {formatSlug(p.name || p.slug)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Main Canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-5 shrink-0 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>
                Thinking Patterns
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Your mind's recurring patterns, sized by their dominance.
              </p>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase shrink-0 mt-1"
              style={{ border: '1px solid rgba(201,184,150,0.3)', color: GOLD, background: 'rgba(201,184,150,0.05)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GOLD }} />
              Live Cognitive Mirror
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto px-8 pb-4 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading your patterns…</p>
              </div>
            ) : patterns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <p className="text-base font-medium" style={{ color: 'var(--foreground)' }}>No patterns yet</p>
                <p className="text-sm text-center max-w-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Make a few decisions and your thinking patterns will appear here
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
                {patterns.map((pattern) => {
                  const Icon = getIcon(pattern.slug)
                  const flexGrow = Math.max(1, pattern.count)
                  const pct = totalCount > 0
                    ? Math.round((pattern.count / totalCount) * 100)
                    : Math.round(pattern.confidence * 100)
                  const barColor = pct >= 50 ? GOLD : pct >= 20 ? 'var(--accent)' : 'var(--muted-foreground)'

                  return (
                    <div
                      key={pattern.slug}
                      style={{ flex: `${flexGrow} 1 200px`, minWidth: 200, height: 240 }}
                    >
                      <div
                        className="w-full h-full rounded-2xl border flex flex-col p-5 transition-colors"
                        style={{ background: CARD_BG, borderColor: 'var(--border)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(201,184,150,0.35)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        {/* Icon circle */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center mb-3 shrink-0"
                          style={{ border: '1px solid rgba(201,184,150,0.25)', background: 'rgba(201,184,150,0.07)', color: GOLD }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Name */}
                        <p
                          className="text-base font-medium leading-tight mb-1 line-clamp-2"
                          style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}
                        >
                          {formatSlug(pattern.name || pattern.slug)}
                        </p>

                        {/* Statement */}
                        <p className="text-xs leading-snug line-clamp-2 mb-auto" style={{ color: 'var(--muted-foreground)' }}>
                          {pattern.statement}
                        </p>

                        {/* Count */}
                        <div className="mt-3">
                          <span className="text-2xl font-bold leading-none" style={{ color: GOLD, fontFamily: 'var(--font-serif)' }}>
                            {pattern.count}
                          </span>
                          <span className="text-xs uppercase tracking-widest ml-2" style={{ color: 'var(--muted-foreground)' }}>
                            times detected
                          </span>
                        </div>

                        {/* Strength bar */}
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Strength</span>
                            <span className="text-xs font-medium" style={{ color: barColor }}>{pct}%</span>
                          </div>
                          <div className="h-0.5 rounded-full" style={{ background: 'var(--secondary)' }}>
                            <div
                              className="h-0.5 rounded-full transition-all"
                              style={{ width: `${pct}%`, background: barColor }}
                            />
                          </div>
                          {pattern.last_seen && (
                            <p className="text-xs pt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                              Last detected: {relativeTime(pattern.last_seen)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div
            className="shrink-0 px-8 py-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(201,184,150,0.12)' }}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Patterns evolve as you make more decisions. Check back tomorrow to see how your mind shifts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
