'use strict';

/**
 * mapping service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::mapping.mapping');
