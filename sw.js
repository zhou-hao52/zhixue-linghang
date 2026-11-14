/*
 * 智学领航 Service Worker
 * 目标：让"添加到主屏"后的应用可离线打开、二次启动更快。
 * 策略：
 *   - 带内容哈希的静态资源（/assets/、图标、manifest）走「缓存优先」；
 *   - 文档导航（index.html）走「网络优先，失败回落缓存」；
 *   - 接口（/api/*）**完全不拦截**。
 * 注意：仅在安全上下文（https 或 localhost）注册成功；局域网 http 下会自动跳过。
 *
 * 为什么必须排除 /api/*：探活与看板数据必须实时。一旦被缓存，
 * 后端重启后探活仍命中旧的 200，页面会显示"在线"但所有请求都失败。
 */
/**
 * 版本号由构建期注入（vite.config.ts 的 swVersion 插件把它替换成时间戳）。
 * 若写成固定字符串，重新构建后本文件字节不变，浏览器就不会更新 SW，
 * 旧 index.html 与它引用的旧哈希资源会一直驻留，最终表现为白屏。
 */
const CACHE = "zxlh-mwg93wk2";
const SHELL = ["./index.html", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 预缓存不能因单个图标 404 就整体失败，否则 SW 永远装不上。
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(pathname) {
  return /\/assets\/|\/icon-|favicon\.svg$|manifest\.webmanifest$/.test(pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 接口一律绕过缓存，交给浏览器直连。
  // 用 includes 而不是 startsWith：部署到子路径时 URL 前缀会变。
  if (url.pathname.includes("/api/")) return;

  // PDF 等分段请求（Range）不缓存，否则会拿到残缺响应。
  if (req.headers.get("range")) return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 文档导航：网络优先，失败时回落缓存；其余请求不回落到 index.html
  // （给脚本请求返回 HTML 会变成难以定位的语法错误）。
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
