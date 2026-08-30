const nodemailer = require('nodemailer');
const { GMAIL_EMAIL, GMAIL_PASSWORD } = require('../../helpers/secrets');
const { getSiteUrl } = require('../../helpers/config');

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderOtpEmail(code) {
    const safeCode = escapeHtml(code);
    const siteUrl = getSiteUrl();
    return {
        subject: 'Votre code de connexion · Tous à Table',
        text: [
            'Votre code de connexion Tous à Table',
            '',
            `Code : ${code}`,
            '',
            'Ce code expire dans 10 minutes. Ne le partagez avec personne.',
            siteUrl
        ].join('\n'),
        html: `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f3f0ea;font-family:Arial,sans-serif;color:#1c1917;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Votre code est ${safeCode}. Il expire dans 10 minutes.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#11110f;border-radius:24px;overflow:hidden;">
        <tr><td style="padding:36px 36px 18px;color:#d6b46b;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Tous à Table · Atelier Normand</td></tr>
        <tr><td style="padding:0 36px;color:#ffffff;font-size:30px;line-height:38px;font-weight:800;">Votre code de connexion</td></tr>
        <tr><td style="padding:14px 36px 0;color:#b8b5ae;font-size:15px;line-height:24px;">Saisissez ces six chiffres sur le site pour confirmer votre adresse email.</td></tr>
        <tr><td align="center" style="padding:30px 36px;">
          <div style="background:#ffffff;color:#11110f;border-radius:18px;padding:20px 16px;font-size:36px;line-height:42px;font-weight:900;letter-spacing:10px;">${safeCode}</div>
        </td></tr>
        <tr><td style="padding:0 36px 36px;color:#8e8b84;font-size:12px;line-height:20px;">Ce code expire dans 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
    };
}

async function sendOtpEmail(email, code) {
    const sender = GMAIL_EMAIL.value();
    if (!sender || !GMAIL_PASSWORD.value()) {
        const error = new Error('OTP email configuration missing.');
        error.code = 'email-config-missing';
        throw error;
    }
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: sender, pass: GMAIL_PASSWORD.value() }
    });
    const message = renderOtpEmail(code);
    await transporter.sendMail({
        from: `Tous à Table <${sender}>`,
        to: email,
        ...message
    });
}

module.exports = { renderOtpEmail, sendOtpEmail };
