import { Resend } from "resend";

export function createResendClient() {
  return new Resend(process.env.RESEND_API_KEY!);
}

/**
 * Resend's sandbox address can only deliver to the Resend account's own
 * owner email until a custom domain is verified in the Resend dashboard
 * (confirmed against Resend's own docs, not assumed) - fine for development,
 * but swap this for a verified domain address (e.g. orders@snackbox.com)
 * before launch, or real customers will never receive this email.
 */
export const RESEND_FROM_EMAIL = "onboarding@resend.dev";
