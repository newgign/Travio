import { useSyncExternalStore } from "react";
import { readSession, sessionSnapshot, subscribeSession } from "../services/session";

export default function useSession() {
  return readSession(useSyncExternalStore(subscribeSession, sessionSnapshot));
}
