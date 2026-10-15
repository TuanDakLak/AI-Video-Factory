/**
 * Optional webhook for unattended runs. Set AUTOMATION_WEBHOOK_URL (Slack/Discord/Make/n8n… any endpoint accepting JSON).
 * Failures to notify never break the pipeline. Payload: { event, at, ...data } plus a human "text" (Slack/Discord friendly).
 */
export async function notifyWebhook(event: string, data: Record<string, unknown> = {}): Promise<void> {
  const url = process.env.AUTOMATION_WEBHOOK_URL;
  if (!url) return;
  try {
    const text = `[AIcontent] ${event} ${JSON.stringify(data).slice(0, 1500)}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, at: new Date().toISOString(), ...data, text, content: text }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e: any) {
    console.warn(`[notify] webhook failed: ${e?.message}`);
  }
}
