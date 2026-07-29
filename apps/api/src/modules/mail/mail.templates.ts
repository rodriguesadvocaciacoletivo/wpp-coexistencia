/**
 * Templates dos e-mails transacionais.
 *
 * HTML inline e deliberadamente simples: clientes de e-mail têm suporte a CSS
 * irregular, e nada aqui justifica um motor de template. Cada função devolve
 * assunto, corpo HTML e corpo texto — o alternativo em texto puro melhora a
 * entregabilidade e atende quem lê em cliente sem HTML.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Atendimento WhatsApp';

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e7eb;">
      <tr>
        <td style="padding:32px 32px 8px 32px;">
          <p style="margin:0 0 24px 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#7b8794;">${BRAND}</p>
          <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.35;font-weight:600;">${title}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 32px 32px;font-size:15px;line-height:1.6;color:#3e4c59;">
          ${bodyHtml}
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0 auto;font-size:12px;line-height:1.5;color:#9aa5b1;text-align:center;">
      Este é um e-mail automático. Não responda a esta mensagem.
    </p>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${label}</a>
  </p>
  <p style="margin:0;font-size:13px;color:#7b8794;">
    Se o botão não funcionar, copie e cole este endereço no navegador:<br />
    <span style="word-break:break-all;color:#52606d;">${href}</span>
  </p>`;
}

export function renderInvitationEmail(params: {
  name: string;
  inviterName: string | null;
  roleLabel: string;
  link: string;
  expiresInHours: number;
}): RenderedEmail {
  const invitedBy = params.inviterName
    ? `${params.inviterName} convidou você`
    : 'Você foi convidado';

  return {
    subject: `Seu acesso ao ${BRAND}`,
    html: layout(
      `Olá, ${params.name}!`,
      `<p style="margin:0 0 16px 0;">${invitedBy} para participar da plataforma de atendimento como <strong>${params.roleLabel}</strong>.</p>
       <p style="margin:0;">Defina sua senha para começar a usar:</p>
       ${button(params.link, 'Definir minha senha')}
       <p style="margin:24px 0 0 0;font-size:13px;color:#7b8794;">Este convite expira em ${params.expiresInHours} horas.</p>`,
    ),
    text: [
      `Olá, ${params.name}!`,
      '',
      `${invitedBy} para participar da plataforma de atendimento como ${params.roleLabel}.`,
      '',
      'Defina sua senha acessando:',
      params.link,
      '',
      `Este convite expira em ${params.expiresInHours} horas.`,
    ].join('\n'),
  };
}

export function renderPasswordResetEmail(params: {
  name: string;
  link: string;
  expiresInMinutes: number;
}): RenderedEmail {
  return {
    subject: 'Redefinição de senha',
    html: layout(
      `Olá, ${params.name}!`,
      `<p style="margin:0;">Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para escolher uma nova senha:</p>
       ${button(params.link, 'Redefinir minha senha')}
       <p style="margin:24px 0 0 0;font-size:13px;color:#7b8794;">
         O link expira em ${params.expiresInMinutes} minutos e só pode ser usado uma vez.<br />
         Se você não pediu isso, ignore este e-mail — sua senha atual continua valendo.
       </p>`,
    ),
    text: [
      `Olá, ${params.name}!`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta.',
      'Escolha uma nova senha acessando:',
      params.link,
      '',
      `O link expira em ${params.expiresInMinutes} minutos e só pode ser usado uma vez.`,
      'Se você não pediu isso, ignore este e-mail.',
    ].join('\n'),
  };
}

export function renderWelcomeEmail(params: {
  name: string;
  link: string;
}): RenderedEmail {
  return {
    subject: `Sua conta no ${BRAND} está pronta`,
    html: layout(
      `Bem-vindo, ${params.name}!`,
      `<p style="margin:0;">Sua senha foi definida e sua conta já está ativa. A partir de agora você pode acessar a plataforma normalmente.</p>
       ${button(params.link, 'Acessar a plataforma')}`,
    ),
    text: [
      `Bem-vindo, ${params.name}!`,
      '',
      'Sua senha foi definida e sua conta já está ativa.',
      '',
      'Acesse a plataforma em:',
      params.link,
    ].join('\n'),
  };
}

export function renderSmtpTestEmail(): RenderedEmail {
  return {
    subject: 'Teste de configuração de e-mail',
    html: layout(
      'Configuração de SMTP funcionando',
      `<p style="margin:0;">Se você está lendo esta mensagem, o servidor SMTP configurado na plataforma está entregando e-mails corretamente.</p>
       <p style="margin:16px 0 0 0;">Convites de agentes e recuperações de senha vão sair por este mesmo caminho.</p>`,
    ),
    text: [
      'Configuração de SMTP funcionando.',
      '',
      'Se você está lendo esta mensagem, o servidor SMTP configurado na plataforma está entregando e-mails corretamente.',
      'Convites de agentes e recuperações de senha vão sair por este mesmo caminho.',
    ].join('\n'),
  };
}
