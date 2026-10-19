export interface CloudConfig {
  url: string
  publishableKey: string
}

/** Reads the Supabase settings from the build environment (.env / Cloudflare variables). */
export function cloudConfigFromEnv(): CloudConfig | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
  return url && publishableKey ? { url, publishableKey } : undefined
}
