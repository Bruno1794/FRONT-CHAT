"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { getAccessToken, saveAuthSession } from "@/services/authStorage";
import { login } from "@/services/chatApi";
import styles from "@/app/(auth)/login/login.module.css";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = sanitizeNextUrl(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getAccessToken()) {
      router.replace(nextUrl);
    }
  }, [nextUrl, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await login(email, senha);
      saveAuthSession(session);
      router.replace(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Input
        label="E-mail"
        name="email"
        placeholder="voce@empresa.com"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Senha"
        name="password"
        placeholder="Sua senha"
        type="password"
        value={senha}
        onChange={(event) => setSenha(event.target.value)}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? "Entrando..." : "Acessar"}
      </Button>
    </form>
  );
}

function sanitizeNextUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard?tab=chats";
  }

  if (!value.startsWith("/dashboard")) {
    return "/dashboard?tab=chats";
  }

  return value;
}
