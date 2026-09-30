export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** JSON fetch wrapper: sends the session cookie, turns error responses into readable messages. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
      const BASE_URL = import.meta.env.PROD ? 'https://aurachess.onrender.com' : '';
      res = await fetch(`${BASE_URL}/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    })
  } catch {
    throw new ApiError('Can\u2019t reach the server. Check your connection and try again.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status}).`, res.status)
  return data as T
}

export interface User {
  id: number
  username: string
  email: string
  rating: number
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
}
