'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  const signInWithEmail = async () => {
    if (!email.trim()) return
    setLoading(true)
    await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setLoading(false)
    setSent(true)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      <div className="flex flex-col items-center gap-8 w-full max-w-md px-4 -mt-24">
        {/* Brand */}
        <div className="text-center">
          <h1
            className="text-6xl font-light tracking-widest mb-2"
            style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}
          >
            Eidoz
          </h1>
          <p className="text-base tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
            Think Clearly. Decide Better.
          </p>
        </div>

        {sent ? (
          <div className="text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Check your inbox — we sent a magic link to <strong style={{ color: 'var(--foreground)' }}>{email}</strong>
          </div>
        ) : (
          <div className="flex flex-col gap-3 w-full">
            {/* Google */}
            <button
              onClick={signInWithGoogle}
              className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium transition-colors cursor-pointer"
              style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card)')}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-sm tracking-widest" style={{ color: 'var(--muted-foreground)' }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            {/* Email */}
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && signInWithEmail()}
              className="w-full px-4 py-3 rounded-lg text-base outline-none"
              style={{
                background: 'var(--card)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />

            <button
              onClick={signInWithEmail}
              disabled={loading || !email.trim()}
              className="w-full px-4 py-3 rounded-lg text-base font-medium transition-opacity cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--foreground)', color: 'var(--background)' }}
            >
              {loading ? 'Sending…' : 'Continue with email'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}
