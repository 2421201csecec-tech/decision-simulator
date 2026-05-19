'use client'
import { useEffect, useRef, useState } from 'react'
import { TopNav } from '@/components/dashboard/top-nav'

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
  created_at: string | null
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

function formatSlug(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

function effective(p: { count: number; confidence: number }): number {
  // count is primary; confidence is tiebreaker (adds up to 0.5 extra)
  return p.count + p.confidence * 0.5
}

function strengthBar(confidence: number) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.7 ? '#c9b896' : confidence >= 0.4 ? 'var(--accent)' : 'var(--muted-foreground)'
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Strength</span>
        <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1 rounded-full" style={{ background: 'var(--secondary)' }}>
        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#1a1610',
  borderColor: 'var(--border)',
}

export default function InsightsPage() {
  const [patterns, setPatterns] = useState<ThinkingPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [decisionPatterns, setDecisionPatterns] = useState<DecisionPatternRow[]>([])
  const [flippedSlug, setFlippedSlug] = useState<string | null>(null)
  const [evidenceMap, setEvidenceMap] = useState<Record<string, EvidenceGroup[]>>({})
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

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

  const handleFlip = async (pattern: ThinkingPattern) => {
    if (flippedSlug === pattern.slug) {
      setFlippedSlug(null)
      return
    }
    setFlippedSlug(pattern.slug)
    if (evidenceMap[pattern.slug]) return
    setLoadingMap((prev) => ({ ...prev, [pattern.slug]: true }))
    const r = await fetch(`/api/user/thinking-patterns/${pattern.slug}/evidence`)
    const d = await r.json()
    setEvidenceMap((prev) => ({ ...prev, [pattern.slug]: d.evidence ?? [] }))
    setLoadingMap((prev) => ({ ...prev, [pattern.slug]: false }))
  }

  const gridRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-card flex flex-col">
      <TopNav onLogoClick={() => window.location.href = '/'} />

      <div className="flex flex-1 pt-16" style={{ height: 'calc(100vh - 64px)' }}>

        {/* Left panel */}
        <div className="w-72 shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'rgba(201, 184, 150, 0.4)' }}>
          <div className="px-6 pt-8 pb-4 shrink-0">
            <h1 className="text-2xl font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>
              Thinking Patterns
            </h1>
          </div>

          <div className="h-px shrink-0" style={{ background: 'var(--border)' }} />

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {decisionPatterns.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No decisions with patterns yet</p>
            ) : (
              decisionPatterns.map((d) => (
                <div key={d.decision_id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--foreground)' }}>
                      {d.title}
                    </p>
                    <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                      {relativeTime(d.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {d.patterns.map((slug) => (
                      <span
                        key={slug}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(201,184,150,0.08)', color: '#c9b896', border: '1px solid rgba(201,184,150,0.2)' }}
                      >
                        {formatSlug(slug)}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-4 shrink-0" style={{ borderTop: '1px solid rgba(201,184,150,0.15)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>
              Patterns your mind repeats across decisions — click to see evidence
            </p>
          </div>
        </div>

        {/* Right panel — pattern grid */}
        <div className="flex-1 px-8 py-8 overflow-hidden">
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
            <div ref={gridRef} className="flex flex-wrap gap-2 content-start h-full overflow-y-auto">
              {(() => {
                const totalEff = patterns.reduce((s, p) => s + effective(p), 0)
                const area = containerSize.w * containerSize.h
                return patterns.map((pattern) => {
                  const share = effective(pattern) / totalEff
                  const side = Math.max(80, Math.round(Math.sqrt(share * area)))
                  const isFlipped = flippedSlug === pattern.slug
                  const evidence = evidenceMap[pattern.slug] ?? []
                  const evidenceLoading = loadingMap[pattern.slug] ?? false
                  const isLarge = side >= 200
                  const isMed = side >= 130 && side < 200

                  return (
                    <div key={pattern.slug} style={{ width: side, height: side, perspective: '1200px', flexShrink: 0 }}>
                            <div
                              style={{
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                                transformStyle: 'preserve-3d',
                                transition: 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                              }}
                            >
                              {/* Front face */}
                              <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                                <button
                                  onClick={() => handleFlip(pattern)}
                                  className="w-full h-full rounded-2xl border flex flex-col items-center justify-between transition-colors overflow-hidden"
                                  style={{ ...cardStyle, padding: isLarge ? '1.25rem' : isMed ? '0.875rem' : '0.5rem' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                  <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center overflow-hidden w-full">
                                    <p
                                      className="font-medium leading-tight"
                                      style={{
                                        color: '#c9b896',
                                        fontFamily: 'var(--font-serif)',
                                        fontSize: isLarge ? '1.3rem' : isMed ? '0.9rem' : '0.72rem',
                                      }}
                                    >
                                      {formatSlug(pattern.name || pattern.slug)}
                                    </p>
                                    {isLarge && (
                                      <p className="text-xs leading-snug line-clamp-2 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                                        {pattern.statement}
                                      </p>
                                    )}
                                  </div>

                                  <div className="w-full space-y-2">
                                    <div className="flex flex-col items-center">
                                      <span
                                        className="font-bold leading-none"
                                        style={{
                                          color: '#c9b896',
                                          fontFamily: 'var(--font-serif)',
                                          fontSize: isLarge ? '3rem' : isMed ? '2rem' : '1.2rem',
                                        }}
                                      >
                                        {pattern.count}
                                      </span>
                                      {(isLarge || isMed) && (
                                        <span className="text-xs uppercase mt-0.5" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.12em' }}>
                                          times detected
                                        </span>
                                      )}
                                    </div>
                                    {isLarge && strengthBar(pattern.confidence)}
                                  </div>
                                </button>
                              </div>

                              {/* Back face */}
                              <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                <div
                                  className="w-full h-full rounded-2xl border flex flex-col overflow-hidden cursor-pointer"
                                  style={cardStyle}
                                  onClick={() => setFlippedSlug(null)}
                                >
                                  <div className="flex items-center px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(201,184,150,0.15)' }}>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate" style={{ color: '#c9b896', fontFamily: 'var(--font-serif)' }}>
                                        {formatSlug(pattern.name || pattern.slug)}
                                      </p>
                                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                                        {pattern.count} times detected · {Math.round(pattern.confidence * 100)}% strength
                                      </p>
                                    </div>
                                  </div>
                                  <div className="px-4 py-2.5 shrink-0 text-xs leading-relaxed italic" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid rgba(201,184,150,0.1)' }}>
                                    {pattern.statement}
                                  </div>
                                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                                    {evidenceLoading ? (
                                      <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
                                    ) : evidence.length === 0 ? (
                                      <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>No evidence found</p>
                                    ) : (
                                      evidence.map((group) => (
                                        <div key={group.decision_id}>
                                          <p className="text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'rgba(201,184,150,0.5)' }}>
                                            Decision {group.decision_id.slice(0, 8)}…
                                          </p>
                                          <div className="space-y-1.5">
                                            {group.instances.map((inst, i) => (
                                              <div key={i} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(201,184,150,0.05)', border: '1px solid rgba(201,184,150,0.12)' }}>
                                                <div className="flex gap-1.5 mb-1">
                                                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(201,184,150,0.1)', color: 'rgba(201,184,150,0.6)' }}>{inst.source}</span>
                                                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(201,184,150,0.1)', color: 'rgba(201,184,150,0.6)' }}>{inst.field_type}</span>
                                                </div>
                                                <p className="text-xs leading-snug" style={{ color: 'var(--foreground)' }}>"{inst.raw_text}"</p>
                                                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{inst.statement}</p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
