"use client";

import { useEffect, useState } from "react";
import { socket } from "../../app/lib/socket";

export function ReconnectBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function onDisconnect() {
      setOffline(true);
    }
    function onConnect() {
      setOffline(false);
    }
    
    // Initial state
    if (socket.disconnected) {
      setOffline(true);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 bg-warn/90 backdrop-blur-sm px-4 py-2 text-[12px] font-extrabold text-bg animate-[fade_.2s_ease-out]"
    >
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Reconnecting to server…
    </div>
  );
}
