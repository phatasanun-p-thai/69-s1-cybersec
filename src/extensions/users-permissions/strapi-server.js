'use strict';

const crypto = require('crypto');
const { sendMail } = require('./smtp');

// ============================================================
//  Helper: ส่ง token ไปทาง email
//  1) พยายามใช้ SMTP client ของเรา (Gmail/Outlook ฯลฯ)
//  2) ถ้าไม่มี SMTP → log ลง console (dev mode)
// ============================================================
function isDevMode() {
  return process.env.EXPOSE_TOKEN_IN_RESPONSE === 'true';
}

async function sendTokenEmail(email, rawToken) {
  const subject = 'Password Reset Request';
  const text = `Your password reset token is: ${rawToken}\n\nThis token expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`;
  const html = `
    <h2>Password Reset</h2>
    <p>Your password reset token is:</p>
    <code style="font-size:20px;padding:10px;background:#f4f4f4;display:inline-block;">${rawToken}</code>
    <p>This token expires in <strong>15 minutes</strong>.</p>
    <p>If you did not request this, please ignore this email.</p>
  `;

  // 1) ลองใช้ SMTP client ของเรา (email จริง)
  try {
    await sendMail({ to: email, subject, text, html });
    console.log('[EMAIL] Reset token sent to ' + email);
    if (isDevMode()) {
      console.log('[EMAIL] TOKEN (dev only): ' + rawToken);
    }
    return true;
  } catch (err) {
    console.log('[EMAIL] SMTP send failed: ' + err.message);
  }

  // 2) Fallback: ถ้าไม่มี SMTP ทำงาน และอยู่ใน dev mode → log ลง console
  //    (โหมด prod ไม่ log token นะ — ผ่าน email อย่างเดียว)
  if (isDevMode()) {
    console.log('='.repeat(60));
    console.log(`[DEV MODE] Password reset token for ${email}:`);
    console.log(`Token: ${rawToken}`);
    console.log('='.repeat(60));
  }
  return false;
}

module.exports = (plugin) => {

  // ============================================================
  //  POST /api/auth/forgot-password
  //  - สร้าง token ใหม่
  //  - revoke token เก่าของ user นั้นทั้งหมด (single active token)
  //  - ส่ง token ทาง email ให้ user
  // ============================================================
  plugin.controllers.auth.forgotPassword = async (ctx) => {
    const { email } = ctx.request.body;

    if (!email) {
      return ctx.badRequest('Email is required');
    }

    // หา user จาก email
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { email: email.toLowerCase() },
    });

    // ตอบ 200 เสมอ ไม่ว่า email จะมีหรือไม่ (ป้องกัน email enumeration)
    if (!user) {
      return ctx.send({ ok: true });
    }

    // Revoke token เก่าทั้งหมดของ user นี้ที่ยังไม่ถูกใช้
    const oldTokens = await strapi
      .query('api::password-reset-token.password-reset-token')
      .findMany({
        where: { used: false, revoked: false },
        populate: ['user'],
      });

    const oldTokenIds = oldTokens
      .filter((t) => t.user && t.user.id === user.id)
      .map((t) => t.id);

    // Revoke token เก่า (ถ้ามี)
    if (oldTokenIds.length > 0) {
      await strapi
        .query('api::password-reset-token.password-reset-token')
        .updateMany({
          where: { id: { $in: oldTokenIds } },
          data: { revoked: true },
        });
    }

    // สร้าง token ใหม่ (32 bytes = 64 hex chars)
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash token ด้วย sha256 ก่อนเก็บใน DB (กันข้อมูลรั่วตอน DB leak)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // หมดอายุใน 15 นาที
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // เก็บ token ใน DB
    await strapi.query('api::password-reset-token.password-reset-token').create({
      data: {
        token: hashedToken,
        user: user.id,
        used: false,
        revoked: false,
        expiresAt: expiresAt,
      },
    });

    // ส่ง email พร้อม token
    await sendTokenEmail(email, rawToken);

    // ⚠️ DEV ONLY: คืน token ใน response ให้เทสต์ง่าย
    // เปิดได้โดยตั้ง EXPOSE_TOKEN_IN_RESPONSE=true ใน .env
    // ️ลบ/ปิดก่อน deploy จริง (จะทำให้ attacker ที่รู้ email ยึดบัญชีได้)
    if (isDevMode()) {
      return ctx.send({ ok: true, token: rawToken, expiresInMinutes: 15 });
    }

    return ctx.send({ ok: true });
  };

  // ============================================================
  //  POST /api/auth/reset-password
  //  - รับ token + new password
  //  - ตรวจสอบ token (exists, not used, not revoked, not expired)
  //  - เปลี่ยน password
  //  - ทำเครื่องหมาย token ว่า used (ใช้ได้ครั้งเดียว)
  // ============================================================
  plugin.controllers.auth.resetPassword = async (ctx) => {
    const { token, password } = ctx.request.body;

    if (!token || !password) {
      return ctx.badRequest('Token and password are required');
    }

    if (password.length < 6) {
      return ctx.badRequest('Password must be at least 6 characters');
    }

    // Hash token ที่รับมาเพื่อเทียบกับ DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // หา token ใน DB
    const resetToken = await strapi.query('api::password-reset-token.password-reset-token').findOne({
      where: {
        token: hashedToken,
      },
      populate: ['user'],
    });

    // ตรวจสอบ token
    if (!resetToken) {
      return ctx.badRequest('Invalid token');
    }

    if (resetToken.used) {
      return ctx.badRequest('Token has already been used');
    }

    if (resetToken.revoked) {
      return ctx.badRequest('Token has been revoked. Please request a new one.');
    }

    if (new Date(resetToken.expiresAt) < new Date()) {
      return ctx.badRequest('Token has expired. Please request a new one.');
    }

    // เปลี่ยน password ของ user
    // entityService จะ hash password ให้อัตโนมัติ (type: 'password')
    await strapi.entityService.update('plugin::users-permissions.user', resetToken.user.id, {
      data: { password },
    });

    // ทำเครื่องหมาย token ว่า used (ครั้งเดียว ใช้ไม่ได้อีก)
    await strapi.query('api::password-reset-token.password-reset-token').update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    return ctx.send({ ok: true, message: 'Password has been reset successfully' });
  };

  // ============================================================
  //  เพิ่ม routes ใหม่
  // ============================================================
  plugin.routes['content-api'].routes.push(
    {
      method: 'POST',
      path: '/auth/reset-password',
      handler: 'auth.resetPassword',
      config: {
        policies: [],
      },
    }
  );

  return plugin;
};