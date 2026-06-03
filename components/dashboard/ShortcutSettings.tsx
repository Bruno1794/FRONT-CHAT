"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createShortcut,
  deleteShortcut,
  getClientAccessLink,
  getShortcuts,
  updateShortcut,
} from "@/services/chatApi";
import type { ClientAccessLink, Shortcut, User } from "@/types";
import styles from "@/app/dashboard/dashboard.module.css";

type Props = {
  token: string | null;
  user: User | null;
  notificationContent?: ReactNode;
};

type FormState = {
  shortcut: string;
  title: string;
  message: string;
  active: boolean;
  global: boolean;
};

const emptyForm: FormState = {
  shortcut: "",
  title: "",
  message: "",
  active: true,
  global: false,
};

export function ShortcutSettings({ token, user, notificationContent }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldStartWithNewShortcut = searchParams.get("shortcut") === "new";
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(shouldStartWithNewShortcut);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clientAccess, setClientAccess] = useState<ClientAccessLink | null>(null);
  const [isGeneratingAccess, setIsGeneratingAccess] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const loadShortcuts = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await getShortcuts(token, search);
      setShortcuts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar atalhos.");
    } finally {
      setIsLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadShortcuts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadShortcuts]);

  const openCreateModal = () => {
    setEditingShortcut(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (shortcut: Shortcut) => {
    setEditingShortcut(shortcut);
    setForm({
      shortcut: shortcut.shortcut,
      title: shortcut.title,
      message: shortcut.message,
      active: shortcut.active,
      global: shortcut.user_id === null,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingShortcut(null);
    setForm(emptyForm);

    if (searchParams.get("shortcut") === "new") {
      router.replace("/dashboard?tab=settings");
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const payload = {
        ...form,
        shortcut: form.shortcut.replace(/^\//, "").trim(),
        title: form.title.trim(),
        message: form.message.trim(),
        global: user?.role === "ADMIN" ? form.global : false,
      };

      if (editingShortcut) {
        await updateShortcut(token, editingShortcut.id, payload);
      } else {
        await createShortcut(token, payload);
      }

      closeModal();
      await loadShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar atalho.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (shortcut: Shortcut) => {
    if (!token || !window.confirm(`Excluir o atalho /${shortcut.shortcut}?`)) {
      return;
    }

    setError("");

    try {
      await deleteShortcut(token, shortcut.id);
      await loadShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir atalho.");
    }
  };

  const handleToggleActive = async (shortcut: Shortcut) => {
    if (!token) {
      return;
    }

    setError("");

    try {
      await updateShortcut(token, shortcut.id, { active: !shortcut.active });
      await loadShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar atalho.");
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    setCopyFeedback("");

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`${label} copiado.`);
    } catch {
      setCopyFeedback("Nao foi possivel copiar automaticamente. Selecione e copie manualmente.");
    }
  };

  const handleGenerateClientAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token || isGeneratingAccess) {
      return;
    }

    const trimmedClienteId = clienteId.trim();

    if (!trimmedClienteId) {
      setAccessError("Informe o ID do cliente.");
      setClientAccess(null);
      return;
    }

    setIsGeneratingAccess(true);
    setAccessError("");
    setCopyFeedback("");

    try {
      const data = await getClientAccessLink(token, trimmedClienteId);
      setClientAccess(data);
    } catch (err) {
      setClientAccess(null);
      setAccessError(err instanceof Error ? err.message : "Falha ao gerar acesso do cliente.");
    } finally {
      setIsGeneratingAccess(false);
    }
  };

  const clientAccessMessage = clientAccess
    ? `Ola! Para falar com nosso atendimento, acesse: ${clientAccess.url}`
    : "";

  return (
    <div className={styles.settingsView}>
      <header className={styles.settingsHeader}>
        <div>
          <span>Configuracoes</span>
          <h1>Atalhos de mensagem</h1>
          <p>Cadastre respostas rapidas para usar no chat digitando /.</p>
        </div>
        <button type="button" onClick={openCreateModal}>
          Novo atalho
        </button>
      </header>

      {notificationContent}

      <section className={styles.clientAccessSettings}>
        <div className={styles.clientAccessHeader}>
          <div>
            <span>Acesso do cliente</span>
            <h2>Gerar link do chat</h2>
            <p>
              Informe o ID do cliente na API externa para gerar o codigo e copiar o link
              do atendimento.
            </p>
          </div>
        </div>

        <form className={styles.clientAccessForm} onSubmit={handleGenerateClientAccess}>
          <label>
            ID do cliente
            <input
              placeholder="Ex: 123"
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
            />
          </label>
          <button disabled={isGeneratingAccess} type="submit">
            {isGeneratingAccess ? "Gerando..." : "Gerar acesso"}
          </button>
        </form>

        {accessError ? <p className={styles.clientAccessError}>{accessError}</p> : null}

        {clientAccess ? (
          <div className={styles.clientAccessResult}>
            <div className={styles.clientAccessMeta}>
              <span>{clientAccess.cliente.nome}</span>
              <small>ID: {clientAccess.cliente.id}</small>
              <small>Referencia: {clientAccess.referencia ?? "Nao informada"}</small>
              <small>Codigo: {clientAccess.codigo}</small>
            </div>

            <div className={styles.clientAccessLinkBox}>
              <label>
                Link para enviar
                <input readOnly value={clientAccess.url} />
              </label>
              <label>
                Mensagem pronta
                <textarea readOnly rows={3} value={clientAccessMessage} />
              </label>
            </div>

            <div className={styles.clientAccessActions}>
              <button
                type="button"
                onClick={() => void copyToClipboard(clientAccess.url, "Link")}
              >
                Copiar link
              </button>
              <button
                type="button"
                onClick={() => void copyToClipboard(clientAccess.codigo, "Codigo")}
              >
                Copiar codigo
              </button>
              <button
                type="button"
                onClick={() => void copyToClipboard(clientAccessMessage, "Mensagem")}
              >
                Copiar mensagem
              </button>
            </div>

            {copyFeedback ? (
              <p className={styles.clientAccessFeedback}>{copyFeedback}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className={styles.settingsToolbar}>
        <input
          placeholder="Buscar por atalho, titulo ou mensagem"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void loadShortcuts();
            }
          }}
        />
        <button type="button" onClick={() => void loadShortcuts()}>
          Buscar
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {isLoading ? <p className={styles.state}>Carregando atalhos...</p> : null}

      <section className={styles.shortcutList}>
        {!isLoading && shortcuts.length === 0 ? (
          <p className={styles.state}>Nenhum atalho cadastrado.</p>
        ) : null}
        {shortcuts.map((shortcut) => (
          <article className={styles.shortcutCard} key={shortcut.id}>
            <div>
              <span>/{shortcut.shortcut}</span>
              <strong>{shortcut.title}</strong>
              <p>{shortcut.message}</p>
            </div>
            <div className={styles.shortcutMeta}>
              <small>{shortcut.user_id === null ? "Global" : "Meu atalho"}</small>
              <small>{shortcut.active ? "Ativo" : "Inativo"}</small>
            </div>
            <div className={styles.shortcutActions}>
              <button type="button" onClick={() => handleToggleActive(shortcut)}>
                {shortcut.active ? "Desativar" : "Ativar"}
              </button>
              <button type="button" onClick={() => openEditModal(shortcut)}>
                Editar
              </button>
              <button type="button" onClick={() => void handleDelete(shortcut)}>
                Excluir
              </button>
            </div>
          </article>
        ))}
      </section>

      {isModalOpen ? (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={closeModal}>
          <form
            className={styles.shortcutModal}
            onSubmit={handleSave}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>{editingShortcut ? "Editar" : "Novo"}</span>
                <h2>{editingShortcut ? "Editar atalho" : "Criar atalho"}</h2>
              </div>
              <button type="button" onClick={closeModal}>
                x
              </button>
            </header>

            <label>
              Atalho
              <input
                required
                placeholder="/saudacao"
                value={form.shortcut}
                onChange={(event) =>
                  setForm((current) => ({ ...current, shortcut: event.target.value }))
                }
              />
            </label>
            <label>
              Titulo
              <input
                required
                placeholder="Saudacao inicial"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label>
              Mensagem
              <textarea
                required
                rows={6}
                placeholder="Ola, tudo bem? Como posso ajudar?"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
              />
            </label>

            <div className={styles.formChecks}>
              <label>
                <input
                  checked={form.active}
                  type="checkbox"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, active: event.target.checked }))
                  }
                />
                Ativo
              </label>
              {user?.role === "ADMIN" ? (
                <label>
                  <input
                    checked={form.global}
                    type="checkbox"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        global: event.target.checked,
                      }))
                    }
                  />
                  Global para atendentes
                </label>
              ) : null}
            </div>

            <footer>
              <button type="button" onClick={closeModal}>
                Cancelar
              </button>
              <button disabled={isSaving} type="submit">
                {isSaving ? "Salvando..." : "Salvar atalho"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
