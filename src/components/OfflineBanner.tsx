"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export function OfflineBanner() {
  const { locale } = useI18n();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("sw:offline", update as EventListener);
    window.addEventListener("sw:online", update as EventListener);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("sw:offline", update as EventListener);
      window.removeEventListener("sw:online", update as EventListener);
    };
  }, []);

  if (!offline) return null;

  const text =
    locale === "ar"
      ? "أنت دون اتصال — المحرر وتشغيل بايثون يعملان دون اتصال بعد التخزين، الموجّه يحتاج الشبكة."
      : locale === "en"
        ? "You are offline — editor and Python still work offline once cached, tutor needs network."
        : "Tu es hors ligne — l'éditeur et l'exécution Python restent disponibles hors ligne une fois mis en cache, le tuteur nécessite le réseau.";

  return (
    <div className="bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white" role="status" data-testid="offline-banner">
      {text}
    </div>
  );
}
