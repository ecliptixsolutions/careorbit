/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type Session = { id: string; user: { id: string }; access_token?: string };

type JwtClaims = {
  session_id?: string;
};

function decodeClaims(accessToken: string): JwtClaims {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return {};
  }
}

export function getSessionId(session: Session | null) {
  return session ? decodeClaims(session.access_token).session_id : undefined;
}

export function useSessionTracking(session: Session | null, roleKey?: string) {
  useEffect(() => {
    if (!session?.user.id || !roleKey) return;

    const sessionId = getSessionId(session);
    if (!sessionId) return;

    const track = async () => {
      await (supabase as any).from("user_sessions").upsert({
        id: sessionId,
        user_id: session.user.id,
        role: roleKey,
        last_activity_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
        device_label: navigator.platform || "Browser",
      });
    };

    void track();
  }, [roleKey, session]);
}
