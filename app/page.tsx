"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/services/authStorage";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();

    router.replace(token ? "/dashboard?tab=chats" : "/chat");
  }, [router]);

  return null;
}
