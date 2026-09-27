FROM prawee/strapi

# ใช้ smtp.js (Gmail) ส่งอีเมลของ Strapi email plugin แทน provider sendmail ตัว default
COPY config/plugins.js /opt/app/config/plugins.js

# ต้อง COPY (merge) ไม่ใช่ bind mount ทับ /opt/app/src
# เพราะ image มี content-type student / subject / teacher / mapping อยู่ในนั้น
# ถ้า mount ทับจะทำให้ Strapi ไม่ register 4 ตัวนี้ และไม่โผล่ใน Roles
COPY src/ /opt/app/src/