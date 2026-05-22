'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPage() {
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
          Eidoz · Privacy Policy
        </span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Title */}
        <div>
          <h1 className="text-4xl font-light tracking-wide mb-2" style={{ fontFamily: 'var(--font-serif)', color: 'var(--foreground)' }}>
            Privacy Policy
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Effective Date: May 21, 2026</p>
        </div>

        {/* Warning */}
        <div className="rounded-xl px-5 py-4 border" style={{ background: 'rgba(251,191,36,0.05)', borderColor: 'rgba(251,191,36,0.2)' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(251,191,36,0.8)' }}>
            This document is a legal framework. Please have it reviewed by a qualified legal professional before production use.
          </p>
        </div>

        <Section title="1. Information We Collect">
          <ul className="space-y-2">
            <Li><strong style={{ color: 'var(--foreground)' }}>Account Information:</strong> Name, email address, and credentials provided during registration.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>User Inputs:</strong> Content, queries, documents, and data submitted to the Platform.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>AI-Generated Outputs:</strong> Results produced by the Platform in response to user inputs.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Usage Analytics:</strong> Interaction data, session duration, feature usage, and error logs.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Technical & Device Information:</strong> IP address, browser type, OS, and device identifiers.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Payment Information:</strong> Billing details processed via trusted third-party payment providers (e.g., Stripe, Razorpay). Eidoz does not store raw card data.</Li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Data">
          <P>Collected information is used to:</P>
          <ul className="space-y-2">
            <Li>Operate, maintain, and improve the Eidoz Platform and its features.</Li>
            <Li>Personalise your experience and provide relevant AI-driven insights.</Li>
            <Li>Process billing and manage your subscription.</Li>
            <Li>Send service-related communications, updates, and support responses.</Li>
            <Li>Monitor for misuse, security threats, and policy violations.</Li>
            <Li>Comply with legal obligations and enforce these policies.</Li>
          </ul>
        </Section>

        <Section title="3. AI Training & Derived Data">
          <P>Eidoz may use anonymised outputs, aggregated usage patterns, and derived statistical insights to improve its AI systems. Eidoz will not directly reuse personally identifiable raw user inputs for AI training purposes without obtaining explicit, informed consent from the User.</P>
          <P>Where data is used for system improvement, it is de-identified and aggregated in a manner that prevents re-identification of individual users.</P>
        </Section>

        <Section title="4. GDPR Compliance (European Users)">
          <P>For users located in the European Economic Area (EEA), United Kingdom, or Switzerland, Eidoz processes personal data under the following legal bases:</P>
          <ul className="space-y-2">
            <Li><strong style={{ color: 'var(--foreground)' }}>Contractual Necessity:</strong> Processing required to provide the service you have contracted for.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Legitimate Interests:</strong> Processing necessary for fraud prevention, security, and service improvement, balanced against your rights.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Consent:</strong> For processing activities where we rely on your explicit permission (e.g., marketing communications or optional AI training participation).</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Legal Obligation:</strong> Processing required to comply with applicable laws.</Li>
          </ul>
          <P><strong style={{ color: 'var(--foreground)' }}>GDPR Rights:</strong> EEA users have the right to access, rectify, erase, restrict processing of, and port their personal data. You also have the right to object to processing and to withdraw consent at any time without affecting the lawfulness of prior processing.</P>
          <P><strong style={{ color: 'var(--foreground)' }}>Data Transfers:</strong> Where personal data is transferred outside the EEA, Eidoz ensures appropriate safeguards are in place, including Standard Contractual Clauses or equivalent mechanisms recognised under applicable data protection law.</P>
          <P>To exercise your GDPR rights, please contact Eidoz through the official support channel. We will respond within 30 days as required by applicable law.</P>
        </Section>

        <Section title="5. CCPA Compliance (California Users)">
          <P>For residents of California, the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA) provide additional rights:</P>
          <ul className="space-y-2">
            <Li><strong style={{ color: 'var(--foreground)' }}>Right to Know:</strong> You may request details about the categories and specific pieces of personal information we have collected about you, and the purposes for which it is used.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Right to Delete:</strong> You may request deletion of personal information we hold about you, subject to certain legal exceptions.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Right to Correct:</strong> You may request correction of inaccurate personal information.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Right to Opt-Out of Sale or Sharing:</strong> Eidoz does not sell personal data. If this changes, California residents will be provided a clear opt-out mechanism.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Right to Non-Discrimination:</strong> Eidoz will not discriminate against you for exercising your CCPA rights.</Li>
          </ul>
          <P>To submit a CCPA request, please contact Eidoz through the official support channel. We will respond within 45 days, with one possible 45-day extension where reasonably necessary.</P>
        </Section>

        <Section title="6. Payments">
          <P>Payments are processed through trusted third-party payment providers, including but not limited to Stripe and Razorpay. These providers are responsible for PCI-DSS compliance in relation to payment card data. Eidoz does not store, transmit, or process raw payment card information directly.</P>
        </Section>

        <Section title="7. Data Sharing">
          <P>Eidoz does not sell personal data to third parties. We may share data only in the following limited circumstances:</P>
          <ul className="space-y-2">
            <Li><strong style={{ color: 'var(--foreground)' }}>Service Providers:</strong> Trusted operational partners who assist in delivering the Platform (e.g., cloud hosting, analytics, customer support), bound by appropriate data processing agreements.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Payment Processors:</strong> As described in Section 6.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Legal Requirements:</strong> Where required by law, court order, or regulatory authority.</Li>
            <Li><strong style={{ color: 'var(--foreground)' }}>Business Transfers:</strong> In the event of a merger, acquisition, or asset sale, with appropriate notice provided to users.</Li>
          </ul>
        </Section>

        <Section title="8. Data Security">
          <P>Eidoz implements industry-standard security practices including encryption in transit and at rest, access controls, and periodic security reviews. However, no system is completely secure, and Eidoz cannot guarantee absolute security of your data.</P>
          <P>In the event of a data breach that poses a risk to your rights and freedoms, Eidoz will notify affected users and relevant regulatory authorities in accordance with applicable law.</P>
        </Section>

        <Section title="9. User Rights">
          <P>All users, regardless of location, may:</P>
          <ul className="space-y-2">
            <Li>Request access to personal information held about them.</Li>
            <Li>Request correction of inaccurate data.</Li>
            <Li>Request deletion of their account and associated data (subject to legal retention obligations).</Li>
            <Li>Withdraw consent where processing is based on consent.</Li>
          </ul>
          <P>Requests can be submitted via the official Eidoz support channel. We aim to respond within 30 days.</P>
        </Section>

        <Section title="10. Cookies & Analytics">
          <P>Eidoz uses cookies and similar tracking technologies to improve platform functionality, remember preferences, and analyse usage. You may control cookie preferences through your browser settings or any in-platform consent mechanism provided.</P>
          <P>Third-party analytics tools (e.g., Google Analytics or equivalent) may be used, and their use is governed by their respective privacy policies. We encourage you to review those policies.</P>
        </Section>

        <Section title="11. Data Retention">
          <P>Eidoz retains personal data for as long as necessary to provide the service, comply with legal obligations, resolve disputes, and enforce agreements. When data is no longer required, it is securely deleted or anonymised.</P>
          <P>Upon account deletion, we will endeavour to delete or anonymise your personal data within 90 days, except where retention is required by law.</P>
        </Section>

        <Section title="12. Children's Privacy">
          <P>Eidoz is not directed at children under the age of 13, or the minimum legal age in the applicable jurisdiction. We do not knowingly collect personal data from children. If we become aware that a child has provided personal data, we will take steps to delete it promptly.</P>
        </Section>

        <Section title="13. Changes to This Policy">
          <P>Eidoz may update this Privacy Policy as its systems, services, or regulatory obligations evolve. Material changes will be communicated with at least 14 days' advance notice via email or in-platform notification. Continued use after the effective date constitutes acceptance of the updated policy.</P>
        </Section>

        <Section title="14. Contact & Data Controller">
          <P>Eidoz is the data controller for personal data processed through the Platform. For privacy-related questions, requests, or concerns, please contact Eidoz through the official support channel available on the Platform.</P>
          <P>If you are an EEA user and believe your data protection rights have not been respected, you have the right to lodge a complaint with your local supervisory authority.</P>
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
