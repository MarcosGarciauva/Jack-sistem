interface MonitoringEvent {
  area: string;
  message: string;
  extra?: Record<string, unknown>;
}

export const monitoringService = {
  async captureError(error: unknown, area: string, extra?: Record<string, unknown>) {
    const message = error instanceof Error ? error.message : String(error);
    const event: MonitoringEvent = { area, message, extra };
    console.error("[Jack]", event);

    const endpoint = import.meta.env.VITE_MONITORING_ENDPOINT;
    if (!endpoint) return;

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...event,
          at: new Date().toISOString(),
          url: window.location.href
        })
      });
    } catch {
      // Never break the app because monitoring failed.
    }
  }
};
