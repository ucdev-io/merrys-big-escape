import { networkInterfaces } from 'node:os';

/** This computer's addresses on the local network (e.g. 192.168.1.20). Wi-Fi first. */
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({ name, address: a.address, wifi: /wi-?fi|wlan|wireless/i.test(name), virtual: /vbox|virtual|vmware|hyper-v|vethernet|docker|wsl/i.test(name) });
    }
  }
  out.sort((a, b) => (b.wifi - a.wifi) || (a.virtual - b.virtual));
  return out.filter((a) => !a.virtual).concat(out.filter((a) => a.virtual));
}

/** Handler for GET /api/lan → { urls: ["http://192.168.1.20:5173", ...] } */
export function lanInfoHandler(req, res) {
  const port = (req.headers.host || '').split(':')[1] || '80';
  const urls = lanAddresses().map((a) => `http://${a.address}:${port}`);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ urls }));
}
