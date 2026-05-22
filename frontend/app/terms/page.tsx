'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b px-6 py-4 flex items-center gap-4" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg transition-colors hover:bg-secondary/50"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
          Eidoz · Terms of Service
        </span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Title */}
        <div>
          <h1 className="text-4xl font-light tracking-wide mb-2" style={{ fontFamily: 'var(--font-serif)', color: 'var(--foreground)' }}>
            Terms of Service
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Effective Date: May 21, 2026</p>
        </div>

        {/* Warning */}
        <div className="rounded-xl px-5 py-4 border" style={{ background: 'rgba(251,191,36,0.05)', borderColor: 'rgba(251,191,36,0.2)' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(251,191,36,0.8)' }}>
            This document is a legal framework. Please have it reviewed by a qualified legal professional before production use. It applies to both individual (B2C) and business (B2B) users of Eidoz.
          </p>
        </div>

        <Section title="1. Acceptance of Terms">
          <P>By accessing, registering for, or using Eidoz (the "Platform"), you ("User") agree to be legally bound by these Terms of Service ("Terms"). If you are using Eidoz on behalf of a business or organisation ("Business User"), you represent that you have authority to bind that entity, and these Terms apply to both you and the entity.</P>
          <P>Users must be at least 13 years of age, or the minimum legal age required in their jurisdiction, whichever is greater. Business Users must be legally registered entities.</P>
        </Section>

        <Section title="2. Description of Service">
          <P>Eidoz is an AI-powered decision-support system that generates structured insights, simulations, and reasoning assistance based on user-provided inputs. The Platform is intended for informational and productivity purposes only.</P>
          <P>Eidoz serves both individual consumers and businesses. Certain features, data limits, or integrations may be restricted to specific subscription tiers.</P>
        </Section>

        <Section title="3. Accounts & Access">
          <P>Users are responsible for maintaining the confidentiality of their account credentials and for all activity that occurs under their account. You must notify Eidoz immediately of any unauthorised use.</P>
          <P>Eidoz reserves the right to suspend or terminate accounts for misuse, abuse, policy violations, or non-payment.</P>
        </Section>

        <Section title="4. Subscription & Billing">
          <P>Eidoz may offer monthly and yearly subscription plans with automatic renewal unless the User cancels prior to the renewal date. Pricing is subject to change with reasonable advance notice.</P>
          <P>Business Users may be subject to enterprise pricing, volume commitments, or separate order forms agreed upon in writing.</P>
        </Section>

        <Section title="5. Refund & Cancellation Policy">
          <Group label="Individual (B2C) Users">
            <Li>Monthly plans: You may cancel at any time. No refunds are issued for the current billing period; access continues until the period ends.</Li>
            <Li>Yearly plans: Refunds may be requested within 7 days of the initial purchase or annual renewal date. After 7 days, no refunds will be issued for the remaining period.</Li>
          </Group>
          <Group label="Business (B2B) Users">
            <Li>Enterprise or custom plan refunds are governed by the applicable order form or service agreement.</Li>
            <Li>Eidoz reserves the right to offer pro-rated credits at its discretion in exceptional circumstances.</Li>
          </Group>
          <P>To cancel, Users must do so through account settings or by contacting the official Eidoz support channel. Cancellation takes effect at the end of the current billing cycle.</P>
        </Section>

        <Section title="6. Intellectual Property">
          <P>All platform systems, branding, interface designs, algorithms, and proprietary workflows remain the exclusive intellectual property of Eidoz. Nothing in these Terms transfers any ownership rights to Users.</P>
          <P>Users retain ownership of their original input content. By submitting inputs, Users grant Eidoz a limited, non-exclusive licence to process that content solely for the purpose of delivering the service.</P>
        </Section>

        <Section title="7. AI Disclaimer">
          <P>AI-generated outputs may be inaccurate, incomplete, or contextually inappropriate. Outputs must not be construed as legal, financial, medical, psychological, or other professional advice.</P>
          <P>Eidoz makes no warranty regarding the accuracy, reliability, or fitness for purpose of any AI-generated content. Users should independently verify all outputs before relying upon them for any decision.</P>
        </Section>

        <Section title="8. Decision Responsibility">
          <P>Users remain fully and solely responsible for all decisions, actions, and outcomes resulting from their use of Eidoz. Eidoz is a tool to support decision-making, not to replace professional judgment.</P>
        </Section>

        <Section title="9. Data Usage">
          <P>Eidoz may use anonymised or aggregated derived insights to improve system performance. Eidoz will not directly reuse personally identifiable raw user inputs for training or product improvement without explicit consent.</P>
          <P>For further details on how data is collected and used, please refer to the Eidoz Privacy Policy.</P>
        </Section>

        <Section title="10. Restrictions">
          <P>Users may not:</P>
          <ul className="space-y-2 mt-2">
            <Li>Reverse engineer, decompile, or attempt to extract source code from the Platform.</Li>
            <Li>Scrape, crawl, or automate requests to the Platform without express written permission.</Li>
            <Li>Use the Platform to generate content that is illegal, harmful, defamatory, or fraudulent.</Li>
            <Li>Resell, sublicense, or otherwise commercialise the service without authorisation.</Li>
          </ul>
        </Section>

        <Section title="11. Limitation of Liability">
          <P>To the maximum extent permitted by applicable law, Eidoz shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Platform.</P>
          <P>In any event, Eidoz's total liability shall not exceed the amounts paid by the User in the subscription cycle immediately preceding the claim.</P>
        </Section>

        <Section title="12. Dispute Resolution & Arbitration">
          <P><strong style={{ color: 'var(--foreground)' }}>Informal Resolution:</strong> Before initiating any formal proceeding, Users agree to contact Eidoz via the official support channel and attempt to resolve the dispute informally for a period of 30 days.</P>
          <P><strong style={{ color: 'var(--foreground)' }}>Arbitration:</strong> If informal resolution fails, disputes shall be resolved through binding arbitration under mutually agreed arbitration rules, or as specified in the applicable governing law. The arbitration shall be conducted in English.</P>
          <P><strong style={{ color: 'var(--foreground)' }}>Class Action Waiver:</strong> To the extent permitted by law, Users waive any right to bring or participate in class action proceedings against Eidoz.</P>
          <P><strong style={{ color: 'var(--foreground)' }}>Exceptions:</strong> Either party may seek emergency injunctive relief from a court of competent jurisdiction to prevent irreparable harm, without waiving the right to arbitration.</P>
        </Section>

        <Section title="13. Termination">
          <P>Eidoz reserves the right to suspend or terminate access to the Platform at any time for material violations of these Terms, with or without notice depending on the severity of the breach.</P>
          <P>Upon termination, the User's right to access the Platform ceases immediately. Provisions that by their nature should survive (including IP, limitation of liability, and dispute resolution) shall continue to apply.</P>
        </Section>

        <Section title="14. Governing Law">
          <P>These Terms shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law principles.</P>
          <P>For Users located outside India, local mandatory consumer protection laws may additionally apply and are not excluded by these Terms.</P>
        </Section>

        <Section title="15. Modifications to Terms">
          <P>Eidoz reserves the right to update these Terms at any time. Material changes will be communicated with reasonable advance notice (at minimum 14 days) via email or in-platform notification. Continued use after the effective date constitutes acceptance.</P>
        </Section>

        <Section title="16. Contact">
          <P>For questions or concerns regarding these Terms, please contact Eidoz through the official support channel available on the Platform.</P>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 pb-10 border-b" style={{ borderColor: 'var(--border)' }}>
      <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{children}</p>
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
      <span className="mt-2 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--muted-foreground)' }} />
      {children}
    </li>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}
