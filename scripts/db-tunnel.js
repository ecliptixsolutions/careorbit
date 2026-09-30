import "dotenv/config";
import { Client } from 'ssh2';
import net from 'net';

const SSH_HOST  = process.env.SSH_HOST  || '46.202.196.229';
const SSH_PORT  = Number(process.env.SSH_PORT  || 65002);
const SSH_USER  = process.env.SSH_USER  || 'u791891216';
const SSH_PASS  = process.env.SSH_PASS  || process.env.MYSQL_PASSWORD;
if (!SSH_PASS) { console.error('SSH_PASS or MYSQL_PASSWORD required'); process.exit(1); }
const LOCAL_PORT   = Number(process.env.TUNNEL_LOCAL_PORT || 3307);
const REMOTE_HOST  = '127.0.0.1';
const REMOTE_PORT  = 3306;
const RETRY_DELAY  = 3000; // ms between reconnect attempts

let tcpServer = null;
let retryTimer = null;
let shuttingDown = false;

function closeTcpServer(cb) {
  if (tcpServer) {
    tcpServer.close(() => { tcpServer = null; if (cb) cb(); });
    // force-close any lingering connections
    tcpServer.closeAllConnections?.();
  } else {
    if (cb) cb();
  }
}

function connect() {
  if (shuttingDown) return;

  const conn = new Client();

  conn.on('ready', () => {
    console.log(`[tunnel] SSH ready — ${SSH_HOST}:${SSH_PORT} → local :${LOCAL_PORT} → ${REMOTE_HOST}:${REMOTE_PORT}`);

    // Close any previous TCP server before creating a new one
    closeTcpServer(() => {
      tcpServer = net.createServer(sock => {
        conn.forwardOut('127.0.0.1', 0, REMOTE_HOST, REMOTE_PORT, (err, stream) => {
          if (err) { sock.destroy(); return; }
          sock.pipe(stream).on('error', () => {});
          stream.pipe(sock).on('error', () => {});
        });
      });

      tcpServer.listen(LOCAL_PORT, '127.0.0.1', () => {
        console.log(`[tunnel] Listening on 127.0.0.1:${LOCAL_PORT}`);
      });

      tcpServer.on('error', e => {
        console.error(`[tunnel] TCP server error: ${e.message}`);
        conn.end();
      });
    });
  });

  conn.on('error', e => {
    console.error(`[tunnel] SSH error: ${e.message} — reconnecting in ${RETRY_DELAY}ms`);
    scheduleReconnect();
  });

  conn.on('close', () => {
    console.warn('[tunnel] SSH connection closed — reconnecting in ' + RETRY_DELAY + 'ms');
    closeTcpServer();
    scheduleReconnect();
  });

  conn.connect({
    host: SSH_HOST,
    port: SSH_PORT,
    username: SSH_USER,
    password: SSH_PASS,
    keepaliveInterval: 10000,  // send keepalive every 10 s
    keepaliveCountMax: 5,       // disconnect after 5 missed keepalives (50 s)
    readyTimeout: 20000,
  });
}

function scheduleReconnect() {
  if (shuttingDown) return;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, RETRY_DELAY);
}

// Graceful shutdown
process.on('SIGINT',  () => { shuttingDown = true; clearTimeout(retryTimer); closeTcpServer(() => process.exit(0)); });
process.on('SIGTERM', () => { shuttingDown = true; clearTimeout(retryTimer); closeTcpServer(() => process.exit(0)); });

// Start
connect();
