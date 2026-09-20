'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/admin-auth/forgot-password',
      handler: 'admin-auth.forgotPassword',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/admin-auth/reset-password',
      handler: 'admin-auth.resetPassword',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};