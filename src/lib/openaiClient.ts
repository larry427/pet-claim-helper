import OpenAI from 'openai'

// This uses a Vite client-side env var. For local dev, create a .env with VITE_OPENAI_API_KEY
export const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
  // Increase default timeout to better support slower mobile networks
  timeout: 90_000,
})


