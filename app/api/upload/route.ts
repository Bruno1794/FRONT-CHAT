import { API_URL } from "@/services/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const authHeader = request.headers.get("authorization");

  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
