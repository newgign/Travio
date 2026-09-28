import { useEffect, useSyncExternalStore } from "react";
import { ensureSessionValidated, validatedSessionSnapshot, subscribeValidatedSession } from "../services/session";

export default function useSession() {
  const state = useSyncExternalStore(subscribeValidatedSession, validatedSessionSnapshot, validatedSessionSnapshot);
  useEffect(() => {
    const timer = setTimeout(() => { void ensureSessionValidated(); }, 0);
    return () => clearTimeout(timer);
  }, [state]);
  return state;
}
