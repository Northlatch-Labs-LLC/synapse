export {
  ResendClientError,
  resendSendEmail,
  type ResendEmailPayload,
} from "./resend-client.js"
export {
  DEFAULT_FROM_ADDRESS,
  emailEnvFrom,
  isEmailConfigured,
  sendPlatformEmail,
  type EmailEnv,
  type PlatformEmailInput,
  type SendEmailResult,
} from "./service.js"
export {
  buildPasswordResetEmail,
  buildPasswordResetUrl,
  buildWelcomeEmail,
  PASSWORD_RESET_PATH,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  type PasswordResetEmailInput,
  type WelcomeEmailInput,
} from "./content.js"
