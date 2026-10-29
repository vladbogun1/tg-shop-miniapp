// Our own hops: the gateways, Caddy, the host's edge proxy — loopback and private networks.
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:|::ffff:(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i;

/**
 * The address the outermost proxy saw, like the backend's ClientIp: X-Forwarded-For walked from the
 * right, skipping our own hops. X-Real-IP is the gateway's $remote_addr, i.e. the edge Caddy for everyone.
 */
export function ipOf(req) {
  const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((h) => h.trim()).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) if (!PRIVATE.test(hops[i])) return hops[i].slice(0, 64);
  return String(hops[0] || req.headers["x-real-ip"] || req.socket.remoteAddress || "").slice(0, 64);
}
