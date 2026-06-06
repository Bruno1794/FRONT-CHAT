const RICH_MESSAGE_PREFIX = "[[SUPORTESYNC_CARD:";
const RICH_MESSAGE_SUFFIX = "]]";

export type PixCardMessage = {
  type: "pix";
  title: string;
  body: string;
  copyValue: string;
  copyLabel?: string;
};

export type RichMessage = PixCardMessage;

export function buildPixCardMessage(card: PixCardMessage) {
  return `${RICH_MESSAGE_PREFIX}${JSON.stringify(card)}${RICH_MESSAGE_SUFFIX}`;
}

export function parseRichMessage(message?: string | null): RichMessage | null {
  if (!message?.startsWith(RICH_MESSAGE_PREFIX) || !message.endsWith(RICH_MESSAGE_SUFFIX)) {
    return null;
  }

  try {
    const rawJson = message.slice(
      RICH_MESSAGE_PREFIX.length,
      -RICH_MESSAGE_SUFFIX.length,
    );
    const parsed = JSON.parse(rawJson) as RichMessage;

    if (parsed.type === "pix" && parsed.copyValue) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function getRichMessagePreview(message?: string | null) {
  const richMessage = parseRichMessage(message);

  if (!richMessage) {
    return message ?? "";
  }

  if (richMessage.type === "pix") {
    return `${richMessage.title}: ${richMessage.body || richMessage.copyValue}`;
  }

  return message ?? "";
}
