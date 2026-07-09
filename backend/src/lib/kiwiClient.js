import xmlrpc from "xmlrpc";

// Thin promise wrapper around Kiwi TCMS's XML-RPC API.
//
// Verified against a real local Kiwi TCMS instance — the docs are vague
// about this, but Kiwi TCMS authenticates via a Django session, not HTTP
// Basic Auth: call Auth.login(username, password) with two positional
// string args (not a struct), which both returns the session key AND sets
// it as a `sessionid` cookie. We just re-send that value as a Cookie header
// on every subsequent call; there's no per-call devKey/token param like
// TestLink uses.
// Docs: https://kiwitcms.readthedocs.io/en/latest/api/index.html
export async function createKiwiClient(baseUrl, username, password, allowSelfSigned = false) {
  const url = new URL(baseUrl);
  const isHttps = url.protocol === "https:";
  const xmlrpcFactory = isHttps ? xmlrpc.createSecureClient : xmlrpc.createClient;
  const baseOptions = {
    host: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: "/xml-rpc/",
    // Local/self-signed HTTPS instances need this explicitly opted into via
    // KIWI_ALLOW_SELF_SIGNED — defaults to secure (real cert validation).
    ...(isHttps && allowSelfSigned ? { rejectUnauthorized: false } : {}),
  };

  const loginClient = xmlrpcFactory(baseOptions);
  const sessionKey = await new Promise((resolve, reject) => {
    loginClient.methodCall("Auth.login", [username, password], (err, value) => {
      if (err) return reject(new Error(`Kiwi TCMS login failed: ${err.message}`));
      resolve(value);
    });
  });

  const client = xmlrpcFactory({ ...baseOptions, headers: { Cookie: `sessionid=${sessionKey}` } });

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      client.methodCall(method, [params], (err, value) => {
        if (err) return reject(err);
        resolve(value);
      });
    });
  }

  return { call };
}
