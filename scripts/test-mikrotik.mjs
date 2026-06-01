import http from "node:http";

const auth = "Basic " + Buffer.from("nrsp-api:3dhouse@").toString("base64");
console.log("Auth header:", auth);

const req = http.request({
  hostname: "10.12.0.1",
  port: 80,
  path: "/rest/system/identity",
  method: "GET",
  headers: { Authorization: auth },
}, (res) => {
  console.log("Status:", res.statusCode);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => console.log("Body:", data));
});

req.on("error", (e) => console.error("Error:", e));
req.end();
