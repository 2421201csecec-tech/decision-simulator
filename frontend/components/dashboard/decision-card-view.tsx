'use client'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Target, Lock, AlertTriangle, TrendingUp, Lightbulb, Sparkles, DollarSign, Clock, Users, XCircle, TimerOff, AlertCircle, Download } from 'lucide-react'
import {
  fetchDecisionOutput,
  fetchClarifyDraft,
  fetchSimulationState,
} from '@/lib/api/threads'
import type { DecisionOutputData } from '@/lib/api/threads'
import type { ClarifyDraft } from '@/lib/server/thread-store'

interface Props {
  threadId: string
  onBack: () => void
  onFailureAnalysis: () => void
}

function Node({
  label,
  sublabel,
  children,
  accent,
  icon,
  large,
}: {
  label: string
  sublabel?: string
  children?: React.ReactNode
  accent?: 'gold' | 'red' | 'green' | 'dim'
  icon?: React.ReactNode
  large?: boolean
}) {
  const border =
    accent === 'red' ? 'rgba(220,80,60,0.45)' :
    accent === 'green' ? 'rgba(80,200,120,0.45)' :
    'rgba(201,184,150,0.45)'

  const bg = '#1a1610'

  const glow =
    accent === 'red' ? '0 0 8px rgba(220,80,60,0.15)' :
    accent === 'green' ? '0 0 8px rgba(80,200,120,0.15)' :
    '0 0 10px rgba(201,184,150,0.15)'

  return (
    <div
      className="rounded-lg border flex flex-col items-center justify-center"
      style={{
        background: bg,
        borderColor: border,
        borderWidth: '2px',
        boxShadow: glow,
        padding: large ? '0.625rem 0.875rem' : '0.75rem 1rem',
        height: large ? undefined : undefined,
      }}
    >
      <div className="flex flex-col items-center gap-0 shrink-0 text-center">
        {icon && (
          <div className="w-10 h-10 rounded-full border flex items-center justify-center shrink-0"
            style={{ borderColor: border, background: 'rgba(201,184,150,0.1)', boxShadow: '0 0 8px rgba(201,184,150,0.2)' }}>
            {icon}
          </div>
        )}
        <div>
          <p className="font-semibold uppercase tracking-widest" style={{ fontSize: '0.8rem', color: '#c9b896' }}>{label}</p>
          {sublabel && <p className="text-xs mt-0.5" style={{ color: 'rgba(201,184,150,0.5)' }}>{sublabel}</p>}
        </div>
      </div>
      {children && <div className="flex-1 min-h-0 text-center">{children}</div>}
    </div>
  )
}


export default function DecisionCardView({ threadId, onBack }: Props) {
  const [decision, setDecision] = useState<DecisionOutputData | null>(null)
  const [draft, setDraft] = useState<ClarifyDraft | null>(null)
  const [extractionSchema, setExtractionSchema] = useState<Record<string, unknown> | null>(null)
  const [keyReasonLabels, setKeyReasonLabels] = useState<string[]>([])
  const [weakPointLabels, setWeakPointLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  async function handleDownload() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0f0b07',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `eidoz-decision-${threadId}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    Promise.all([
      fetchDecisionOutput(threadId).catch(() => null),
      fetchSimulationState(threadId).catch(() => ({ run: null, extractionSchema: null })),
      fetchClarifyDraft(threadId).catch(() => null),
    ]).then(async ([d, simState, dr]) => {
      setDecision(d)
      setExtractionSchema(simState.extractionSchema)
      setDraft(dr)

      const reasons = d?.keyReasons?.slice(0, 3) ?? []
      const weak = d?.weakPoints?.slice(0, 3) ?? []
      try {
        const [rRes, wRes] = await Promise.all([
          fetch('/api/summarize-labels', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ items: reasons, count: 3 }),
          }),
          fetch('/api/summarize-labels', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ items: weak, count: 3 }),
          }),
        ])
        const rData = await rRes.json()
        const wData = await wRes.json()
        setKeyReasonLabels(rData.labels ?? reasons)
        setWeakPointLabels(wData.labels ?? weak)
      } catch {
        setKeyReasonLabels(reasons.map(s => s.split(' ').slice(0, 3).join(' ')))
        setWeakPointLabels(weak.map(s => s.split(' ').slice(0, 3).join(' ')))
      }

      setLoading(false)
    })
  }, [threadId])

const rawTitle = decision?.decisionTitle || draft?.title || 'Untitled Decision'
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1)
  const finalDecision = decision?.finalDecision || 'Run simulation to finalise direction.'

  const simVariables = ((extractionSchema?.variables as Array<{ name?: string }> | undefined) ?? [])
    .map(v => v.name ? v.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null)
    .filter(Boolean).slice(0, 4) as string[]


  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: '#0f0b07', fontFamily: 'var(--font-sans)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(201,184,150,0.12)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            aria-label="Go back to previous screen"
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: 'rgba(201,184,150,0.6)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#c9b896')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,184,150,0.6)')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center" role="status" aria-live="polite">
          <p className="text-sm" style={{ color: 'rgba(201,184,150,0.5)' }}>Loading decision…</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-4 md:px-8 py-10">
          <div className="min-w-[900px] w-full max-w-7xl mx-auto">
            {/* ── Tree card ── */}
            <div
              ref={cardRef}
              className="relative w-full rounded-3xl border"
              style={{ borderColor: 'rgba(201,184,150,0.15)', background: '#120d08' }}
            >
            <div className="relative px-10 pt-16 pb-10 flex flex-col">
              {/* Title + subheading — top left */}
              <div className="absolute top-5 left-6">
                <h1 className="text-xl font-bold" style={{ color: '#f0d898' }}>Decision Card</h1>
                <p className="text-sm mt-0.5" style={{ color: '#c9b896' }}>Map your thinking. Make better decisions.</p>
              </div>

              {/* Eidoz branding — top right */}
              <div className="absolute top-5 right-6 flex items-center gap-2">
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
                  <circle cx="20" cy="20" r="16" stroke="url(#cardLogoGradient)" strokeWidth="2" strokeLinecap="round" strokeDasharray="85 15" transform="rotate(-90 20 20)" />
                  <defs>
                    <linearGradient id="cardLogoGradient" x1="20" y1="4" x2="20" y2="36" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#c9b896" />
                      <stop offset="1" stopColor="#8a8279" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="text-xl font-bold tracking-widest uppercase" style={{ color: '#c9b896', letterSpacing: '0.2em' }}>Eidoz</span>
              </div>

              {/* Row 1 — Decision Title */}
              <div className="flex justify-center">
                <div
                  className="rounded-2xl border px-6 py-3 text-center"
                  style={{ background: '#1a1610', borderColor: 'rgba(201,184,150,0.85)', borderWidth: '2.5px', boxShadow: '0 0 18px rgba(201,184,150,0.35), 0 0 40px rgba(201,184,150,0.15)', minWidth: '28%', maxWidth: '40%' }}
                >
                  <h2 className="uppercase font-bold mb-1" style={{ fontSize: '0.75rem', letterSpacing: '0.15em', color: '#c9b896', textShadow: '0 0 6px rgba(201,184,150,0.4)' }}>Decision Title</h2>
                  <p className="text-xl font-semibold" style={{ color: '#f0d898', fontFamily: 'var(--font-serif)', textShadow: '0 0 12px rgba(201,184,150,0.7), 0 0 28px rgba(201,184,150,0.35)' }}>{title}</p>
                </div>
              </div>

              {/* Connector: title → 3 boxes */}
              <div className="relative" style={{ height: 70, marginTop: -1, zIndex: 2 }}>
                <div className="absolute" style={{ left: '50%', top: 0, width: 2, height: '100%', background: 'rgba(201,184,150,0.5)', transform: 'translateX(-50%)' }} />
                <div className="absolute" style={{ left: '17%', right: '17%', top: '50%', height: 2, background: 'rgba(201,184,150,0.4)', transform: 'translateY(-50%)' }} />
                <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)', zIndex: 3 }} />
                <div className="absolute" style={{ left: '17%', top: '50%', transform: 'translate(-50%,-50%)', width: 6, height: 6, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)', zIndex: 3 }} />
                <div className="absolute" style={{ right: '17%', top: '50%', transform: 'translate(50%,-50%)', width: 6, height: 6, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)', zIndex: 3 }} />
              </div>

              {/* Row 2 + sub-boxes — Key Reasons | Dependencies | Weak Points */}
              {(() => {
                const subIconStyle = { color: '#e0c97a', filter: 'drop-shadow(0 0 4px rgba(224,201,122,1)) drop-shadow(0 0 10px rgba(201,184,150,0.7))' }
                const cols = [
                  {
                    label: 'Key Reasons', accent: 'green' as const,
                    icon: <Target className="w-5 h-5" style={{ color: '#e0c97a', filter: 'drop-shadow(0 0 5px rgba(224,201,122,1)) drop-shadow(0 0 12px rgba(201,184,150,0.7))' }} />,
                    subIcons: [
                      <TrendingUp key="a" className="w-4 h-4" style={subIconStyle} />,
                      <Lightbulb key="b" className="w-4 h-4" style={subIconStyle} />,
                      <Sparkles key="c" className="w-4 h-4" style={subIconStyle} />,
                    ],
                    border: 'rgba(80,200,120,0.3)',
                    subGlow: '0 0 6px rgba(80,200,120,0.15)',
                    subItems: keyReasonLabels,
                    empty: '—',
                  },
                  {
                    label: 'Dependencies', accent: 'dim' as const,
                    icon: <Lock className="w-5 h-5" style={{ color: '#e0c97a', filter: 'drop-shadow(0 0 5px rgba(224,201,122,1)) drop-shadow(0 0 12px rgba(201,184,150,0.7))' }} />,
                    subIcons: [
                      <DollarSign key="a" className="w-4 h-4" style={subIconStyle} />,
                      <Clock key="b" className="w-4 h-4" style={subIconStyle} />,
                      <Users key="c" className="w-4 h-4" style={subIconStyle} />,
                    ],
                    border: 'rgba(201,184,150,0.45)',
                    subGlow: '0 0 10px rgba(201,184,150,0.15)',
                    subItems: simVariables.slice(0, 3),
                    empty: '—',
                  },
                  {
                    label: 'Weak Points', accent: 'red' as const,
                    icon: <AlertTriangle className="w-5 h-5" style={{ color: '#e0c97a', filter: 'drop-shadow(0 0 5px rgba(224,201,122,1)) drop-shadow(0 0 12px rgba(201,184,150,0.7))' }} />,
                    subIcons: [
                      <XCircle key="a" className="w-4 h-4" style={subIconStyle} />,
                      <TimerOff key="b" className="w-4 h-4" style={subIconStyle} />,
                      <AlertCircle key="c" className="w-4 h-4" style={subIconStyle} />,
                    ],
                    border: 'rgba(220,80,60,0.3)',
                    subGlow: '0 0 6px rgba(220,80,60,0.15)',
                    subItems: weakPointLabels,
                    empty: '—',
                  },
                ]
                return (
                  <div className="grid grid-cols-3 gap-10" style={{ padding: '0 4%' }}>
                    {cols.map((col, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        {/* drop line + dot from title connector */}
                        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: -28, height: 28, width: 2, background: 'rgba(201,184,150,0.4)', zIndex: 4 }} />
                        <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)', zIndex: 5 }} />

                        {/* Header box — icon + label */}
                        <Node label={col.label} accent={col.accent} icon={col.icon} />

                        {/* Mini 3-branch connector going down */}
                        <div style={{ position: 'relative', height: 90 }}>
                          <div style={{ position: 'absolute', left: '50%', top: 0, width: 2, height: '100%', background: 'rgba(201,184,150,0.5)', transform: 'translateX(-50%)' }} />
                          <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', height: 2, background: 'rgba(201,184,150,0.4)', transform: 'translateY(-50%)' }} />
                          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)' }} />
                          <div style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)' }} />
                          <div style={{ position: 'absolute', right: '8%', top: '50%', transform: 'translate(50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)' }} />
                        </div>

                        {/* 3 sub-boxes */}
                        <div className="grid grid-cols-3 gap-3">
                          {[0, 1, 2].map(j => (
                            <div key={j} style={{ position: 'relative' }}>
                              <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: -38, height: 38, width: 2, background: 'rgba(201,184,150,0.4)', zIndex: 4 }} />
                              <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 6px rgba(201,184,150,0.8)', zIndex: 5 }} />
                              <div className="rounded-xl border flex flex-col items-center justify-center gap-2" style={{ padding: '15px 16px', background: '#1a1610', borderColor: col.border, borderWidth: '1.5px', boxShadow: col.subGlow, aspectRatio: '4 / 3' }}>
                                <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(201,184,150,0.1)', border: '1px solid rgba(201,184,150,0.35)', boxShadow: '0 0 8px rgba(201,184,150,0.15)' }}>
                                  {col.subIcons[j]}
                                </div>
                                <p style={{ fontSize: '14px', fontWeight: 500, color: '#d4c49e', lineHeight: 1.4, textAlign: 'center', textShadow: '0 0 8px rgba(201,184,150,0.45)' }}>{col.subItems[j] ?? col.empty}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* connector line in the gap between sub-boxes and Final Verdict */}
              <div style={{ position: 'relative', height: 80, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 2, height: '100%', background: 'rgba(201,184,150,0.5)' }} />
              </div>

              {/* Final Verdict */}
              <div className="flex justify-center mb-8">
                <div className="rounded-2xl border flex flex-col items-center gap-2 text-center" style={{ position: 'relative', background: '#1a1610', borderColor: 'rgba(201,184,150,0.85)', borderWidth: '2.5px', boxShadow: '0 0 18px rgba(201,184,150,0.35), 0 0 40px rgba(201,184,150,0.15)', padding: '1.25rem 1.5rem', minWidth: '45%', maxWidth: '55%' }}>
                  <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 7, height: 7, borderRadius: '50%', background: '#c9b896', boxShadow: '0 0 7px rgba(201,184,150,0.9)', zIndex: 5 }} />
                  <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#e0c97a', textShadow: '0 0 8px rgba(224,201,122,0.9), 0 0 20px rgba(201,184,150,0.5)' }}>Final Verdict</p>
                  <p className="text-xl font-semibold leading-relaxed" style={{ color: '#f0d898', fontFamily: 'var(--font-serif)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 0 12px rgba(240,216,152,0.6), 0 0 28px rgba(201,184,150,0.3)' }}>{finalDecision}</p>
                </div>
              </div>

            </div>

            {/* Footer inside card */}
            <div className="flex items-center justify-between px-8 py-3 rounded-b-3xl" style={{ borderTop: '1px solid rgba(201,184,150,0.1)' }}>
              <p className="text-base font-semibold" style={{ color: '#c9b896' }}>Think clearly.</p>
              <p className="text-base font-semibold" style={{ color: '#c9b896' }}>Decide better.</p>
            </div>
          </div>
          </div>

          {/* Download button */}
          <div className="flex items-center justify-center mt-6 pb-4">
            <button
              onClick={handleDownload}
              disabled={downloading}
              aria-label="Download decision card as PNG"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-colors"
              style={{ background: '#1a1610', borderColor: 'rgba(201,184,150,0.3)', color: '#c9b896', opacity: downloading ? 0.6 : 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(201,184,150,0.6)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(201,184,150,0.3)')}
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Saving…' : 'Download PNG'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
