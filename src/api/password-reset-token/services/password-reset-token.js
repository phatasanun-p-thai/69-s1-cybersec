'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::password-reset-token.password-reset-token');
