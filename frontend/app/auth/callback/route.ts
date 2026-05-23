import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  console.log('[auth/callback] code:', code ? 'present' : 'missing', 'origin:', origin)

  const response = NextResponse.redirect(origin)

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet) =>
            toSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            ),
        },
      },
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    console.log('[auth/callback] exchange result:', error ? `error: ${error.message}` : `user: ${data.user?.id}`)
  }

  return response
}
