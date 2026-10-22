import http from "node:http";
import { readFile } from "node:fs/promises";
import handler from "./api/demo.ts";
const config = JSON.parse(
  await readFile(new URL("./vercel.json", import.meta.url), "utf8"),
);
const root = new URL("./public/", import.meta.url);
const types = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  md: "text/markdown",
  pdf: "application/pdf",
};
http
  .createServer(async (req, res) => {
    for (const h of config.headers[0].headers) res.setHeader(h.key, h.value);
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/api/demo") return await handler(req, res);
      const file = path === "/" ? "index.html" : path.slice(1);
      if (file.includes("..")) {
        res.writeHead(400);
        return res.end();
      }
      const data = await readFile(new URL(file, root));
      res.writeHead(200, {
        "Content-Type":
          types[file.split(".").pop()] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 4400), "127.0.0.1", () =>
    console.log("Local guide listening on loopback"),
  );
