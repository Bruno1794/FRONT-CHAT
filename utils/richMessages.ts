const RICH_MESSAGE_PREFIX = "[[SUPORTESYNC_CARD:";
const RICH_MESSAGE_SUFFIX = "]]";

export type RichMessageAction = {
  id: string;
  label: string;
  type: "copy" | "link" | "reply";
  value: string;
};

export type CardMessage = {
  type: "card";
  variant?: "default" | "pix";
  title: string;
  body: string;
  value?: string;
  actions: RichMessageAction[];
};

export type PixCardMessage = {
  type: "pix";
  title: string;
  body: string;
  copyValue: string;
  copyLabel?: string;
};

export type RichMessage = CardMessage;

export function buildCardMessage(card: CardMessage) {
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
    const parsed = JSON.parse(rawJson) as RichMessage | PixCardMessage;

    if (parsed.type === "card" && parsed.title && parsed.actions?.length) {
      return {
        ...parsed,
        actions: parsed.actions.slice(0, 2),
      };
    }

    if (parsed.type === "pix" && parsed.copyValue) {
      return {
        type: "card",
        variant: "pix",
        title: parsed.title,
        body: parsed.body,
        value: parsed.copyValue,
        actions: [
          {
            id: "copy-pix",
            label: parsed.copyLabel || "Copiar",
            type: "copy",
            value: parsed.copyValue,
          },
        ],
      };
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

  return `${richMessage.title}: ${richMessage.body || richMessage.value || ""}`;
}
