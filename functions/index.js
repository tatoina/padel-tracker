const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

/**
 * Se dispara cuando se crea un nuevo documento en users/{uid}.
 * Envía un email a inaviciba@gmail.com para avisar del nuevo registro.
 */
exports.notificarNuevoUsuario = functions
  .region('us-central1')
  .firestore
  .document('users/{uid}')
  .onCreate(async (snap) => {
    const data      = snap.data() || {};
    const firstname = data.firstname || '';
    const lastname  = data.lastname  || '';
    const email     = data.email     || '';
    const createdAt = data.createdAt
      ? new Date(data.createdAt.toMillis()).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      : '';

    const mailUser = process.env.MAIL_USER;
    const mailPass = process.env.MAIL_PASS;

    if (!mailUser || !mailPass) {
      console.error('Faltan variables de entorno MAIL_USER / MAIL_PASS');
      return null;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: mailUser, pass: mailPass },
    });

    const mailOpts = {
      from: `"PadelTracker" <${mailUser}>`,
      to: 'inaviciba@gmail.com',
      subject: `[PadelTracker] Nuevo usuario: ${firstname} ${lastname}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="margin-bottom:8px">🎾 Nuevo usuario registrado</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr>
              <td style="padding:8px 16px 8px 0;color:#555;white-space:nowrap">Nombre</td>
              <td style="padding:8px 0"><strong>${firstname} ${lastname}</strong></td>
            </tr>
            <tr>
              <td style="padding:8px 16px 8px 0;color:#555">Email</td>
              <td style="padding:8px 0">${email}</td>
            </tr>
            <tr>
              <td style="padding:8px 16px 8px 0;color:#555">Fecha</td>
              <td style="padding:8px 0">${createdAt}</td>
            </tr>
          </table>
          <p style="color:#555;margin-top:20px">El usuario está <strong>pendiente de activación</strong>.<br>Entra al panel de admin para activarlo.</p>
          <a href="https://padelapp-9e01c.web.app"
             style="display:inline-block;margin-top:12px;background:#1e293b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:15px">
            Ir al panel admin →
          </a>
          <p style="margin-top:28px;font-size:12px;color:#aaa">PadelTracker · padelapp-9e01c.web.app</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOpts);
      console.log(`Email de aviso enviado: ${firstname} ${lastname} <${email}>`);
    } catch (err) {
      console.error('Error al enviar email:', err);
    }

    return null;
  });
