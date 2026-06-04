import { API_URL } from "@/services/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const authHeader = request.headers.get("authorization");

  let response: Response;

  try {
    response = await fetch(`${API_URL}/messages`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
  } catch {
    return Response.json(
      { message: "Falha ao conectar na API de mensagens." },
      { status: 502 },
    );
  }

  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
