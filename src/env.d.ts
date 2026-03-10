/// <reference types="next" />

// Vite env compatibility for supabase client
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_SUPABASE_PROJECT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {}
