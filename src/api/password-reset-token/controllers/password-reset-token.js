'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::password-reset-token.password-reset-token');
