'use strict';

/**
 * mapping router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::mapping.mapping');
