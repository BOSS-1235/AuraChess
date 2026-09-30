import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { config } from './config'

const SCRYPT_KEYLEN = 64
// N=2^15 is a solid interactive-login cost on current hardware.
const SCRYPT_OPTS = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

export function newSalt(): string {
  return randomBytes(16).toString('hex')
}

export function hashPassword(password: string, saltHex: string): Promise<string> {
  return new Promise((resolve, reject) =>
    scrypt(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN, SCRYPT_OPTS, (err, key) =>
      err ? reject(err) : resolve(key.toString('hex'))
    )
  )
}

export async function verifyPassword(password: string, saltHex: string, expectedHex: string): Promise<boolean> {
  const actual = Buffer.from(await hashPassword(password, saltHex), 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** 6-digit numeric one-time code, uniformly random. */
export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashOtp(email: string, otp: string): string {
  return createHmac('sha256', config.otpSecret).update(`${email.toLowerCase()}:${otp}`).digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && timingSafeEqual(x, y)
}

export const PASSWORD_RULES = 'Password must be at least 8 characters.'
