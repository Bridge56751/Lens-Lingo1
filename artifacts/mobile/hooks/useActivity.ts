import { useEffect, useState } from "react";
import { subscribeActivity, getActivitySnapshot } from "@/lib/activity";

/**
 * Live view of the local practice-activity log. Re-renders whenever a practice
 * action is recorded anywhere in the app (the lib emits to all subscribers).
 */
export function useActivity() {
  const [snap, setSnap] = useState(getActivitySnapshot());
  useEffect(() => {
    const update = () => setSnap({ ...getActivitySnapshot() });
    const unsub = subscribeActivity(update);
    update();
    return unsub;
  }, []);
  return snap;
}
