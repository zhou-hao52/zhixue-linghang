/*
 * 智学领航 Service Worker
 * 目标：让"添加到主屏"后的应用可离线打开、二次启动更快。
 * 策略：
 *   - 带内容哈希的静态资源（/assets/、图标、manifest）走「缓存优先」；
 *   - 文档导航（index.html）走「网络优先，失败回落缓存」。
 * 注意：仅在安全上下文（https 或 localhost）注册成功；局域网 http 下会自动跳过。
 */
const CACHE = "zxlh-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
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

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("./index.html")),
      ),
  );
});
