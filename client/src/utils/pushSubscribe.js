function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications not supported in this browser');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');

  const keyRes = await fetch('/api/automations/push/vapid-public-key');
  if (!keyRes.ok) throw new Error('Push not configured on server');
  const { key } = await keyRes.json();

  const reg = await navigator.serviceWorker.ready;

  // Always unsubscribe from any existing subscription so a VAPID key change
  // doesn't leave a stale binding that causes 401 delivery failures.
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe().catch(() => {});

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const json = sub.toJSON();
  const res = await fetch('/api/automations/push/subscribe', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({
      endpoint: json.endpoint,
      p256dh:   json.keys.p256dh,
      auth:     json.keys.auth,
    }),
  });

  // The browser subscription can succeed while the server refuses to store it
  // (auth expired, validation, write failure). Without this check the caller
  // reported "enabled", the toggle went on, and nothing was ever delivered —
  // a failure with no symptom anywhere. Roll the local subscription back so the
  // device state matches the server's.
  if (!res.ok) {
    const detail = await res.json().then((d) => d.error).catch(() => null);
    await sub.unsubscribe().catch(() => {});
    throw new Error(detail || `Server rejected the subscription (${res.status})`);
  }

  return sub;
}
