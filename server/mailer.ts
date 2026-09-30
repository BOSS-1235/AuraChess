import nodemailer from 'nodemailer'
import { config } from './config'

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    })
  : null

export const emailConfigured = transport !== null

export async function sendOtpEmail(to: string, username: string, otp: string): Promise<void> {
  const subject = `Your AuraChess reset code: ${otp}`
  const text =
    `Hi ${username},\n\nYour AuraChess password reset code is ${otp}.\n` +
    `It expires in 10 minutes. If you didn't ask for this, you can ignore this email — your password hasn't changed.\n`

  if (!transport) {
    // Development fallback: no SMTP configured, so print the code to the SERVER console
    // (never to the browser). Set SMTP_* env vars to send real email.
    console.log(`\n[dev mail] To: ${to}\n[dev mail] ${subject}\n`)
    return
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text })
}
