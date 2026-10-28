'use strict';
// Minimal WebSocket server (RFC 6455) on top of Node's http module: text frames, ping/pong, close.
// Written by hand so Pokr runs with zero npm dependencies.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;

class Conn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = null;
    this.closed = false;
    this.alive = true;
    socket.setNoDelay(true);
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this._parse(); });
    socket.on('close', () => this._closed());
    socket.on('end', () => this._closed());
    socket.on('error', () => { this._closed(); socket.destroy(); });
  }

  _closed() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  _parse() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MESSAGE || !masked) { this.destroy(); return; } // clients must mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4); off += 4;
      const payload = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);

      if (op === 0x8) { this._frame(0x8, Buffer.alloc(0)); this.socket.end(); this._closed(); return; }
      if (op === 0x9) { this._frame(0xA, payload); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x2) this.frags = [payload];
      else if (op === 0x0 && this.frags) this.frags.push(payload);
      else continue;
      if (this.frags.reduce((a, f) => a + f.length, 0) > MAX_MESSAGE) { this.destroy(); return; }
      if (fin) {
        const whole = Buffer.concat(this.frags);
        this.frags = null;
        if (op !== 0x2) this.emit('message', whole.toString('utf8'));
      }
    }
  }

  _frame(op, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(obj) { this._frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))); }
  ping() { this._frame(0x9, Buffer.alloc(0)); }
  destroy() { this.socket.destroy(); this._closed(); }
}

function attach(server, onConnection) {
  const conns = new Set();
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c = new Conn(socket);
    conns.add(c);
    c.on('close', () => conns.delete(c));
    onConnection(c, req);
  });
  // Heartbeat: drop connections that stop answering pings (phones going to sleep, dead wifi).
  const hb = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.destroy(); continue; }
      c.alive = false;
      c.ping();
    }
  }, 25000);
  hb.unref();
  return conns;
}

module.exports = { attach };
