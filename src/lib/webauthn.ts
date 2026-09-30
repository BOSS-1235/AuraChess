import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { api, type User } from './api'

/** Real, server-verified biometric sign-in (Face ID / Touch ID / Windows Hello / Android). */

export function biometricsSupported(): boolean {
  return browserSupportsWebAuthn()
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

function friendly(err: unknown): Error {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return new Error('Biometric prompt was cancelled or timed out.')
  if (name === 'InvalidStateError') return new Error('This device is already set up for biometric sign-in.')
  return err instanceof Error ? err : new Error('Biometric authentication failed.')
}

/** Must be signed in. Registers this device's authenticator to the current account. */
export async function enableBiometric(): Promise<void> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>(
    '/webauthn/register/options',
    { method: 'POST', body: {} }
  )
  let response
  try {
    response = await startRegistration({ optionsJSON: options })
  } catch (err) {
    throw friendly(err)
  }
  await api('/webauthn/register/verify', { body: { challengeId, response } })
}

/** Sign in with no email/password: the device offers the account it holds a key for. */
export async function signInWithBiometric(remember: boolean): Promise<User> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challengeId: string }>(
    '/webauthn/login/options',
    { method: 'POST', body: {} }
  )
  let response
  try {
    response = await startAuthentication({ optionsJSON: options })
  } catch (err) {
    throw friendly(err)
  }
  const data = await api<{ user: User }>('/webauthn/login/verify', { body: { challengeId, response, remember } })
  return data.user
}

export async function biometricStatus(): Promise<{ registered: boolean }> {
  return api('/webauthn/status')
}

export async function removeBiometric(): Promise<void> {
  await api('/webauthn/credentials', { method: 'DELETE' })
}
