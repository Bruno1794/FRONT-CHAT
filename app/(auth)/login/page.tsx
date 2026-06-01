import { LoginForm } from "@/components/auth/LoginForm";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.header}>
          <p>SuporteSync</p>
          <h1>Entrar no painel</h1>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
