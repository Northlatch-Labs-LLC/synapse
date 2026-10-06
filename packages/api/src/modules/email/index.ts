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
