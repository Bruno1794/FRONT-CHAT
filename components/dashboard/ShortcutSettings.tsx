"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  changePassword,
  clearSystemData,
  createShortcut,
  deleteShortcut,
  getClientAccessLink,
  getShortcuts,
  updateShortcut,
} from "@/services/chatApi";
import type { ClientAccessLink, Shortcut, User } from "@/types";
import {
  buildCardMessage,
  getRichMessagePreview,
  parseRichMessage,
} from "@/utils/richMessages";
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
  kind: "text" | "card";
  cardValue: string;
  button1Label: string;
  button1Type: "copy" | "link" | "reply";
  button1Value: string;
  button2Label: string;
  button2Type: "copy" | "link" | "reply";
  button2Value: string;
  active: boolean;
  global: boolean;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyForm: FormState = {
  shortcut: "",
  title: "",
  message: "",
  kind: "text",
  cardValue: "",
  button1Label: "",
  button1Type: "copy",
  button1Value: "",
  button2Label: "",
  button2Type: "reply",
  button2Value: "",
  active: true,
  global: false,
};

const emptyPasswordForm: PasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
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
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [isClearingData, setIsClearingData] = useState(false);
  const [clearFeedback, setClearFeedback] = useState("");
  const [clearError, setClearError] = useState("");

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
    const richMessage = parseRichMessage(shortcut.message);

    setEditingShortcut(shortcut);
    setForm({
      shortcut: shortcut.shortcut,
      title: shortcut.title,
      message: richMessage?.type === "card" ? richMessage.body : shortcut.message,
      kind: richMessage?.type === "card" ? "card" : "text",
      cardValue: richMessage?.type === "card" ? richMessage.value ?? "" : "",
      button1Label: richMessage?.actions[0]?.label ?? "",
      button1Type: richMessage?.actions[0]?.type ?? "copy",
      button1Value: richMessage?.actions[0]?.value ?? "",
      button2Label: richMessage?.actions[1]?.label ?? "",
      button2Type: richMessage?.actions[1]?.type ?? "reply",
      button2Value: richMessage?.actions[1]?.value ?? "",
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
      const actions = [
        {
          id: "button-1",
          label: form.button1Label.trim(),
          type: form.button1Type,
          value: form.button1Value.trim(),
        },
        {
          id: "button-2",
          label: form.button2Label.trim(),
          type: form.button2Type,
          value: form.button2Value.trim(),
        },
      ].filter((action) => action.label && action.value);

      if (form.kind === "card" && actions.length === 0) {
        setError("Configure pelo menos um botao do card.");
        return;
      }

      const payload = {
        shortcut: form.shortcut.replace(/^\//, "").trim(),
        title: form.title.trim(),
        message:
          form.kind === "card"
            ? buildCardMessage({
                type: "card",
                variant: actions.some((action) => action.type === "copy") ? "pix" : "default",
                title: form.title.trim() || "Pix",
                body: form.message.trim(),
                value: form.cardValue.trim() || undefined,
                actions,
              })
            : form.message.trim(),
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

  const applyCardPreset = (preset: "pix" | "link" | "confirm") => {
    if (preset === "pix") {
      setForm((current) => ({
        ...current,
        kind: "card",
        title: current.title || "Pagamento via Pix",
        message: current.message || "Use o botao abaixo para copiar a chave Pix.",
        button1Label: "Copiar Pix",
        button1Type: "copy",
        button1Value: current.cardValue || current.button1Value,
        button2Label: "",
        button2Type: "reply",
        button2Value: "",
      }));
      return;
    }

    if (preset === "link") {
      setForm((current) => ({
        ...current,
        kind: "card",
        title: current.title || "Mais informacoes",
        message: current.message || "Toque no botao para abrir os detalhes.",
        button1Label: "Saiba mais",
        button1Type: "link",
        button1Value: current.button1Value,
        button2Label: "",
        button2Type: "reply",
        button2Value: "",
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      kind: "card",
      title: current.title || "Confirmar informacao",
      message: current.message || "Pode confirmar para mim?",
      button1Label: "Sim",
      button1Type: "reply",
      button1Value: "Sim",
      button2Label: "Nao",
      button2Type: "reply",
      button2Value: "Nao",
    }));
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

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token || isChangingPassword) {
      return;
    }

    setPasswordFeedback("");
    setPasswordError("");

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("A confirmacao da senha nao confere.");
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword(token, {
        senha_atual: passwordForm.currentPassword,
        nova_senha: passwordForm.newPassword,
      });
      setPasswordForm(emptyPasswordForm);
      setPasswordFeedback("Senha atualizada com sucesso.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Falha ao atualizar senha.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleClearSystemData = async () => {
    if (!token || user?.role !== "ADMIN" || isClearingData || clearConfirmation !== "LIMPAR") {
      return;
    }

    const confirmed = window.confirm(
      "Esta acao apaga conversas, mensagens, anexos, notas e inscricoes push. Usuarios e atalhos serao mantidos. Continuar?",
    );

    if (!confirmed) {
      return;
    }

    setIsClearingData(true);
    setClearFeedback("");
    setClearError("");

    try {
      const result = await clearSystemData(token);
      const deletedTotal = Object.values(result.deleted).reduce((total, value) => total + value, 0);
      setClearConfirmation("");
      setClearFeedback(
        `Limpeza concluida. ${deletedTotal} registros removidos. Mantidos: ${result.preserved.join(", ")}.`,
      );
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Falha ao limpar dados.");
    } finally {
      setIsClearingData(false);
    }
  };

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

      <section className={styles.accountSettings}>
        <div className={styles.clientAccessHeader}>
          <div>
            <span>Conta</span>
            <h2>Alterar senha</h2>
            <p>Atualize a senha do usuario administrativo logado.</p>
          </div>
        </div>

        <form className={styles.passwordForm} onSubmit={handleChangePassword}>
          <label>
            Senha atual
            <input
              autoComplete="current-password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  currentPassword: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Nova senha
            <input
              autoComplete="new-password"
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  newPassword: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Confirmar senha
            <input
              autoComplete="new-password"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))
              }
            />
          </label>
          <button disabled={isChangingPassword} type="submit">
            {isChangingPassword ? "Salvando..." : "Alterar senha"}
          </button>
        </form>

        {passwordError ? <p className={styles.clientAccessError}>{passwordError}</p> : null}
        {passwordFeedback ? (
          <p className={styles.clientAccessFeedback}>{passwordFeedback}</p>
        ) : null}
      </section>

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

      {user?.role === "ADMIN" ? (
        <section className={styles.dangerSettings}>
          <div className={styles.clientAccessHeader}>
            <div>
              <span>Manutencao</span>
              <h2>Limpar dados do atendimento</h2>
              <p>
                Remove conversas, mensagens, anexos, notas, reacoes e inscricoes push.
                Usuarios e atalhos cadastrados serao mantidos.
              </p>
            </div>
          </div>

          <div className={styles.clearDataForm}>
            <label>
              Digite LIMPAR para confirmar
              <input
                value={clearConfirmation}
                onChange={(event) => setClearConfirmation(event.target.value)}
              />
            </label>
            <button
              disabled={isClearingData || clearConfirmation !== "LIMPAR"}
              type="button"
              onClick={() => void handleClearSystemData()}
            >
              {isClearingData ? "Limpando..." : "Limpar dados"}
            </button>
          </div>

          {clearError ? <p className={styles.clientAccessError}>{clearError}</p> : null}
          {clearFeedback ? (
            <p className={styles.clientAccessFeedback}>{clearFeedback}</p>
          ) : null}
        </section>
      ) : null}

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
              <p>{getRichMessagePreview(shortcut.message)}</p>
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
                placeholder={
                  form.kind === "card"
                    ? "Ex: Segue a informacao para voce escolher uma opcao."
                    : "Ola, tudo bem? Como posso ajudar?"
                }
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
              />
            </label>

            <div className={styles.shortcutTypeGrid}>
              <button
                className={form.kind === "text" ? styles.activeShortcutType : ""}
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, kind: "text" }))
                }
              >
                <strong>Texto simples</strong>
                <small>Envia somente a mensagem cadastrada.</small>
              </button>
              <button
                className={form.kind === "card" ? styles.activeShortcutType : ""}
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, kind: "card" }))
                }
              >
                <strong>Card com botoes</strong>
                <small>Permite copiar, abrir link ou responder Sim/Nao.</small>
              </button>
            </div>

            {form.kind === "card" ? (
              <div className={styles.cardShortcutConfig}>
                <div className={styles.cardPresetActions}>
                  <button type="button" onClick={() => applyCardPreset("pix")}>
                    Pix
                  </button>
                  <button type="button" onClick={() => applyCardPreset("link")}>
                    Saiba mais
                  </button>
                  <button type="button" onClick={() => applyCardPreset("confirm")}>
                    Sim / Nao
                  </button>
                </div>

                <label>
                  Valor em destaque opcional
                  <input
                    placeholder="Ex: chave Pix, protocolo, codigo..."
                    value={form.cardValue}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cardValue: event.target.value,
                        button1Value:
                          current.button1Type === "copy" && !current.button1Value
                            ? event.target.value
                            : current.button1Value,
                      }))
                    }
                  />
                </label>

                {[1, 2].map((buttonNumber) => {
                  const labelKey = buttonNumber === 1 ? "button1Label" : "button2Label";
                  const typeKey = buttonNumber === 1 ? "button1Type" : "button2Type";
                  const valueKey = buttonNumber === 1 ? "button1Value" : "button2Value";

                  return (
                    <div className={styles.shortcutButtonConfig} key={buttonNumber}>
                      <strong>Botao {buttonNumber}</strong>
                      <input
                        placeholder={buttonNumber === 1 ? "Ex: Copiar Pix" : "Ex: Nao"}
                        value={form[labelKey]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [labelKey]: event.target.value,
                          }))
                        }
                      />
                      <select
                        value={form[typeKey]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [typeKey]: event.target.value as FormState[typeof typeKey],
                          }))
                        }
                      >
                        <option value="copy">Copiar</option>
                        <option value="link">Abrir link</option>
                        <option value="reply">Responder</option>
                      </select>
                      <input
                        placeholder={
                          form[typeKey] === "link"
                            ? "https://..."
                            : form[typeKey] === "reply"
                              ? "Texto enviado ao clicar"
                              : "Texto que sera copiado"
                        }
                        value={form[valueKey]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [valueKey]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}

                <div className={styles.cardPreview}>
                  <div className={styles.cardPreviewHeader}>
                    <span>
                      {form.button1Type === "copy" || form.cardValue ? "PIX" : "INFO"}
                    </span>
                    <strong>{form.title || "Titulo do card"}</strong>
                  </div>
                  <p>{form.message || "Mensagem que aparece para o cliente."}</p>
                  {form.cardValue ? <code>{form.cardValue}</code> : null}
                  <div className={styles.cardPreviewActions}>
                    {[
                      {
                        label: form.button1Label,
                        type: form.button1Type,
                      },
                      {
                        label: form.button2Label,
                        type: form.button2Type,
                      },
                    ]
                      .filter((action) => action.label.trim())
                      .map((action, index) => (
                        <button data-action={action.type} key={`${action.label}-${index}`} type="button">
                          {action.label}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ) : null}

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
