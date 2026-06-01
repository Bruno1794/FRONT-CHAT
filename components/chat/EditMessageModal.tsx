"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./EditMessageModal.module.css";

type Props = {
  initialMessage: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (message: string) => void;
};

export function EditMessageModal({
  initialMessage,
  isSaving = false,
  onClose,
  onSave,
}: Props) {
  const [message, setMessage] = useState(initialMessage);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!message.trim() || message.trim() === initialMessage.trim()) {
      return;
    }

    onSave(message.trim());
  };

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <form
        className={styles.modal}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <span>Mensagem</span>
            <h2>Editar mensagem</h2>
          </div>
          <button
            className={styles.close}
            type="button"
            aria-label="Fechar edicao"
            onClick={onClose}
          >
            X
          </button>
        </header>

        <textarea
          autoFocus
          className={styles.textarea}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        <footer className={styles.footer}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            disabled={!message.trim() || message.trim() === initialMessage.trim() || isSaving}
            type="submit"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </footer>
      </form>
    </div>
  );
}
