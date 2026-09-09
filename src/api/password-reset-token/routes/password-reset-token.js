'use strict';

// password-reset-token ใช้ผ่าน strapi.query() ภายในเท่านั้น
// จึงไม่ลงทะเบียน REST route ใดๆ เพื่อไม่ให้ข้อมูลหลุดสู่ public API
module.exports = {
  routes: [],
};