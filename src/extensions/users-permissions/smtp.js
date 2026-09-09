'use strict';

// ============================================================
//  Custom SMTP client (pure Node.js - net/tls)
//  ส่ง email ผ่าน SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM
//  รองรับ STARTTLS (port 587) - ใช้กับ Gmail ได้
//  โดยไม่ต้อง rebuild Docker image
// ============================================================

const net = require('net');
const tls = require('tls');

function getConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  };
}

// ตัวอ่านบรรทัด + คิวการตอบกลับ
class SmtpSocket {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.queue = [];
    this.waiters = [];
  }

  attach() {
    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this._drain();
    });
  }

  _drain() {
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const raw = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      this._pushLine(raw);
    }
    while (this.socket.destroyed && this.buffer) {
      this._pushLine(this.buffer);
      this.buffer = '';
    }
  }

  _pushLine(line) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(line);
    } else {
      this.queue.push(line);
    }
  }

  detach() {
    this.socket.removeAllListeners('data');
  }

  // ดึงบรรทัดถัดไป (รอถ้ายังไม่มา)
  nextLine() {
    return new Promise((resolve) => {
      if (this.queue.length > 0) {
        resolve(this.queue.shift());
      } else {
        this.waiters.push(resolve);
      }
    });
  }

  write(line) {
    return new Promise((resolve, reject) => {
      this.socket.write(line + '\r\n', (err) => (err ? reject(err) : resolve()));
    });
  }

  destroy() {
    this.socket.destroy();
  }

  get destroyed() {
    return this.socket.destroyed;
  }
}

function parseCode(line) {
  const m = line.match(/^(\d{3})([\s-])(.*)$/);
  if (!m) return null;
  return { code: parseInt(m[1], 10), multiline: m[2] === '-', rest: m[3] };
}

// อ่าน response จนจบ (จัดการแบบ multiline) แล้วตรวจ code
async function expect(smtp, expected) {
  let lines = [];
  for (;;) {
    const line = await smtp.nextLine();
    lines.push(line);
    const parsed = parseCode(line);
    if (parsed && !parsed.multiline) {
      if (expected && !expected.includes(parsed.code)) {
        const err = new Error(`SMTP error ${parsed.code}: ${line}`);
        err.code = parsed.code;
        throw err;
      }
      return { code: parsed.code, rest: parsed.rest, lines };
    }
  }
}

function base64Wrap(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function buildMessage({ to, subject, text, html }) {
  const boundary = '----=_Part_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
  const cfg = getConfig();
  const from = cfg.from || cfg.user;
  const lines = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(base64Wrap(text || ''));
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=utf-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(base64Wrap(html || text || ''));
  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

async function sendMail({ to, subject, text, html }) {
  const cfg = getConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    throw new Error('SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)');
  }
  if (!to) throw new Error('Recipient email (to) is required');

  let socket;

  try {
    const raw = net.connect(cfg.port, cfg.host);
    let smtp = new SmtpSocket(raw);
    smtp.attach();

    // 1. รับ greeting
    await expect(smtp, [220]);
    await smtp.write(`EHLO ${cfg.host}`);
    await expect(smtp, [250]);

    // 2. STARTTLS สำหรับ port 587
    if (cfg.port === 587) {
      await smtp.write('STARTTLS');
      await expect(smtp, [220]);
      smtp.detach();
      const tlsSock = tls.connect({ socket: raw, servername: cfg.host });
      await new Promise((resolve, reject) => {
        tlsSock.once('secureConnect', resolve);
        tlsSock.once('error', reject);
      });
      socket = tlsSock;
      smtp = new SmtpSocket(tlsSock);
      smtp.attach();
      await smtp.write(`EHLO ${cfg.host}`);
      await expect(smtp, [250]);
    }

    // 3. AUTH PLAIN
    const authPlain = Buffer.from('\0' + cfg.user + '\0' + cfg.pass).toString('base64');
    await smtp.write(`AUTH PLAIN ${authPlain}`);
    await expect(smtp, [235]);

    // 4. ส่งเมล
    await smtp.write(`MAIL FROM: <${cfg.from || cfg.user}>`);
    await expect(smtp, [250]);
    await smtp.write(`RCPT TO: <${to}>`);
    await expect(smtp, [250, 251]);

    await smtp.write('DATA');
    await expect(smtp, [354]);
    await smtp.write(buildMessage({ to, subject, text, html }));
    await smtp.write('.');
    const res = await expect(smtp, [250]);
    if (!/2\d\d|3\d\d/.test('' + res.code)) {
      // 250 = success, already handled
    }

    // 5. QUIT
    await smtp.write('QUIT');
    await expect(smtp, [221]).catch(() => {});
  } finally {
    if (socket) socket.destroy();
  }

  return true;
}

module.exports = { sendMail };