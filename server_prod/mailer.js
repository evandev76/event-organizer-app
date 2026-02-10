import { Resend } from "resend";

function mailerMode() {
  return String(process.env.MAILER_MODE || "console").toLowerCase();
}

export async function sendPasswordResetEmail({ toEmail, resetUrl }) {
  const mode = mailerMode();
  if (mode === "console") {
    // eslint-disable-next-line no-console
    console.log(`[mailer:console] reset password for ${toEmail}: ${resetUrl}`);
    return;
  }

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("RESEND_API_KEY manquant.");
  const from = String(process.env.MAIL_FROM || "").trim();
  if (!from) throw new Error("MAIL_FROM manquant.");

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to: toEmail,
    subject: "Reinitialisation du mot de passe",
    text: `Pour reinitialiser ton mot de passe, ouvre ce lien: ${resetUrl}`,
  });
}

