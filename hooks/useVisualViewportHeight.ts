"use client";

import { useEffect } from "react";

const APP_HEIGHT_PROPERTY = "--app-height";
const IOS_VIEWPORT_CLASS = "ios-viewport";

export function useVisualViewportHeight() {
  useEffect(() => {
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const updateHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;

      document.documentElement.style.setProperty(APP_HEIGHT_PROPERTY, `${height}px`);
    };

    document.documentElement.classList.toggle(IOS_VIEWPORT_CLASS, isIos);
    updateHeight();

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    window.addEventListener("pageshow", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);

    return () => {
      document.documentElement.classList.remove(IOS_VIEWPORT_CLASS);
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
      window.removeEventListener("pageshow", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
    };
  }, []);
}
