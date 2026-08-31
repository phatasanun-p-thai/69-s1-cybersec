'use strict';

module.exports = {
  register({ strapi }) {
    const controllers = strapi.container.get('controllers');
    const authentication = controllers.get('admin::authentication');

    if (authentication && typeof authentication.forgotPassword === 'function') {
      const originalForgotPassword = authentication.forgotPassword.bind(authentication);

      authentication.forgotPassword = async (ctx) => {
        await originalForgotPassword(ctx);
        ctx.status = 200;
        ctx.body = { ok: true };
      };
    }
  },

  bootstrap() {},
};
