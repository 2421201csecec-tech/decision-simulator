'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type Section = 'account' | 'data-privacy'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<'threads' | 'account' | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<Section>('account')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user)
        setDisplayName(data.user.user_metadata?.full_name ?? '')
      }
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveName = async () => {
    if (!displayName.trim()) return
    setLoading('name')
    await supabase.auth.updateUser({ data: { full_name: displayName.trim() } })
    setLoading(null)
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  const deleteAllThreads = async () => {
    setLoading('threads')
    await fetch('/api/user/threads', { method: 'DELETE' })
    setLoading(null)
    setConfirmDelete(null)
  }

  const deleteAccount = async () => {
    setLoading('account')
    await fetch('/api/user/account', { method: 'DELETE' })
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isGoogle = user?.app_metadata?.provider === 'google'

  const navItems: { id: Section; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'data-privacy', label: 'Data & Privacy' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        className="relative flex rounded-2xl border overflow-hidden"
        style={{ width: 860, maxHeight: '92vh', background: 'var(--card)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar */}
        <aside className="w-52 shrink-0 border-r px-4 py-7" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-base font-medium mb-5 px-2" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>
            Settings
          </h1>
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); setConfirmDelete(null) }}
                className="w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  background: activeSection === item.id ? 'var(--secondary)' : 'transparent',
                  color: activeSection === item.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                  fontWeight: activeSection === item.id ? 500 : 400,
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Right content */}
        <main className="flex-1 px-8 py-7 overflow-y-auto">
          {/* Account */}
          {activeSection === 'account' && (
            <div className="space-y-1">
              <h2 className="text-lg font-medium mb-6" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>Account</h2>

              <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <label className="text-sm" style={{ color: 'var(--foreground)' }}>Display name</label>
                <div className="flex gap-2 items-center">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    className="w-40 px-3 py-1.5 rounded-lg text-sm outline-none text-right"
                    style={{ background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                  <button
                    onClick={saveName}
                    disabled={loading === 'name'}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                  >
                    {nameSaved ? 'Saved ✓' : loading === 'name' ? '…' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <label className="text-sm" style={{ color: 'var(--foreground)' }}>Email</label>
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{user?.email ?? '—'}</span>
              </div>

              <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <label className="text-sm" style={{ color: 'var(--foreground)' }}>Signed in with</label>
                <div className="flex items-center gap-2">
                  {isGoogle && (
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                    </svg>
                  )}
                  <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    {isGoogle ? 'Google' : user?.app_metadata?.provider ?? '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm" style={{ color: 'var(--foreground)' }}>Delete account</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Permanently remove your account and all data</p>
                </div>
                {confirmDelete === 'account' ? (
                  <div className="flex gap-2 items-center">
                    <button onClick={deleteAccount} disabled={loading === 'account'}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: '#ef4444', color: '#fff' }}>
                      {loading === 'account' ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete('account')}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--secondary)', color: '#ef4444', border: '1px solid var(--border)' }}>
                    Delete account
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Data & Privacy */}
          {activeSection === 'data-privacy' && (
            <div className="space-y-1">
              <h2 className="text-lg font-medium mb-6" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>Data & Privacy</h2>

              <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm" style={{ color: 'var(--foreground)' }}>Export all decisions</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Download all your threads as JSON</p>
                </div>
                <button onClick={() => { window.location.href = '/api/threads/export/all' }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
                  Export
                </button>
              </div>

              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm" style={{ color: 'var(--foreground)' }}>Delete all threads</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Permanently remove all your decisions</p>
                </div>
                {confirmDelete === 'threads' ? (
                  <div className="flex gap-2 items-center">
                    <button onClick={deleteAllThreads} disabled={loading === 'threads'}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: '#ef4444', color: '#fff' }}>
                      {loading === 'threads' ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete('threads')}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--secondary)', color: '#ef4444', border: '1px solid var(--border)' }}>
                    Delete all
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--muted-foreground)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
