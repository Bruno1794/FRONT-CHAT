import { API_URL } from "@/services/api";

type Context = {
  params: Promise<{
    filename: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: Context) {
  const { filename } = await context.params;
  const response = await fetch(`${API_URL}/files/${encodeURIComponent(filename)}`, {
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    return new Response("Arquivo nao encontrado", { status: response.status || 404 });
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");
  const contentDisposition = response.headers.get("content-disposition");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (contentLength) {
    headers.set("content-length", contentLength);
  }

  if (contentDisposition) {
    headers.set("content-disposition", contentDisposition);
  }

  headers.set("cache-control", "no-store");

  return new Response(response.body, {
    headers,
    status: response.status,
  });
}
