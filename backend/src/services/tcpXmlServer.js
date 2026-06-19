/**
 * Phase 7A — eTimeOffice / eSSL XML-over-TCP handshake server (DIAGNOSTIC).
 *
 * The Time Office (Z500V2W / M50) device pushes proprietary XML <Message> frames
 * over a raw TCP socket (NOT HTTP). This server:
 *   - accepts socket connections on its own port (5005),
 *   - reassembles complete <Message>…</Message> frames,
 *   - parses TerminalType / DeviceUID / DeviceSerialNo / TerminalID,
 *   - sends a candidate XML ACK back and LOGS both the exact request and the
 *     exact response into device_push_logs,
 *   - tracks live stats (connection count, last frame) for the TCP monitor.
 *
 * Goal of 7A: determine the exact ACK the device needs (observe whether retry
 * frequency drops). It NEVER creates attendance or modifies employee data.
 */
const net = require('net');
const prisma = require('../config/prisma');

const ACK_VERSION = 'v1';

// Live stats for the monitor (in-memory).
const stats = {
  port: null,
  connectionCount: 0,
  messageCount: 0,
  lastXmlAt: null,
  lastDeviceUid: null,
  lastTerminalType: null,
  ackVersion: ACK_VERSION,
};

// Candidate ACK. eSSL/Realtime "Host PC" XML push expects an XML reply; the exact
// shape is what Phase 7A is determining — change this and watch the device's
// retry frequency in the monitor. (request + response are both logged.)
function buildAck(/* parsed, rawXml */) {
  return '<?xml version="1.0" encoding="UTF-8"?>\r\n<Message><Response>OK</Response><Result>1</Result></Message>\r\n';
}

const tagVal = (xml, name) => {
  const m = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'i').exec(xml || '');
  return m ? m[1].trim() : null;
};

// Throttle DB writes per device so a fast-retrying device can't flood the table;
// stats below still reflect the TRUE frequency.
const _lastLog = new Map();
const _shouldLog = (ip, ms = 2000) => {
  const now = Date.now();
  if (now - (_lastLog.get(ip) || 0) < ms) return false;
  _lastLog.set(ip, now);
  return true;
};

function handleFrame(socket, remote, xml) {
  const parsed = {
    terminalType: tagVal(xml, 'TerminalType'),
    deviceUid: tagVal(xml, 'DeviceUID'),
    deviceSerialNo: tagVal(xml, 'DeviceSerialNo'),
    terminalId: tagVal(xml, 'TerminalID'),
  };
  const response = buildAck(parsed, xml);
  let writeOk = true;
  try { socket.write(response); } catch (_) { writeOk = false; }

  stats.messageCount++;
  stats.lastXmlAt = new Date();
  stats.lastDeviceUid = parsed.deviceUid;
  stats.lastTerminalType = parsed.terminalType;

  if (_shouldLog(remote)) {
    prisma.devicePushLog.create({
      data: {
        deviceIp: remote,
        method: 'TCP-XML',
        path: `[tcp :${stats.port}] <Message> frame`,
        contentType: 'application/xml',
        rawPayload: String(xml).slice(0, 60000),
        responsePayload: ((writeOk ? '' : '(socket write FAILED) ') + response).slice(0, 60000),
        terminalType: parsed.terminalType,
        deviceUid: parsed.deviceUid,
        deviceSerialNo: parsed.deviceSerialNo,
        terminalId: parsed.terminalId,
        processingResult: `HANDSHAKE_ACK_${ACK_VERSION} (no attendance created)`,
      },
    }).catch((e) => console.error('[tcp-xml] log error:', e.message));
  }
}

function start(port) {
  stats.port = port;
  const server = net.createServer((socket) => {
    stats.connectionCount++;
    const remote = String(socket.remoteAddress || '').replace('::ffff:', '');
    let buf = '';
    socket.setEncoding('latin1');
    socket.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 200000) buf = buf.slice(-200000); // guard runaway buffers
      // Pull out every complete <Message>…</Message> frame (prolog included).
      let end;
      while ((end = buf.indexOf('</Message>')) !== -1) {
        const frameEnd = end + '</Message>'.length;
        const frame = buf.slice(0, frameEnd).trim();
        buf = buf.slice(frameEnd);
        if (frame) handleFrame(socket, remote, frame);
      }
    });
    socket.on('error', () => {});
    // Keep the socket open briefly for the device to continue the conversation,
    // then close idle sockets so they don't accumulate.
    socket.setTimeout(20000, () => { try { socket.destroy(); } catch (_) {} });
  });
  server.on('error', (e) => console.error(`[tcp-xml] listener :${port}:`, e.code || e.message));
  server.listen(port, () => console.log(`[tcp-xml] eTimeOffice XML handshake server listening on :${port}`));
  return server;
}

module.exports = { start, getStats: () => ({ ...stats }), ACK_VERSION };
