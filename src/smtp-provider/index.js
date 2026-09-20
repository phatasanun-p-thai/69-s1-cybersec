'use strict';

// ============================================================
//  Email provider สำหรับ Strapi email plugin (Method B)
//  - ใช้ smtp.js (Gmail STARTTLS) แทน provider sendmail ตัว default
//  - ถูกเรียกผ่าน config/plugins.js -> provider: "/opt/app/src/smtp-provider/index.js"
// ============================================================

const { sendMail } = require('../extensions/users-permissions/smtp');

module.exports = {
  init(providerOptions = {}, settings = {}) {
    const defaultFrom = settings.defaultFrom ? String(settings.defaultFrom) : '';

    return {
      async send(options) {
        const { to, subject, text, html } = options || {};
        try {
          await sendMail({ to, subject, text, html });
          strapi.log.info('[EMAIL-PROVIDER] sent to ' + to);
          if (process.env.EXPOSE_TOKEN_IN_RESPONSE === 'true') {
            const m = (html || '').match(/code=([0-9a-f]+)/) || (text || '').match(/code=([0-9a-f]+)/);
            if (m) {
              strapi.log.warn('[DEV MODE] Admin reset code: ' + m[1]);
            }
          }
          return true;
        } catch (err) {
          const ex = new Error('Could not send email: ' + err.message);
          ex.statusCode = 500;
          throw ex;
        }
      },
    };
  },
};