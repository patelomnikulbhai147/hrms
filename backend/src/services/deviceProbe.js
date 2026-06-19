/**
 * Attendance-device probe service — Phase 5 (READ-ONLY).
 *
 * Strictly inspection only. This module NEVER writes to, enables/disables, or
 * clears a device. It performs:
 *   - testConnection(): a plain TCP reachability + response-time check.
 *   - discover(): a read-only ZKTeco-style handshake and (if the device speaks
 *     the protocol) read-only info/count queries, always capturing raw bytes for
 *     diagnostics. Devices that don't answer a pull protocol are reported as such.
 *
 * It uses only Node's built-in `net` (no external SDK), so it works without npm.
 */
const net = require('net');

const USHRT_MAX = 65535;
const CMD_CONNECT = 1000;
const CMD_EXIT = 1001;
const CMD_ACK_OK = 2000;
const CMD_GET_FREE_SIZES = 50;
const CMD_OPTIONS_RRQ = 11;

function zkChecksum(buf) {
  let sum = 0, i = 0;
  for (; i + 1 < buf.length; i += 2) sum += buf.readUInt16LE(i);
  if (i < buf.length) sum += buf[i];
  while (sum > USHRT_MAX) sum = (sum & 0xffff) + (sum >> 16);
  return (~sum) & 0xffff;
}

function zkPayload(command, sessionId = 0, replyId = 0, data = Buffer.alloc(0)) {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  data.copy(buf, 8);
  buf.writeUInt16LE(zkChecksum(buf), 2);
  return buf;
}

function zkTcp(payload) {
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x5050, 0);
  header.writeUInt16LE(0x7d82, 2);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function parseReply(buf) {
  // Strip the 8-byte TCP transport header if present.
  const p = (buf.length >= 8 && buf.readUInt16LE(0) === 0x5050) ? buf.slice(8) : buf;
  if (p.length < 8) return null;
  return { command: p.readUInt16LE(0), sessionId: p.readUInt16LE(4), data: p.slice(8) };
}

/** Plain TCP reachability + response time. */
function testConnection(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (o) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve({ host, port, ...o }); };
    sock.setTimeout(timeoutMs);
    sock.once('timeout', () => finish({ ok: false, responseMs: Date.now() - start, error: 'Connection timed out' }));
    sock.once('error', (e) => finish({ ok: false, responseMs: Date.now() - start, error: e.code || e.message }));
    sock.connect(port, host, () => finish({ ok: true, responseMs: Date.now() - start }));
  });
}

/**
 * Read-only discovery. Opens a TCP socket, sends a ZK CMD_CONNECT, and — only if
 * the device acknowledges the protocol — issues read-only queries (free sizes,
 * a few device-option strings) before exiting cleanly. Always returns raw bytes.
 */
function discover(host, port, { connectTimeout = 4000, readTimeout = 3500 } = {}) {
  return new Promise((resolve) => {
    const result = {
      host, port, reachable: false, connectMs: null,
      protocol: 'unknown', zkAcknowledged: false,
      deviceInfo: {}, counts: {}, rawHex: '', notes: [],
    };
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = () => { if (done) return; done = true; try { sock.write(zkTcp(zkPayload(CMD_EXIT))); } catch {} try { sock.destroy(); } catch {} resolve(result); };

    // Await a single reply for the next write.
    const exchange = (payload) => new Promise((res) => {
      const chunks = [];
      const onData = (d) => {
        chunks.push(d);
        clearTimeout(t);
        sock.removeListener('data', onData);
        res(Buffer.concat(chunks));
      };
      const t = setTimeout(() => { sock.removeListener('data', onData); res(null); }, readTimeout);
      sock.on('data', onData);
      sock.write(payload);
    });

    sock.setTimeout(connectTimeout);
    sock.once('timeout', () => { result.notes.push('TCP connect timed out'); finish(); });
    sock.once('error', (e) => { result.notes.push('Socket error: ' + (e.code || e.message)); finish(); });

    sock.connect(port, host, async () => {
      result.reachable = true;
      result.connectMs = Date.now() - start;
      sock.setTimeout(0);
      try {
        const reply = await exchange(zkTcp(zkPayload(CMD_CONNECT, 0, 0)));
        if (!reply || reply.length === 0) {
          result.notes.push('Port open but device returned no data to a ZKTeco handshake — it does not expose a standard pull protocol on this port.');
          return finish();
        }
        result.rawHex = reply.toString('hex').slice(0, 1000);
        const parsed = parseReply(reply);
        if (!parsed || parsed.command !== CMD_ACK_OK) {
          result.notes.push('Device replied but not with a ZK ACK — unrecognized protocol. Raw bytes captured.');
          return finish();
        }
        // ── Confirmed ZK protocol — proceed read-only ──
        result.protocol = 'ZKTeco';
        result.zkAcknowledged = true;
        const session = parsed.sessionId;

        const sizes = await exchange(zkTcp(zkPayload(CMD_GET_FREE_SIZES, session, 1)));
        if (sizes) {
          const ps = parseReply(sizes);
          result.rawHex += '|' + sizes.toString('hex').slice(0, 400);
          if (ps && ps.data && ps.data.length >= 80) {
            // Standard ZK free-sizes layout (counts are 32-bit LE).
            result.counts.userCount = ps.data.readUInt32LE(24);
            result.counts.attendanceLogCount = ps.data.readUInt32LE(40);
            result.counts.fingerCount = ps.data.readUInt32LE(16);
          }
        }

        const readOption = async (param) => {
          const r = await exchange(zkTcp(zkPayload(CMD_OPTIONS_RRQ, session, 2, Buffer.from(param + '\x00', 'latin1'))));
          if (!r) return null;
          const pr = parseReply(r);
          const s = pr && pr.data ? pr.data.toString('latin1').replace(/\x00+$/, '') : '';
          const eq = s.indexOf('=');
          return eq >= 0 ? s.slice(eq + 1) : s;
        };
        result.deviceInfo.deviceName = await readOption('~DeviceName');
        result.deviceInfo.firmwareVersion = await readOption('FirmVer');
        result.deviceInfo.serialNumber = await readOption('~SerialNumber');
        result.deviceInfo.model = await readOption('~ProductTime') ? (await readOption('~ZKFPVersion') || null) : null;
        return finish();
      } catch (e) {
        result.notes.push('Discovery error: ' + (e.message || e));
        return finish();
      }
    });
  });
}

module.exports = { testConnection, discover };
