"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { saveAuthSession } from "@/services/authStorage";
import { login } from "@/services/chatApi";
import styles from "@/app/(auth)/login/login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@admin.com");
  const [senha, setSenha] = useState("123456");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await login(email, senha);
      saveAuthSession(session);
      router.push("/dashboard?tab=chats");
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
