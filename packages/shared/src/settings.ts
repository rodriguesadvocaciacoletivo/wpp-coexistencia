/**
 * Configuração de SMTP.
 *
 * A senha nunca é devolvida pela API. O campo `hasPassword` informa apenas se
 * existe uma senha salva, para que a interface saiba diferenciar "não
 * configurado" de "configurado, mantenha o que está lá".
 */
export interface SmtpSettingsDto {
  host: string;
  port: number;
  /** `true` = TLS implícito (porta 465). `false` = STARTTLS (587) ou sem TLS. */
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  updatedAt: string | null;
}

export interface SmtpSettingsInput {
  host: string;
  port: number;
  secure: boolean;
  username?: string | null;
  /** Omitir para preservar a senha já salva. String vazia para removê-la. */
  password?: string | null;
  fromName: string;
  fromEmail: string;
}

export interface SmtpTestInput {
  /** Destinatário do e-mail de teste. */
  to: string;
}

export interface SmtpTestResultDto {
  success: boolean;
  message: string;
}
