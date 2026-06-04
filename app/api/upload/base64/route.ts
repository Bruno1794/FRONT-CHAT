import { API_URL } from "@/services/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json();
  const authHeader = request.headers.get("authorization");

  let response: Response;

  try {
    response = await fetch(`${API_URL}/upload/base64`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
  } catch {
    return Response.json(
      { message: "Falha ao conectar na API de upload." },
      { status: 502 },
    );
  }

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
