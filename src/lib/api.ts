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
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    
    res = await fetch(`/api${cleanPath}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (err) {
    throw new ApiError('Can\'t reach the server. Check your connection and try again.', 0)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? 'Request failed', res.status)
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
