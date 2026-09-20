module.exports = {
  email: {
    config: {
      provider: '/opt/app/src/smtp-provider/index.js',
      providerOptions: {},
      settings: {
        defaultFrom: process.env.SMTP_FROM || 'Strapi <no-reply@strapi.io>',
        defaultReplyTo: process.env.SMTP_FROM || '',
      },
    },
  },
};