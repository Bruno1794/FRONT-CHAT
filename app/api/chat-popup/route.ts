import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { API_URL } from "@/services/api";
import type { ChatPopupConfig } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveConfigDir() {
  const configuredDir = process.env.CHAT_POPUP_CONFIG_DIR?.trim();

  if (!configuredDir) {
    return path.join(/* turbopackIgnore: true */ process.cwd(), ".data");
  }

  if (path.isAbsolute(configuredDir)) {
    return configuredDir;
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), configuredDir);
}

const CONFIG_DIR = resolveConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, "chat-popup.json");

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "sim", "on"].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultConfig(): ChatPopupConfig {
  const dismissDays = Math.max(
    0,
    readNumber(process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_DISMISS_DAYS, 1),
  );

  return {
    enabled: readBoolean(process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ENABLED, false),
    id: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ID?.trim() || "default",
    title: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_TITLE?.trim() || "",
    message:
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_MESSAGE?.replace(/\\n/g, "\n").trim() ||
      "",
    imageUrl: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_IMAGE_URL?.trim() || "",
    imageAlt:
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_IMAGE_ALT?.trim() ||
      "Imagem do aviso",
    ctaLabel: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_CTA_LABEL?.trim() || "",
    ctaUrl: process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_CTA_URL?.trim() || "",
    dismissHours: Math.max(
      0,
      readNumber(
        process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_DISMISS_HOURS,
        dismissDays * 24,
      ),
    ),
    delayMs: Math.max(
      0,
      readNumber(process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_DELAY_MS, 500),
    ),
    allowMarkAsSeen: readBoolean(
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ALLOW_MARK_AS_SEEN ??
        process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_ALLOW_DONT_SHOW_AGAIN,
      true,
    ),
    closeOnBackdrop: readBoolean(
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_CLOSE_ON_BACKDROP,
      true,
    ),
    requireConversation: readBoolean(
      process.env.NEXT_PUBLIC_CHAT_OPENING_POPUP_REQUIRE_CONVERSATION,
      false,
    ),
  };
}

function sanitizeConfig(input: Partial<ChatPopupConfig>): ChatPopupConfig {
  const fallback = defaultConfig();

  return {
    enabled: Boolean(input.enabled),
    id: String(input.id || fallback.id).trim() || "default",
    title: String(input.title || "").trim(),
    message: String(input.message || "").trim(),
    imageUrl: String(input.imageUrl || "").trim(),
    imageAlt: String(input.imageAlt || fallback.imageAlt).trim() || fallback.imageAlt,
    ctaLabel: String(input.ctaLabel || "").trim(),
    ctaUrl: String(input.ctaUrl || "").trim(),
    dismissHours: Math.max(0, Number(input.dismissHours) || 0),
    delayMs: Math.max(0, Number(input.delayMs) || 0),
    allowMarkAsSeen: Boolean(input.allowMarkAsSeen),
    closeOnBackdrop: Boolean(input.closeOnBackdrop),
    requireConversation: Boolean(input.requireConversation),
  };
}

async function readConfig() {
  try {
    const content = await readFile(CONFIG_FILE, "utf8");
    return sanitizeConfig(JSON.parse(content) as Partial<ChatPopupConfig>);
  } catch {
    return defaultConfig();
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro desconhecido.";
}

async function verifyAdmin(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { authorization },
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const config = await readConfig();

  return Response.json(config, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) {
    return Response.json({ message: "Nao autorizado." }, { status: 401 });
  }

  let body: Partial<ChatPopupConfig>;

  try {
    body = (await request.json()) as Partial<ChatPopupConfig>;
  } catch {
    return Response.json({ message: "JSON invalido." }, { status: 400 });
  }

  const config = sanitizeConfig(body);

  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    return Response.json(
      {
        message: `Nao foi possivel salvar o popup em ${CONFIG_FILE}. Confira se o usuario do PM2 tem permissao de escrita ou configure CHAT_POPUP_CONFIG_DIR. Detalhe: ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }

  return Response.json(config, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
