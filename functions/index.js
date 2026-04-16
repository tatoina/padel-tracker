const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function createTransporter() {
  const mailUser = process.env.MAIL_USER;
  const mailPass = process.env.MAIL_PASS;
  if (!mailUser || !mailPass) throw new Error('Faltan variables de entorno MAIL_USER / MAIL_PASS');
  return { transporter: nodemailer.createTransport({ service: 'gmail', auth: { user: mailUser, pass: mailPass } }), mailUser };
}

const BRAND_COLOR  = '#16a34a';
const APP_NAME     = 'PadelTracker';
const APP_URL      = 'https://padelapp-9e01c.web.app';
const ADMIN_EMAIL  = 'inaviciba@gmail.com';

function emailWrapper(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px;text-align:center">
      <div style="font-size:2rem">🎾</div>
      <div style="color:#fff;font-weight:900;font-size:1.3rem;margin-top:8px;letter-spacing:-.02em">${APP_NAME}</div>
    </div>
    <!-- Content -->
    <div style="padding:32px">
      ${bodyHtml}
    </div>
    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
      <p style="margin:0;font-size:12px;color:#94a3b8">${APP_NAME} &middot; <a href="${APP_URL}" style="color:${BRAND_COLOR};text-decoration:none">${APP_URL}</a></p>
    </div>
  </div>
</body>
</html>`;
}

function btn(text, url, color = BRAND_COLOR) {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;background:${color};color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-weight:700;font-size:15px">${text}</a>`;
}

// ---------------------------------------------------------------------------
// 1. TRIGGER: Nuevo usuario → email al admin
// ---------------------------------------------------------------------------
exports.notificarNuevoUsuario = functions
  .region('us-central1')
  .firestore.document('users/{uid}')
  .onCreate(async (snap) => {
    const d = snap.data() || {};
    const firstname = d.firstname || '';
    const lastname  = d.lastname  || '';
    const email     = d.email     || '';
    const createdAt = d.createdAt
      ? new Date(d.createdAt.toMillis()).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      : '';

    let { transporter, mailUser } = createTransporter();

    const html = emailWrapper(`
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:1.2rem">👤 Nuevo usuario pendiente</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#64748b;width:90px">Nombre</td><td style="padding:8px 0;font-weight:700;color:#1e293b">${firstname} ${lastname}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Email</td><td style="padding:8px 0;color:#1e293b">${email}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Fecha</td><td style="padding:8px 0;color:#1e293b">${createdAt}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Estado</td><td style="padding:8px 0"><span style="background:#fef3c7;color:#d97706;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:700">⏳ Pendiente</span></td></tr>
      </table>
      <p style="color:#64748b;margin:20px 0 0;font-size:14px">Entra al panel de administración para activar la cuenta.</p>
      ${btn('Ir al panel de admin →', APP_URL)}
    `);

    await transporter.sendMail({
      from: `"${APP_NAME}" <${mailUser}>`,
      to: ADMIN_EMAIL,
      subject: `[${APP_NAME}] Nuevo usuario: ${firstname} ${lastname}`,
      html,
    });
    console.log(`Email admin: nuevo usuario ${email}`);
    return null;
  });

// ---------------------------------------------------------------------------
// 2. TRIGGER: Usuario activado → email de bienvenida al usuario
// ---------------------------------------------------------------------------
exports.notificarActivacion = functions
  .region('us-central1')
  .firestore.document('users/{uid}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after  = change.after.data()  || {};
    if (before.status === 'active' || after.status !== 'active') return null;

    const firstname = after.firstname || '';
    const email     = after.email     || '';
    if (!email) return null;

    let { transporter, mailUser } = createTransporter();

    const html = emailWrapper(`
      <h2 style="margin:0 0 12px;color:${BRAND_COLOR};font-size:1.2rem">¡Tu cuenta está activa! 🎉</h2>
      <p style="color:#1e293b;font-size:15px;margin:0 0 8px">Hola <strong>${firstname}</strong>,</p>
      <p style="color:#475569;font-size:14px;margin:0 0 4px">Tu cuenta en <strong>${APP_NAME}</strong> ha sido <strong>activada</strong>. Ya puedes entrar y empezar a registrar y ver tus partidos.</p>
      ${btn('Entrar a la app →', APP_URL)}
    `);

    await transporter.sendMail({
      from: `"${APP_NAME}" <${mailUser}>`,
      to: email,
      subject: `¡Tu cuenta en ${APP_NAME} ya está activa!`,
      html,
    });
    console.log(`Email activación enviado a ${email}`);
    return null;
  });

// ---------------------------------------------------------------------------
// 3. CALLABLE: Enviar noticia/aviso a usuarios de grupos
// ---------------------------------------------------------------------------
exports.enviarNoticia = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
      throw new functions.https.HttpsError('permission-denied', 'Solo el admin puede enviar noticias');
    }

    const { titulo, cuerpo, grupos, imagen } = data;
    if (!titulo || !cuerpo) throw new functions.https.HttpsError('invalid-argument', 'Faltan titulo o cuerpo');

    const usersSnap = await admin.firestore().collection('users').where('status', '==', 'active').get();
    let { transporter, mailUser } = createTransporter();
    const sent = new Set();

    for (const doc of usersSnap.docs) {
      const u = doc.data();
      if (!u.email || u.email === ADMIN_EMAIL) continue;
      const userGroups = u.groups || (u.group ? [u.group] : []);
      if (grupos && grupos.length && !userGroups.some(g => grupos.includes(g))) continue;
      if (sent.has(u.email)) continue;
      sent.add(u.email);

      const imgHtml = imagen
        ? `<img src="${imagen}" alt="" style="width:100%;border-radius:10px;margin-bottom:16px;display:block">`
        : '';

      const html = emailWrapper(`
        ${imgHtml}
        <h2 style="margin:0 0 12px;color:#1e293b;font-size:1.15rem">${titulo}</h2>
        <p style="color:#475569;font-size:14px;white-space:pre-line;margin:0 0 8px">${cuerpo}</p>
        ${btn('Ver en la app →', APP_URL)}
      `);

      try {
        await transporter.sendMail({
          from: `"${APP_NAME}" <${mailUser}>`,
          to: u.email,
          subject: `[${APP_NAME}] ${titulo}`,
          html,
        });
      } catch(e) { console.warn('Error email', u.email, e.message); }
    }

    return { sent: sent.size };
  });

// ---------------------------------------------------------------------------
// 4. CALLABLE: Enviar invitación a grupo (por email libre o usuario registrado)
// ---------------------------------------------------------------------------
exports.enviarInvitacion = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.email !== ADMIN_EMAIL) {
      throw new functions.https.HttpsError('permission-denied', 'Solo el admin puede enviar invitaciones');
    }

    const { toEmail, toName, groupCode } = data;
    if (!toEmail || !groupCode) throw new functions.https.HttpsError('invalid-argument', 'Faltan datos');

    const link = `${APP_URL}/?g=${encodeURIComponent(groupCode)}`;
    let { transporter, mailUser } = createTransporter();

    const html = emailWrapper(`
      <h2 style="margin:0 0 12px;color:#1e293b;font-size:1.15rem">🎾 Te han invitado a un grupo</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 8px">Hola${toName ? ` <strong>${toName}</strong>` : ''},</p>
      <p style="color:#475569;font-size:14px;margin:0 0 4px">Has sido invitado/a al grupo <strong>${groupCode}</strong> en ${APP_NAME}. Haz clic para unirte:</p>
      ${btn('Unirme al grupo →', link)}
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">O copia este enlace: <br><a href="${link}" style="color:${BRAND_COLOR}">${link}</a></p>
    `);

    await transporter.sendMail({
      from: `"${APP_NAME}" <${mailUser}>`,
      to: toEmail,
      subject: `Invitación al grupo ${groupCode} en ${APP_NAME}`,
      html,
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// 5. CALLABLE: Notificar resultado de partido a miembros del grupo
// ---------------------------------------------------------------------------
exports.notificarResultado = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes estar autenticado');
    }

    const { groupCode, pair1, pair2, result, score, date, isPachanga } = data;
    if (!groupCode || !Array.isArray(pair1) || !Array.isArray(pair2)) {
      throw new functions.https.HttpsError('invalid-argument', 'Faltan datos del partido');
    }

    // 1. Check group settings
    const groupSnap = await admin.firestore().collection('groups').doc(groupCode).get();
    if (!groupSnap.exists) return { sent: 0 };
    const groupData = groupSnap.data();
    const settings = groupData.settings || {};
    if (!settings.emailResults) return { sent: 0 };

    // 2. Get members with email
    const usersSnap = await admin.firestore().collection('users').where('status', '==', 'active').get();
    const members = usersSnap.docs
      .filter(d => (d.data().groups || []).includes(groupCode))
      .map(d => ({ id: d.id, name: `${d.data().firstname} ${d.data().lastname}`, email: d.data().email }));

    if (!members.length) return { sent: 0 };

    // 3. Build player name map (members + guests)
    const guests = (groupData.guests || []).map(g => ({ id: g.id, name: g.name }));
    const allPlayers = [...members, ...guests];
    const playerName = (id) => {
      const p = allPlayers.find(pl => pl.id === id);
      return p ? p.name : '?';
    };

    const pair1Names = pair1.map(playerName).join(' & ');
    const pair2Names = pair2.map(playerName).join(' & ');
    const dateStr = date
      ? new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    const pachangaBadge = isPachanga
      ? ' <span style="background:#ff6600;color:white;font-size:.7rem;padding:2px 8px;border-radius:12px;font-weight:700">PACHANGA</span>'
      : '';
    const resultLabel = result === 'pair1'
      ? `🟢 ${pair1Names}`
      : result === 'pair2'
        ? `🟠 ${pair2Names}`
        : '🤝 Empate';
    const resultBg = result === 'draw' ? '#e0e7ff' : result === 'pair1' ? '#dcfce7' : '#fef3c7';
    const resultColor = result === 'draw' ? '#3730a3' : result === 'pair1' ? '#166534' : '#92400e';

    // 4. Send emails
    let { transporter, mailUser } = createTransporter();
    const sent = new Set();

    for (const member of members) {
      if (!member.email || sent.has(member.email)) continue;
      sent.add(member.email);

      const html = emailWrapper(`
        <h2 style="margin:0 0 4px;color:#1e293b;font-size:1.1rem">🎾 Resultado del partido${pachangaBadge}</h2>
        <p style="color:#94a3b8;font-size:.8rem;margin:0 0 16px">📅 ${dateStr} &nbsp;·&nbsp; 🏠 ${groupCode}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px">
          <div style="font-size:1rem;font-weight:800;color:#16a34a">🟢 ${pair1Names}</div>
          <div style="color:#94a3b8;font-weight:700;margin:6px 0;font-size:.85rem">vs</div>
          <div style="font-size:1rem;font-weight:800;color:#b45309">🟠 ${pair2Names}</div>
          ${score ? `<div style="margin-top:12px;font-size:1.4rem;font-weight:900;color:#1e293b;letter-spacing:.05em">${score}</div>` : ''}
        </div>
        <div style="text-align:center;margin-bottom:20px">
          <span style="display:inline-block;background:${resultBg};color:${resultColor};padding:6px 18px;border-radius:20px;font-weight:700;font-size:.9rem">
            🏆 ${resultLabel}
          </span>
        </div>
        ${btn('Ver en la app →', APP_URL)}
      `);

      try {
        await transporter.sendMail({
          from: `"${APP_NAME}" <${mailUser}>`,
          to: member.email,
          subject: `[${APP_NAME}] Resultado · ${pair1Names} vs ${pair2Names}`,
          html,
        });
      } catch (e) {
        console.warn('Error email resultado', member.email, e.message);
      }
    }

    console.log(`notificarResultado: ${sent.size} emails enviados para grupo ${groupCode}`);
    return { sent: sent.size };
  });

