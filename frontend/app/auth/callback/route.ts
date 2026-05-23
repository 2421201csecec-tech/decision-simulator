import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

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
    await supabase.auth.exchangeCodeForSession(code)
  }

  return response
}
