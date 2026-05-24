'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Network, User, Shield, Target, Clock,
  Zap, Brain, Anchor, AlertTriangle, Lightbulb, Sparkles, X,
} from 'lucide-react'
import { TopNav } from '@/components/dashboard/top-nav'
import { LeftPanel } from '@/components/dashboard/left-panel'
import { fetchGroupedThreads } from '@/lib/api/threads'
import type { GroupedThreads } from '@/lib/api/threads'

interface ThinkingPattern {
  slug: string
  name: string
  statement: string
  confidence: number
  count: number
  last_seen: string | null
}

interface EvidenceInstance {
  statement: string
  raw_text: string
  field_type: string
  source: string
  created_at: string
}

interface EvidenceGroup {
  decision_id: string
  instances: EvidenceInstance[]
}

interface DecisionPatternRow {
  decision_id: string
  title: string
  created_at: string | null
  patterns: string[]
}

const SOURCE_LABEL: Record<string, string> = {
  clarify: 'Clarify Draft',
  pressure_test: 'Pressure Test',
  failure_analysis: 'Failure Analysis',
}

const FIELD_LABEL: Record<string, string> = {
  assumption: 'Assumption',
  constraint: 'Constraint',
  context: 'Context',
  pt_answer: 'Answer',
  failure_intake: 'Intake',
}

function formatSlug(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function splitSlugLines(text: string): [string, string] {
  const words = text.split(' ')
  if (words.length <= 1) return [text, '']
  return [words[0], words.slice(1).join(' ')]
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
const CARD_BG = '#0f0b07'

export default function InsightsPage() {
  const router = useRouter()
  const [patterns, setPatterns] = useState<ThinkingPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [decisionPatterns, setDecisionPatterns] = useState<DecisionPatternRow[]>([])
  const [groupedThreads, setGroupedThreads] = useState<GroupedThreads>({ active: [], revisions: [], failureAnalysis: [], history: [] })
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [clusterOpen, setClusterOpen] = useState(false)
  const [clusterVisible, setClusterVisible] = useState(false)
  const [selectedPattern, setSelectedPattern] = useState<ThinkingPattern | null>(null)
  const [cardVisible, setCardVisible] = useState(false)
  const [evidence, setEvidence] = useState<EvidenceGroup[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)

  const openCard = (pattern: ThinkingPattern) => {
    setSelectedPattern(pattern)
    setEvidence([])
    setEvidenceLoading(true)
    fetch(`/api/user/thinking-patterns/${pattern.slug}/evidence`)
      .then((r) => r.json())
      .then((d) => setEvidence(d.evidence ?? []))
      .catch(() => {})
      .finally(() => setEvidenceLoading(false))
  }

  const closeCard = () => {
    setCardVisible(false)
    setTimeout(() => setSelectedPattern(null), 280)
  }

  useEffect(() => {
    if (!selectedPattern) return
    const id = requestAnimationFrame(() => setCardVisible(true))
    return () => cancelAnimationFrame(id)
  }, [selectedPattern])

  const openCluster = () => {
    setClusterOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setClusterVisible(true)))
  }

  const closeCluster = () => {
    setClusterVisible(false)
    setTimeout(() => setClusterOpen(false), 200)
  }

  useEffect(() => {
    fetchGroupedThreads().then(setGroupedThreads).catch(() => {})
  }, [])

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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <TopNav onLogoClick={() => router.push('/')} />

      <div className="pt-16 h-screen">
        <div className="h-full p-4 flex gap-4">

        {/* ── Left Panel ── */}
        <div className={`transition-all duration-300 ease-in-out ${leftCollapsed ? 'w-10' : 'w-72'}`}>
          <LeftPanel
            isCollapsed={leftCollapsed}
            onToggleCollapse={() => setLeftCollapsed(c => !c)}
            groupedThreads={groupedThreads}
            onSelectThread={(thread) => router.push(`/?thread=${thread.id}`)}
          />
        </div>

        {/* ── Main Canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-card rounded-2xl border border-border/50">

          {/* Header */}
          <div className="px-8 pt-8 pb-5 shrink-0 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)', letterSpacing: '0.35em' }}>
                INSIGHT
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Your mind's recurring patterns, sized by their dominance.
              </p>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase shrink-0 mt-1 cursor-pointer"
              style={{ border: '1px solid rgba(201,184,150,0.3)', color: GOLD, background: 'rgba(201,184,150,0.05)', position: 'relative', overflow: 'hidden' }}
              onClick={openCluster}
            >
              <span
                style={{
                  position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(201,184,150,0.4), transparent)',
                  animation: 'shimmer-sweep 2.4s ease-in-out infinite',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
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
                        className="w-full h-full rounded-2xl border flex flex-col p-5 cursor-pointer"
                        style={{ background: CARD_BG, borderColor: 'rgba(201,184,150,0.5)', transition: 'border-color 0.2s, transform 0.15s' }}
                        onClick={() => openCard(pattern)}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(201,184,150,0.8)'; e.currentTarget.style.transform = 'scale(1.02)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(201,184,150,0.5)'; e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        {/* Icon circle */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center mb-3 shrink-0"
                          style={{ border: '1px solid rgba(201,184,150,0.25)', background: 'rgba(201,184,150,0.07)', color: GOLD }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Name + pct */}
                        <div className="mb-auto">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className="text-xl font-medium leading-tight"
                              style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}
                            >
                              {(() => {
                                const [l1, l2] = splitSlugLines(formatSlug(pattern.name || pattern.slug))
                                return <>{l1}{l2 && <><br />{l2}</>}</>
                              })()}
                            </p>
                            <span className="text-sm font-semibold shrink-0 mt-0.5" style={{ color: barColor }}>{pct}%</span>
                          </div>
                        </div>

                        {/* Count */}
                        <div className="mt-3">
                          <span className="text-2xl font-bold leading-none" style={{ color: GOLD, fontFamily: 'var(--font-serif)' }}>
                            {pattern.count}
                          </span>
                          <span className="text-xs uppercase tracking-widest ml-2" style={{ color: 'var(--muted-foreground)' }}>
                            {pattern.count === 1 ? 'time detected' : 'times detected'}
                          </span>
                        </div>

                        {/* Strength bar */}
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Strength</span>
                            <span className="text-xs font-medium" style={{ color: barColor }}>{pct}%</span>
                          </div>
                          <div className="h-0.5 rounded-full" style={{ background: 'var(--secondary)' }}>
                            <div className="h-0.5 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                          {pattern.last_seen && (
                            <p className="text-xs pt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                              Last detected: {(() => {
                                const diff = Date.now() - new Date(pattern.last_seen).getTime()
                                const days = Math.floor(diff / 86400000)
                                if (days === 0) return 'today'
                                if (days === 1) return 'yesterday'
                                if (days < 30) return `${days}d ago`
                                if (days < 365) return `${Math.floor(days / 30)}mo ago`
                                return `${Math.floor(days / 365)}y ago`
                              })()}
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

      {/* Pattern Detail Flip Card */}
      {selectedPattern && (() => {
        const p = selectedPattern
        const Icon = getIcon(p.slug)
        const pct = totalCount > 0
          ? Math.round((p.count / totalCount) * 100)
          : Math.round(p.confidence * 100)
        const barColor = pct >= 50 ? GOLD : pct >= 20 ? 'var(--accent)' : 'var(--muted-foreground)'
        const allInstances = evidence.flatMap((g) => g.instances)
        const cardWidth = allInstances.length >= 6 ? '82vw' : allInstances.length >= 3 ? '64vw' : '44vw'
        const evidenceCols = allInstances.length >= 6 ? 3 : allInstances.length >= 3 ? 2 : 1
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-50"
              style={{ background: 'rgba(0,0,0,0.65)', opacity: cardVisible ? 1 : 0, transition: 'opacity 0.28s ease' }}
              onClick={closeCard}
            />
            {/* Card */}
            <div
              className="fixed z-50"
              style={{
                top: '50%', left: '50%',
                transform: cardVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -48%) scale(0.96)',
                opacity: cardVisible ? 1 : 0,
                transition: 'opacity 0.28s ease, transform 0.28s ease, width 0.3s ease',
                width: cardWidth, maxHeight: '80vh',
              }}
            >
              <div
                className="flex flex-col rounded-2xl overflow-hidden"
                style={{ background: '#0f0b07', border: '1px solid rgba(201,184,150,0.6)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
              >
                {/* Header */}
                <div className="px-7 pt-7 pb-5 shrink-0 text-center relative" style={{ borderBottom: '1px solid rgba(201,184,150,0.1)' }}>
                  <button onClick={closeCard} className="absolute top-4 right-4 p-1" style={{ color: 'var(--muted-foreground)' }}>
                    <X className="w-5 h-5" />
                  </button>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ border: '1px solid rgba(201,184,150,0.3)', background: 'rgba(201,184,150,0.08)', color: GOLD }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h2 className="text-2xl font-medium leading-tight" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>
                    {formatSlug(p.name || p.slug)}
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {p.count} {p.count === 1 ? 'time' : 'times'} detected
                  </p>
                  <div className="mt-3 mx-auto w-48">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Strength</span>
                      <span className="text-xs font-medium" style={{ color: barColor }}>{pct}%</span>
                    </div>
                    <div className="h-0.5 rounded-full" style={{ background: 'var(--secondary)' }}>
                      <div className="h-0.5 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  </div>
                  {p.statement && (
                    <p className="text-sm mt-4 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                      {p.statement}
                    </p>
                  )}
                </div>

                {/* Evidence */}
                <div className="flex-1 overflow-y-auto px-7 py-5" style={{ minHeight: 0 }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-center" style={{ color: GOLD }}>Evidence</p>
                  {evidenceLoading ? (
                    <p className="text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>Loading evidence…</p>
                  ) : allInstances.length === 0 ? (
                    <p className="text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>No evidence recorded yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${evidenceCols}, 1fr)`, gap: 12 }}>
                    {allInstances.map((inst, i) => (
                      <div
                        key={i}
                        className="rounded-xl p-4"
                        style={{ background: 'rgba(201,184,150,0.04)', border: '1px solid rgba(201,184,150,0.12)' }}
                      >
                        <p className="text-sm leading-relaxed text-center" style={{ color: 'var(--foreground)' }}>
                          "{inst.raw_text}"
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(201,184,150,0.1)', color: GOLD, border: '1px solid rgba(201,184,150,0.2)' }}
                          >
                            {SOURCE_LABEL[inst.source] ?? inst.source}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            {FIELD_LABEL[inst.field_type] ?? inst.field_type}
                          </span>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {p.last_seen && (
                  <div className="shrink-0 px-7 py-3 flex items-center justify-center" style={{ borderTop: '1px solid rgba(201,184,150,0.1)' }}>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      Last detected:&nbsp;
                    </span>
                    <span className="text-xs font-medium" style={{ color: GOLD }}>
                      {(() => {
                        const diff = Date.now() - new Date(p.last_seen).getTime()
                        const days = Math.floor(diff / 86400000)
                        if (days === 0) return 'today'
                        if (days === 1) return 'yesterday'
                        if (days < 30) return `${days}d ago`
                        if (days < 365) return `${Math.floor(days / 30)}mo ago`
                        return `${Math.floor(days / 365)}y ago`
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* Pattern Cluster Popover */}
      {clusterOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCluster} />
          <div className="fixed z-50" style={{ top: 165, right: 200, width: 580, opacity: clusterVisible ? 1 : 0, transform: clusterVisible ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)', transition: 'opacity 0.2s ease, transform 0.2s ease', pointerEvents: clusterVisible ? 'auto' : 'none' }}>
            <div style={{ position: 'relative', background: '#1a1610', border: '1px solid rgba(201,184,150,0.6)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {/* Arrow pointing up-right toward the button */}
              <div style={{
                position: 'absolute', top: -8, right: 20,
                width: 14, height: 14,
                background: '#1a1610',
                borderTop: '1px solid rgba(201,184,150,0.6)',
                borderRight: '1px solid rgba(201,184,150,0.6)',
                transform: 'rotate(-45deg)',
              }} />
              <div className="px-4 py-3 text-center" style={{ borderBottom: '1px solid rgba(201,184,150,0.1)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#c9b896' }}>Pattern Clusters</p>
              </div>
              <div className="p-6 flex flex-wrap gap-2.5 justify-center">
                {patterns.length === 0 ? (
                  <p className="text-xs" style={{ color: 'rgba(201,184,150,0.4)' }}>No patterns yet.</p>
                ) : (
                  patterns.map((p) => (
                    <span
                      key={p.slug}
                      className="text-xs px-3 py-1.5"
                      style={{ background: 'rgba(201,184,150,0.08)', color: GOLD, border: '1px solid rgba(201,184,150,0.2)', borderRadius: 20 }}
                    >
                      {formatSlug(p.name || p.slug)}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
