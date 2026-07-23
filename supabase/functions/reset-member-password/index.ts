// Edge Function: reset-member-password
//
// Lets staff (3/4-time and up) set a temporary password for a member who's
// locked out. Requires the service_role key (admin API), so it runs here, not in
// the browser. Enforces the same ceiling as role assignment: you can only reset
// someone at or below your permission level (audio managers can reset anyone).
//
// Deploy: supabase functions deploy reset-member-password --project-ref <ref>

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

function maxAssignable(role: string): number {
  if (role === 'audio_manager') return 100
  if (role === 'full_time') return 60
  if (role === 'three_quarter_time') return 40
  return 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: caller, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller.user) return json({ error: 'You must be signed in.' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.user.id)
      .single()
    const cap = callerProfile?.is_active ? maxAssignable(callerProfile.role) : 0
    if (cap === 0) return json({ error: 'You are not allowed to reset passwords.' }, 403)

    const body = await req.json().catch(() => null)
    const targetId = String(body?.targetId ?? '')
    const password = String(body?.password ?? '')
    if (!targetId || password.length < 8) {
      return json({ error: 'A target and a password of at least 8 characters are required.' }, 400)
    }

    const { data: target } = await admin
      .from('profiles')
      .select('role')
      .eq('id', targetId)
      .single()
    if (!target) return json({ error: 'No such member.' }, 404)
    if ((RANK[target.role] ?? 999) > cap && callerProfile!.role !== 'audio_manager') {
      return json({ error: 'You cannot reset the password of someone above your level.' }, 403)
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(targetId, { password })
    if (updateErr) return json({ error: updateErr.message }, 400)

    return json({ ok: true }, 200)
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
