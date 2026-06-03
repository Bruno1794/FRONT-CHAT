"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ACCESS_TOKEN_KEY = "suportesync.accessToken";
const CLIENT_CHAT_SESSION_KEY = "suportesync.clientChat";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type StoredClientChat = {
  code?: string;
};

function isRunningInstalledPwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function getStoredClientCode() {
  const stored =
    localStorage.getItem(CLIENT_CHAT_SESSION_KEY) ??
    sessionStorage.getItem(CLIENT_CHAT_SESSION_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as StoredClientChat;
    return parsed.code?.trim() || null;
  } catch {
    return null;
  }
}

function getInstallStartUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}`;

  if (window.location.pathname.startsWith("/chat")) {
    return currentPath || "/chat";
  }

  return "/dashboard?tab=chats";
}

function redirectInstalledClientShortcut() {
  if (!isRunningInstalledPwa() || window.location.pathname.startsWith("/chat")) {
    return;
  }

  if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
    return;
  }

  const storedCode = getStoredClientCode();

  if (!storedCode) {
    return;
  }

  window.location.replace(`/chat?code=${encodeURIComponent(storedCode)}`);
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
  const pathname = usePathname();

  useEffect(() => {
    updateManifestForCurrentRoute();
    redirectInstalledClientShortcut();
  }, [pathname]);

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
