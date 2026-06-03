"use client";

import { useEffect } from "react";

function getInstallStartUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}`;

  if (window.location.pathname.startsWith("/chat")) {
    return currentPath || "/chat";
  }

  return "/dashboard?tab=chats";
}

function updateManifestForCurrentRoute() {
  const startUrl = getInstallStartUrl();
  const manifestUrl = `/api/pwa-manifest?start_url=${encodeURIComponent(startUrl)}`;
  let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

  if (!manifestLink) {
    manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    document.head.appendChild(manifestLink);
  }

  manifestLink.href = manifestUrl;
}

export function PwaRegistration() {
  useEffect(() => {
    updateManifestForCurrentRoute();

    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
