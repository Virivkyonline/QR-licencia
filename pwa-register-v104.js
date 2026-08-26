(function () {
  if (!("serviceWorker" in navigator)) return;

  const isNativeApp = location.protocol === "capacitor:" || location.hostname === "localhost";
  if (isNativeApp) {
    window.addEventListener("load", async function () {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (err) {
        console.warn("Native cache cleanup failed:", err);
      }
    });
    return;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", async function () {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      await registration.update();
    } catch (err) {
      console.warn("Service worker registration failed:", err);
    }
  });
})();
