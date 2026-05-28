'use client'

import { useEffect, useRef, useState } from 'react'

const SLIDES = [
  {
    id: 'beginning',
    label: 'The Beginning',
    heading: 'Humans Have Always Decided',
    body: [
      'Every decision you will ever make is preceded by one question.',
      'Not "what should I do?"',
      '"What happens if I\'m wrong?"',
      'For most of human history, the cost of being wrong was local. One tribe. One season. One failure.',
      'That era ended. The cost of being wrong compounded.',
    ],
    punch: 'Your gut is a fossil record of survival.',
  },
  {
    id: 'collapse',
    label: 'The Collapse',
    heading: 'The Collapse of Clarity',
    body: [
      'The world did not get harder to survive. It got harder to see.',
      'A single hiring decision now touches your runway, your product velocity, your investor narrative, your team culture, your next 18 months.',
      'Every variable connects to three others. Every assumption hides two more.',
      'You are not less capable than the founders who came before.',
    ],
    punch: 'You are navigating something they never faced.',
  },
  {
    id: 'founder',
    label: 'The Founder',
    heading: 'You know this feeling',
    body: [
      '2am. A decision that cannot wait.',
      'Hire or delay. Launch or iterate. Raise or bootstrap. Pivot or hold.',
      'You have advisors who disagree. Data that points both ways. A gut that has been wrong before. And the quiet, terrifying knowledge that this choice will compound for years.',
    ],
    punch: 'This is the loneliest moment in building something.',
  },
  {
    id: 'clarity',
    label: 'The Process',
    heading: 'A Process Problem',
    body: [
      'Most bad decisions don\'t feel bad when you make them.',
      'They feel reasonable. They feel urgent. They feel like the only option.',
      'The assumption you didn\'t question. The risk you didn\'t name. The scenario you didn\'t pressure test.',
      'These are not failures of intelligence. They are failures of process.',
      'And process is something you can fix.',
    ],
    punch: 'Name it. And suddenly the fog lifts.',
  },
  {
    id: 'clarify',
    label: 'Clarify',
    heading: 'The First Act: Clarify',
    body: [
      'Before you can decide well, you have to know what you\'re deciding.',
      'Most founders skip this. They carry hidden assumptions they never named. They optimise for the wrong outcome. They solve a symptom, not the problem.',
      'Eidoz begins before the options. Before the analysis.',
      'It asks you one question at a time until what seemed like a complex decision becomes a precise one.',
      'Clarity is not a step. It is what makes every other step possible.',
    ],
    punch: 'Name it. Frame it. Own it.',
  },
  {
    id: 'pressure',
    label: 'Pressure',
    heading: 'The Second Act: Pressure',
    body: [
      'Socrates didn\'t give answers. He asked better questions.',
      'The greatest philosophical tradition in human history was not about providing wisdom , it was about exposing the weakness in your own thinking.',
      'Eidoz runs your decision through structured pressure testing. Scenario by scenario. What if your core assumption breaks? What if the market moves? What if the hire doesn\'t work out?',
      'Not to paralyse you. To prepare you.',
    ],
    punch: 'A decision tested under pressure before it\'s made is a decision made with open eyes.',
  },
  {
    id: 'verdict',
    label: 'The Verdict',
    heading: 'Not a recommendation. A reckoning.',
    body: [
      'Everything you structured. Every assumption you named. Every pressure scenario you answered.',
      'Eidoz synthesises it into one verdict',
      'The recommended path. The reasons it holds. The risks that must be watched. The single experiment that would prove your thesis before you go all in.',
      'It doesn\'t decide for you. It shows you what you actually think and whether that thinking holds.',
    ],
    punch: 'The verdict is yours. The clarity is Eidoz\'s.',
  },
  {
    id: 'simulation2',
    label: 'Simulation',
    heading: 'What if you could see the future not as a prediction, but as a landscape?',
    body: [
      '10,000 simulated variables. Each one built from your actual decision your runway, your conversion rate, your burn.',
      'Some futures are good. Some are fatal. Most are somewhere in between.',
      'Eidoz shows you the distribution not to tell you what will happen, but to show you what you\'re betting on when you make this decision.',
      'Uncertainty doesn\'t disappear. It becomes visible.',
    ],
    punch: 'And visible uncertainty is something you can act on.',
  },
  {
    id: 'patterns',
    label: 'Your Thinking Patterns',
    heading: 'Your Thinking Patterns',
    body: [
      'The most dangerous bias in decision-making is the one you can\'t see in yourself.',
      'You have patterns. Every founder does. The way you over-index on speed. The way you avoid the hard conversation. The way you convince yourself the risk is smaller than it is.',
      'These patterns don\'t announce themselves. They show up in your answers. In what you skip. In what you never question.',
      'Eidoz watches.',
      'Across every decision you make, it builds a map of your thinking your blind spots, your recurring assumptions, your untested beliefs.',
      'Not to judge you. To show you what no advisor can the shape of your own mind under pressure.',
    ],
    punch: 'The best founders don\'t just make better decisions. They become better decision-makers.',
  },
  {
    id: 'longgame',
    label: 'The Necessity',
    heading: 'The Necessity',
    body: [
      'You will make dozens of high-stakes decisions in the next 24 months.',
      'Some of them you will get right. Some of them you will get wrong.',
      'The question is not whether you will make mistakes. The question is whether you will make the same ones twice.',
      'Whether you will carry the same blind spots into the next decision, and the one after that.',
      'Eidoz exists for one reason',
      'To make sure that when you look back at the decisions you made, you can say:',
      'I thought it through. I tested my assumptions. I knew what I was risking.',
    ],
    punch: 'I decided with open eyes.',
  },
]

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [ctaActive, setCtaActive] = useState(false)
  const [heroVisible, setHeroVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const ctaRef = useRef<HTMLDivElement | null>(null)
  const heroRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observers: IntersectionObserver[] = []

    sectionRefs.current.forEach((section, i) => {
      if (!section) return
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveIndex(i) },
        { root, threshold: 0.4 }
      )
      observer.observe(section)
      observers.push(observer)
    })

    return () => observers.forEach(o => o.disconnect())
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!ctaRef.current || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => setCtaActive(entry.isIntersecting),
      { root, threshold: 0.3 }
    )
    observer.observe(ctaRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handle = () => setHeroVisible(el.scrollTop < el.clientHeight * 0.8)
    el.addEventListener('scroll', handle, { passive: true })
    return () => el.removeEventListener('scroll', handle)
  }, [])

  const scrollTo = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ background: '#0a0a0a', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* NAVBAR — full width, always on top */}
      <div style={{
        flexShrink: 0,
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        padding: isMobile ? '0 20px' : '0 40px',
        background: '#0a0a0a',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '36px', height: '36px' }}>
            <circle cx="20" cy="20" r="16" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" strokeDasharray="85 15" transform="rotate(-90 20 20)" />
            <defs>
              <linearGradient id="lg" x1="20" y1="4" x2="20" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#c9b896" />
                <stop offset="1" stopColor="#8a8279" />
              </linearGradient>
            </defs>
          </svg>
          <span style={{
            fontSize: '14px',
            letterSpacing: '0.3em',
            color: '#d4c8b8',
            fontFamily: 'var(--font-inter), Inter, sans-serif',
            fontWeight: 500,
          }}>
            EIDOZ
          </span>
        </div>
        <span style={{
          fontSize: isMobile ? '13px' : '20px',
          letterSpacing: isMobile ? '0.04em' : '0.08em',
          color: 'rgba(201,184,150,0.85)',
          fontFamily: 'Georgia, serif',
          fontStyle: 'normal',
          fontWeight: 400,
          marginRight: isMobile ? '0' : '120px',
        }}>
          Think Clearly, Decide Better.
        </span>
      </div>

      {/* CONTENT ROW — left chain + right scroll */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* LEFT — timeline chain */}
      <div style={{
        width: '280px',
        flexShrink: 0,
        height: '100%',
        display: isMobile ? 'none' : 'flex',
        flexDirection: 'column',
        opacity: (ctaActive || heroVisible) ? 0 : 1,
        transition: 'opacity 0.8s ease',
        pointerEvents: (ctaActive || heroVisible) ? 'none' : 'auto',
      }}>

        {/* Spine + nodes */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '54px', flex: 1, padding: '40px 0 40px 40px' }}>
          {/* Single continuous spine line — connects first to last node */}
          <div style={{
            position: 'absolute',
            left: '45px',
            top: '47px',
            bottom: '47px',
            width: '1px',
            background: 'rgba(201,184,150,0.12)',
          }} />
          <div style={{
            position: 'absolute',
            left: '45px',
            top: '47px',
            width: '1px',
            height: `${(activeIndex / (SLIDES.length - 1)) * 100}%`,
            maxHeight: 'calc(100% - 94px)',
            background: 'rgba(201,184,150,0.6)',
            transition: 'height 0.6s ease',
          }} />

          {SLIDES.map((slide, i) => (
            <div key={slide.id} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>

              <button
                ref={el => { nodeRefs.current[i] = el }}
                onClick={() => scrollTo(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '2px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {/* Dot */}
                <div style={{
                  width: i === activeIndex ? '14px' : '10px',
                  height: i === activeIndex ? '14px' : '10px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: i === activeIndex
                    ? 'rgba(201,184,150,1)'
                    : i < activeIndex
                      ? 'rgba(201,184,150,0.4)'
                      : 'transparent',
                  border: `1px solid ${i <= activeIndex ? 'rgba(201,184,150,0.8)' : 'rgba(201,184,150,0.2)'}`,
                  boxShadow: i === activeIndex ? '0 0 16px 4px rgba(201,184,150,0.6)' : 'none',
                  transition: 'all 0.5s ease',
                }} />

                {/* Label */}
                <span style={{
                  fontSize: '16px',
                  letterSpacing: '0.08em',
                  color: i === activeIndex
                    ? 'rgba(201,184,150,1)'
                    : i < activeIndex
                      ? 'rgba(201,184,150,0.45)'
                      : 'rgba(237,237,237,0.25)',
                  transition: 'color 0.5s ease',
                  fontFamily: 'Georgia, serif',
                  whiteSpace: 'nowrap',
                }}>
                  {slide.label}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', height: '100%' }}>

        {/* Hero — full screen intro */}
        <div ref={heroRef} style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '40px 24px 80px' : '40px 80px 140px',
          marginLeft: isMobile ? '0' : '-280px',
          width: isMobile ? '100%' : 'calc(100% + 280px)',
          position: 'relative',
        }}>
          <p style={{
            fontSize: 'clamp(20px, 2.6vw, 30px)',
            fontFamily: 'Georgia, serif',
            fontStyle: 'normal',
            color: 'rgba(237,237,237,0.72)',
            lineHeight: 1.9,
            maxWidth: '900px',
            textAlign: 'center',
          }}>
            <span
              onClick={() => scrollTo(0)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >History</span> has always demanded decisions but <span
              onClick={() => scrollTo(1)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >navigating</span> through them has never been harder.
            When everything <span
              onClick={() => scrollTo(2)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >falls apart</span> and fog clouds your <span
              onClick={() => scrollTo(3)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >process</span>. <span
              onClick={() => scrollTo(4)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >Clarity</span> becomes your first act of courage,
            you <span
              onClick={() => scrollTo(5)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >pressure-test</span> your assumptions, deliver a <span
              onClick={() => scrollTo(6)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >verdict</span>, run a <span
              onClick={() => scrollTo(7)}
              style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
            >simulation</span> on how you actually think
            not how you wish you did.
            <br /><br />
            <span style={{ color: 'rgba(201,184,150,0.9)', fontStyle: 'normal', letterSpacing: '0.04em' }}>
              Eidoz is not a <span
                onClick={() => scrollTo(8)}
                style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
              >feature</span>. Eidoz is the <span
                onClick={() => scrollTo(9)}
                style={{ textDecoration: 'underline', textDecorationColor: 'rgba(201,184,150,0.8)', textUnderlineOffset: '5px', textDecorationThickness: '1px', cursor: 'pointer', color: 'rgba(201,184,150,1)' }}
              >necessity</span>.
            </span>
          </p>
        </div>

        {SLIDES.map((slide, i) => (
          <Section
            key={slide.id}
            ref={el => { sectionRefs.current[i] = el }}
            index={i}
            slide={slide}
            active={activeIndex === i}
            isMobile={isMobile}
          />
        ))}

        {/* Final CTA */}
        <div ref={ctaRef} style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '60px 24px' : '80px',
          marginLeft: isMobile ? '0' : '-280px',
          width: isMobile ? '100%' : 'calc(100% + 280px)',
          borderTop: '1px solid rgba(201,184,150,0.1)',
        }}>
          <p style={{
            fontSize: '18px',
            letterSpacing: '0.3em',
            color: 'rgba(201,184,150,0.5)',
            marginBottom: '24px',
            fontFamily: 'Georgia, serif',
          }}>
            EIDOZ
          </p>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontFamily: 'Georgia, serif',
            color: '#ededed',
            textAlign: 'center',
            lineHeight: 1.4,
            maxWidth: '600px',
            marginBottom: '16px',
            fontWeight: 400,
          }}>
            Structure your thinking.<br />
            Face your assumptions.<br />
            Think clearly, decide better.
          </h2>
          <p style={{
            color: 'rgba(237,237,237,0.4)',
            fontSize: '22px',
            marginTop: '8px',
            marginBottom: '48px',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
          }}>
            For the founder who refuses to guess.
          </p>
          <a
            href="https://eidoz.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '16px 52px',
              border: 'none',
              color: '#0a0a0a',
              fontSize: '15px',
              letterSpacing: '0.2em',
              textDecoration: 'none',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontWeight: 600,
              transition: 'all 0.3s ease',
              background: 'linear-gradient(135deg, rgba(201,184,150,1) 0%, rgba(212,200,184,1) 50%, rgba(180,162,130,1) 100%)',
              borderRadius: '2px',
              boxShadow: '0 4px 24px rgba(201,184,150,0.25), 0 1px 4px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={e => {
              (e.target as HTMLAnchorElement).style.boxShadow = '0 6px 32px rgba(201,184,150,0.45), 0 2px 8px rgba(0,0,0,0.4)'
              ;(e.target as HTMLAnchorElement).style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              (e.target as HTMLAnchorElement).style.boxShadow = '0 4px 24px rgba(201,184,150,0.25), 0 1px 4px rgba(0,0,0,0.4)'
              ;(e.target as HTMLAnchorElement).style.transform = 'translateY(0)'
            }}
          >
            GET STARTED
          </a>
        </div>
      </div>
      </div>
    </div>
  )
}

import { forwardRef } from 'react'

const Section = forwardRef<HTMLDivElement, {
  index: number
  slide: typeof SLIDES[0]
  active: boolean
  isMobile: boolean
}>(({ index, slide, active, isMobile }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '60px 24px' : '80px 80px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        opacity: active ? 1 : 0.35,
        transform: active ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
        width: '100%',
      }}
    >
      <div style={{ width: '100%', maxWidth: '680px' }}>
      {/* Index marker */}
      <p style={{
        fontSize: '18px',
        letterSpacing: '0.25em',
        color: 'rgba(201,184,150,0.45)',
        marginBottom: '20px',
        fontFamily: 'Georgia, serif',
      }}>
        — {String(index + 1).padStart(2, '0')} —
      </p>

      {/* Heading */}
      <h2 style={{
        fontSize: 'clamp(22px, 3vw, 36px)',
        fontFamily: 'Georgia, serif',
        fontWeight: 400,
        color: '#ededed',
        lineHeight: 1.35,
        marginBottom: '40px',
        maxWidth: '620px',
      }}>
        {slide.heading}
      </h2>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '48px' }}>
        {(slide.body ?? []).map((para, j) => (
          <p key={j} style={{
            fontSize: isMobile ? '17px' : '20px',
            lineHeight: 1.85,
            color: 'rgba(237,237,237,0.65)',
            fontFamily: 'Georgia, serif',
            maxWidth: '580px',
          }}>
            {para}
          </p>
        ))}
      </div>


      {/* Punch line */}
      <p style={{
        fontSize: '22px',
        fontStyle: 'italic',
        color: 'rgba(201,184,150,0.85)',
        fontFamily: 'Georgia, serif',
        lineHeight: 1.6,
        maxWidth: '520px',
      }}>
        {slide.punch}
      </p>
      </div>
    </div>
  )
})

Section.displayName = 'Section'
