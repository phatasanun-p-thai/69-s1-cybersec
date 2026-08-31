'use strict';

module.exports = (plugin) => {
  const authController = plugin.controllers.auth;

  if (authController && typeof authController.forgotPassword === 'function') {
    const originalForgotPassword = authController.forgotPassword.bind(authController);

    authController.forgotPassword = async (ctx) => {
      try {
        await originalForgotPassword(ctx);
      } catch (e) {
        // swallow email-sending errors so the endpoint still returns 200
      }
      ctx.status = 200;
      ctx.body = { ok: true };
    };
  }

  return plugin;
};
