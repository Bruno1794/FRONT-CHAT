import Link from "next/link";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>SuporteSync</p>
        <h1>Atendimento em tempo real para times de suporte.</h1>
        <p className={styles.description}>
          Acesse o painel do atendente ou simule a experiencia do cliente no
          chat.
        </p>

        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/dashboard">
            Abrir painel
          </Link>
          <Link className={styles.secondaryAction} href="/chat">
            Ver chat
          </Link>
        </div>
      </section>
    </main>
  );
}
