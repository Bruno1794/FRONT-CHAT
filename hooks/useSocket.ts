"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getApiUrl } from "@/services/api";

export const useSocket = (token?: string) => {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io(getApiUrl(), {
      auth: { token },
    });
    setSocket(socketRef.current);

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token]);

  return socket;
};
