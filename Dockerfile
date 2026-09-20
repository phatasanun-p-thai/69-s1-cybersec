FROM prawee/strapi

# ใช้ smtp.js (Gmail) ส่งอีเมลของ Strapi email plugin แทน provider sendmail ตัว default
COPY config/plugins.js /opt/app/config/plugins.js