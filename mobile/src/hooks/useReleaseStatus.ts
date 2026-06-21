import { useCallback, useEffect, useRef, useState } from "react";
import EventSource from "react-native-sse";
import { getAccessToken } from "../store/auth";
import { getServerUrl } from "../store/server";

export type StatusLine = { type: string; text: string; raw: string };

function parseLine(raw: string): StatusLine | null {
  if (!raw || raw === "ping") return null;
  const i = raw.indexOf(":");
  if (i < 0) return { type: "info", text: raw, raw };
  return { type: raw.slice(0, i), text: raw.slice(i + 1), raw };
}

export function useReleaseStatus(active: boolean) {
  const [lines, setLines] = useState<StatusLine[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => setLines([]), []);

  useEffect(() => {
    if (!active) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const base = await getServerUrl();
      const token = await getAccessToken();
      if (!base || !token || cancelled) return;

      const es = new EventSource(`${base}/api/status`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
      });
      esRef.current = es;

      es.addEventListener("message", (event) => {
        const parsed = parseLine(event.data || "");
        if (!parsed) return;
        setLines((prev) => [...prev, parsed]);
      });

      es.addEventListener("error", () => {
        es.close();
      });
    })();

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [active]);

  return { lines, clear };
}
