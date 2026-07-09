import xmlrpc from "xmlrpc";

// Thin promise wrapper around TestLink's XML-RPC API. Every method takes a
// single struct param that must include devKey — see TestLink's API docs:
// https://github.com/TestLinkOpenSourceTRMS/testlink-code/blob/master/lib/api/xmlrpc/v1/xmlrpc.class.php
export function createTestLinkClient(baseUrl, devKey) {
  const url = new URL(baseUrl);
  const xmlrpcFactory = url.protocol === "https:" ? xmlrpc.createSecureClient : xmlrpc.createClient;
  const client = xmlrpcFactory({
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: `${url.pathname.replace(/\/$/, "")}/lib/api/xmlrpc/v1/xmlrpc.php`,
  });

  // TestLink reports API-level errors (bad devKey, unknown id, ...) as a 200
  // OK XML-RPC response containing an array of {code, message} structs,
  // rather than as an XML-RPC fault. Real data structs always carry more
  // than those two fields, so this shape is a reliable way to tell them apart.
  function looksLikeErrorResponse(value) {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => item && typeof item === "object" && "code" in item && "message" in item && Object.keys(item).length === 2)
    );
  }

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      client.methodCall(method, [{ devKey, ...params }], (err, value) => {
        if (err) return reject(err);
        if (looksLikeErrorResponse(value)) {
          return reject(new Error(`TestLink ${method} error: ${value.map((v) => v.message).join("; ")}`));
        }
        resolve(value);
      });
    });
  }

  return { call };
}
