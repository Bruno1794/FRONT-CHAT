import { Suspense } from "react";
import { ChatWidgetClient } from "@/components/chat/ChatWidgetClient";

export default function ChatPage() {
  return (
    <Suspense>
      <ChatWidgetClient />
    </Suspense>
  );
}
