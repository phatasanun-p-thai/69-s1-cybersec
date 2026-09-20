'use strict';

const { sendMail } = require('../../../extensions/users-permissions/smtp');

const isDevMode = () => process.env.EXPOSE_TOKEN_IN_RESPONSE === 'true';

// ============================================================
//  POST /api/admin-auth/forgot-password
//  คล้าย flow ของ user: สร้าง token บน admin_users + ส่งเมล + คืน code (dev mode)
// ============================================================
module.exports = {
  async forgotPassword(ctx) {
    const { email } = ctx.request.body || {};

    if (!email) {
      return ctx.badRequest('Email is required');
    }

    const user = await strapi
      .query('admin::user')
      .findOne({ where: { email, isActive: true } });

    if (!user) {
      return ctx.send({ ok: true });
    }

    const resetPasswordToken = strapi.admin.services.token.createToken();
    await strapi.admin.services.user.updateById(user.id, { resetPasswordToken });

    const resetUrl =
      ctx.request.protocol +
      '://' +
      ctx.request.header.host +
      '/admin/auth/reset-password?code=' +
      resetPasswordToken;

    const subject = 'Reset your admin password';
    const text = [
      'Hello,',
      '',
      'You requested to reset your admin password.',
      'Click the link below to set a new password:',
      '',
      resetUrl,
      '',
      'If you did not request this, please ignore this email.',
    ].join('\n');
    const html =
      '<h2>Admin Password Reset</h2>' +
      '<p>Click the link below to set a new password:</p>' +
      '<a href="' +
      resetUrl +
      '">' +
      resetUrl +
      '</a>' +
      '<p>If you did not request this, please ignore this email.</p>';

    try {
      await sendMail({ to: user.email, subject, text, html });
      strapi.log.info('[EMAIL] Admin reset token sent to ' + user.email);
    } catch (err) {
      strapi.log.error('[EMAIL] SMTP send failed: ' + err.message);
    }

    if (isDevMode()) {
      return ctx.send({ ok: true, code: resetPasswordToken, expiresInMinutes: 15 });
    }

    return ctx.send({ ok: true });
  },

  // ============================================================
  //  POST /api/admin-auth/reset-password
  // ============================================================
  async resetPassword(ctx) {
    const { resetPasswordToken, password } = ctx.request.body || {};

    if (!resetPasswordToken || !password) {
      return ctx.badRequest('Reset token and password are required');
    }

    if (password.length < 6) {
      return ctx.badRequest('Password must be at least 6 characters');
    }

    const user = await strapi
      .query('admin::user')
      .findOne({ where: { resetPasswordToken, isActive: true } });

    if (!user) {
      return ctx.badRequest('Invalid token');
    }

    const updatedUser = await strapi.admin.services.user.updateById(user.id, {
      password,
      resetPasswordToken: null,
    });

    const token = strapi.admin.services.token.createJwtToken(updatedUser);

    return ctx.send({
      ok: true,
      data: {
        token,
        user: strapi.admin.services.user.sanitizeUser(updatedUser),
      },
    });
  },
};