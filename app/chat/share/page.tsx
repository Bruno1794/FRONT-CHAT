import Link from "next/link";
import styles from "@/app/chat/chat.module.css";

export default function ChatSharePage() {
  return (
    <main className={styles.page}>
      <section className={styles.startPanel}>
        <span className={styles.startIcon}>AT</span>
        <h2>Compartilhar arquivo</h2>
        <p>
          Abra o app ATENDIMENTO instalado no celular e compartilhe imagens,
          PDFs ou documentos para anexar na conversa.
        </p>
        <Link className={styles.shareOpenLink} href="/chat">
          Abrir conversa
        </Link>
      </section>
    </main>
  );
}
