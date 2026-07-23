// Edge Function: add-team-member
//
// Creates a new auth user and sets their profile role. This CANNOT be done
// from the browser: creating users requires the Supabase service_role key,
// which must never ship in client code. This function runs server-side, where
// Supabase injects SUPABASE_SERVICE_ROLE_KEY automatically.
//
// Security: the function first verifies the CALLER is an active manager using
// the JWT the browser sends, and only then uses the service_role key to create
// the account. The on_auth_user_created trigger (see 0001_initial_schema.sql)
// inserts the matching profiles row; we set the role afterwards.
//
// Deploy:  supabase functions deploy add-team-member --project-ref <ref>

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RANK: Record<string, number> = {
  audio_manager: 100,
  full_time: 80,
  three_quarter_time: 60,
  student_trainer: 40,
  student: 20,
  freelancer: 20,
  non_audio_student: 20,
  office_student: 10,
}
const ROLES = Object.keys(RANK)
type Role = string

// Highest rank the caller may assign (mirrors max_assignable_rank in the DB).
function maxAssignable(role: string): number {
  if (role === 'audio_manager') return 100
  if (role === 'full_time') return 60
  if (role === 'three_quarter_time') return 40
  return 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1. Identify the caller from the JWT the browser sends.
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: caller, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller.user) {
      return json({ error: 'You must be signed in.' }, 401)
    }

    // 2. Verify the caller is an active manager (service_role bypasses RLS).
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.user.id)
      .single()
    const cap = callerProfile?.is_active ? maxAssignable(callerProfile.role) : 0
    if (cap === 0) {
      return json({ error: 'You are not allowed to add team members.' }, 403)
    }

    // 3. Validate the request body.
    const body = await req.json().catch(() => null)
    const fullName = String(body?.fullName ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const role = (body?.role ?? 'student') as Role
    if (!fullName || !email || !password) {
      return json({ error: 'Full name, email, and a temporary password are all required.' }, 400)
    }
    if (password.length < 8) {
      return json({ error: 'The temporary password must be at least 8 characters.' }, 400)
    }
    if (!ROLES.includes(role)) {
      return json({ error: 'Invalid role.' }, 400)
    }
    if (RANK[role] > cap) {
      return json({ error: 'That role is above what your permission level can assign.' }, 403)
    }

    // 4. Create the account. email_confirm: true lets them sign in immediately
    //    (no confirmation email needed). full_name flows into the profile via
    //    the on_auth_user_created trigger's raw_user_meta_data lookup.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Could not create the account.' }, 400)
    }

    // 5. The trigger created the profile as a 'student'; promote if needed.
    if (role !== 'student') {
      const { error: roleErr } = await admin
        .from('profiles')
        .update({ role })
        .eq('id', created.user.id)
      if (roleErr) {
        return json(
          { error: `Account created, but setting the role failed: ${roleErr.message}` },
          500,
        )
      }
    }

    return json({ id: created.user.id, email, fullName, role }, 200)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
