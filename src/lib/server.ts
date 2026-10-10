import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SESSION_COOKIE = 'jar_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365 // a year
export const CLAIM_TTL_HOURS = 24

let client: SupabaseClient | null = null

/** Server-only client. The tables have RLS with no policies, so only this key can reach them. */
export function db(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

/** Unguessable token for links and cookies; only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function appUrl(): string {
  return (process.env.APP_URL ?? 'https://www.playoceancatch.com').replace(/\/$/, '')
}

/**
 * Emails the private link back to a jar. Without RESEND_API_KEY (local dev),
 * the link is logged instead so the flow can still be exercised end to end.
 */
export async function sendJarLink(email: string, name: string | null, link: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'Terrarium Dreams <jar@playoceancatch.com>'
  const label = name ? `${name}'s jar` : 'your jar'

  if (!key) {
    console.log(`[dev] jar link for ${email}: ${link}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: email,
      subject: `Keep ${label}`,
      text:
        `Open this link to keep ${label}:\n\n${link}\n\n` +
        `It works once and expires in ${CLAIM_TTL_HOURS} hours. Only the qualities of how you ` +
        `wrote are kept — never your words.\n\nIf you didn't ask for this, ignore it and nothing happens.`,
      html:
        `<div style="font-family:system-ui,sans-serif;max-width:440px;color:#2b2a27;line-height:1.6">` +
        `<p>Open this link to keep ${label}:</p>` +
        `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1f2a2e;color:#e7e3dc;` +
        `border-radius:8px;text-decoration:none">Keep ${label}</a></p>` +
        `<p style="font-size:13px;color:#77746c">It works once and expires in ${CLAIM_TTL_HOURS} hours. ` +
        `Only the qualities of how you wrote are kept — never your words.</p>` +
        `<p style="font-size:13px;color:#77746c">If you didn't ask for this, ignore it and nothing happens.</p></div>`,
    }),
  })
  if (!res.ok) throw new Error(`email send failed: ${res.status} ${await res.text()}`)
}
