"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  changePassword,
  clearSystemData,
  createChatPopupConfig,
  createShortcut,
  deleteChatPopupConfig,
  deleteShortcut,
  getClientAccessLink,
  getShortcuts,
  listChatPopupConfigs,
  updateChatPopupConfigById,
  updateShortcut,
  uploadFile,
} from "@/services/chatApi";
import type { ChatPopupConfig, ClientAccessLink, Shortcut, User } from "@/types";
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

type SettingsTab =
  | "shortcuts"
  | "access"
  | "popup"
  | "account"
  | "notifications"
  | "maintenance";

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

const emptyPopupForm: ChatPopupConfig = {
  enabled: false,
  id: "welcome-v1",
  title: "",
  message: "",
  imageUrl: "",
  imageAlt: "Imagem do aviso",
  ctaLabel: "",
  ctaUrl: "",
  dismissHours: 24,
  delayMs: 500,
  allowMarkAsSeen: true,
  closeOnBackdrop: true,
  requireConversation: false,
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
  const [popups, setPopups] = useState<ChatPopupConfig[]>([]);
  const [popupForm, setPopupForm] = useState<ChatPopupConfig>(emptyPopupForm);
  const [editingPopupId, setEditingPopupId] = useState<string | null>(null);
  const [isPopupLoading, setIsPopupLoading] = useState(true);
  const [isPopupSaving, setIsPopupSaving] = useState(false);
  const [isPopupImageUploading, setIsPopupImageUploading] = useState(false);
  const [popupFeedback, setPopupFeedback] = useState("");
  const [popupError, setPopupError] = useState("");
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>(
    shouldStartWithNewShortcut ? "shortcuts" : "shortcuts",
  );
  const allSettingsTabs: Array<{
    id: SettingsTab;
    label: string;
    description: string;
  }> = [
    {
      id: "shortcuts",
      label: "Atalhos",
      description: "Respostas rapidas e cards com botoes",
    },
    {
      id: "access",
      label: "Acesso",
      description: "Links e codigos do cliente",
    },
    {
      id: "popup",
      label: "Popup",
      description: "Aviso inicial do chat",
    },
    {
      id: "account",
      label: "Conta",
      description: "Senha do usuario logado",
    },
    {
      id: "notifications",
      label: "Notificacoes",
      description: "Push do painel e celular",
    },
    {
      id: "maintenance",
      label: "Manutencao",
      description: "Limpeza administrativa",
    },
  ];
  const settingsTabs = allSettingsTabs.filter(
    (tab) => tab.id !== "maintenance" || user?.role === "ADMIN",
  );
  const currentSettingsTab = settingsTabs.find((tab) => tab.id === activeSettingsTab) ?? settingsTabs[0];

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

  const loadPopups = useCallback(async (selectActive = false) => {
    if (!token) {
      return;
    }

    setIsPopupLoading(true);
    setPopupError("");

    try {
      const data = await listChatPopupConfigs(token);
      setPopups(data);

      if (selectActive) {
        const activePopup = data.find((popup) => popup.enabled);
        setPopupForm(activePopup ?? emptyPopupForm);
        setEditingPopupId(activePopup?.id ?? null);
      }
    } catch (err) {
      setPopupError(err instanceof Error ? err.message : "Falha ao carregar popups.");
    } finally {
      setIsPopupLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadShortcuts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadShortcuts]);

  useEffect(() => {
    let timeoutId: number;

    if (!token) {
      timeoutId = window.setTimeout(() => setIsPopupLoading(false), 0);
      return () => window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      void loadPopups(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPopups, token]);

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

  const buildPopupPayload = (): ChatPopupConfig => ({
    ...popupForm,
    id: popupForm.id.trim() || `popup-${Date.now()}`,
    title: popupForm.title.trim(),
    message: popupForm.message.trim(),
    imageUrl: popupForm.imageUrl.trim(),
    imageAlt: popupForm.imageAlt.trim() || "Imagem do aviso",
    ctaLabel: popupForm.ctaLabel.trim(),
    ctaUrl: popupForm.ctaUrl.trim(),
    dismissHours: Math.max(0, Number(popupForm.dismissHours) || 0),
    delayMs: Math.max(0, Number(popupForm.delayMs) || 0),
  });

  const handleNewPopup = () => {
    setEditingPopupId(null);
    setPopupForm({
      ...emptyPopupForm,
      id: `popup-${Date.now()}`,
    });
    setPopupFeedback("");
    setPopupError("");
  };

  const handleEditPopup = (popup: ChatPopupConfig) => {
    setEditingPopupId(popup.id);
    setPopupForm(popup);
    setPopupFeedback("");
    setPopupError("");
  };

  const handleDeletePopup = async (popup: ChatPopupConfig) => {
    if (!token || isPopupSaving) {
      return;
    }

    if (!window.confirm(`Excluir o popup "${popup.title || popup.id}"?`)) {
      return;
    }

    setIsPopupSaving(true);
    setPopupFeedback("");
    setPopupError("");

    try {
      await deleteChatPopupConfig(token, popup.id);
      setPopupFeedback("Popup excluido.");

      if (editingPopupId === popup.id) {
        handleNewPopup();
      }

      await loadPopups();
    } catch (err) {
      setPopupError(err instanceof Error ? err.message : "Falha ao excluir popup.");
    } finally {
      setIsPopupSaving(false);
    }
  };

  const handleSavePopupFromCard = async (popup: ChatPopupConfig) => {
    if (!token || isPopupSaving) {
      return;
    }

    setIsPopupSaving(true);
    setPopupFeedback("");
    setPopupError("");

    try {
      const savedConfig = await updateChatPopupConfigById(token, popup.id, {
        ...popup,
        id: popup.id.trim(),
        title: popup.title.trim(),
        message: popup.message.trim(),
        imageUrl: popup.imageUrl.trim(),
        imageAlt: popup.imageAlt.trim() || "Imagem do aviso",
        ctaLabel: popup.ctaLabel.trim(),
        ctaUrl: popup.ctaUrl.trim(),
        dismissHours: Math.max(0, Number(popup.dismissHours) || 0),
        delayMs: Math.max(0, Number(popup.delayMs) || 0),
      });

      setPopupFeedback(savedConfig.enabled ? "Popup ativado." : "Popup desativado.");
      await loadPopups();

      if (editingPopupId === popup.id) {
        setPopupForm(savedConfig);
      }
    } catch (err) {
      setPopupError(err instanceof Error ? err.message : "Falha ao atualizar popup.");
    } finally {
      setIsPopupSaving(false);
    }
  };

  const handlePopupImageUpload = async (file: File | undefined) => {
    if (!file || !token || isPopupImageUploading) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPopupError("Selecione um arquivo de imagem.");
      return;
    }

    setIsPopupImageUploading(true);
    setPopupFeedback("");
    setPopupError("");

    try {
      const uploadedFile = await uploadFile(file, token);

      setPopupForm((current) => ({
        ...current,
        imageUrl: uploadedFile.url || current.imageUrl,
        imageAlt:
          current.imageAlt && current.imageAlt !== "Imagem do aviso"
            ? current.imageAlt
            : uploadedFile.original_name || file.name || "Imagem do aviso",
      }));
      setPopupFeedback("Imagem enviada. Salve o popup para aplicar.");
    } catch (err) {
      setPopupError(err instanceof Error ? err.message : "Falha ao enviar imagem.");
    } finally {
      setIsPopupImageUploading(false);
    }
  };

  const handleSavePopup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token || isPopupSaving) {
      return;
    }

    setPopupFeedback("");
    setPopupError("");

    if (
      popupForm.enabled &&
      !popupForm.title.trim() &&
      !popupForm.message.trim() &&
      !popupForm.imageUrl.trim()
    ) {
      setPopupError("Configure titulo, mensagem ou imagem antes de ativar.");
      return;
    }

    setIsPopupSaving(true);

    try {
      const payload = buildPopupPayload();
      const savedConfig = editingPopupId
        ? await updateChatPopupConfigById(token, editingPopupId, payload)
        : await createChatPopupConfig(token, payload);

      setPopupForm(savedConfig);
      setEditingPopupId(savedConfig.id);
      setPopupFeedback("Popup salvo. Novos clientes ja recebem esta configuracao.");
      await loadPopups();
    } catch (err) {
      setPopupError(err instanceof Error ? err.message : "Falha ao salvar popup.");
    } finally {
      setIsPopupSaving(false);
    }
  };

  return (
    <div className={styles.settingsView}>
      <header className={styles.settingsHeader}>
        <div>
          <span>Configuracoes</span>
          <h1>{currentSettingsTab.label}</h1>
          <p>{currentSettingsTab.description}</p>
        </div>
        {activeSettingsTab === "shortcuts" ? (
          <button type="button" onClick={openCreateModal}>
            Novo atalho
          </button>
        ) : null}
      </header>

      <nav className={styles.settingsTabs} aria-label="Configuracoes">
        {settingsTabs.map((tab) => (
          <button
            className={tab.id === activeSettingsTab ? styles.activeSettingsTab : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveSettingsTab(tab.id)}
          >
            <strong>{tab.label}</strong>
            <small>{tab.description}</small>
          </button>
        ))}
      </nav>

      {activeSettingsTab === "notifications" ? notificationContent : null}

      {activeSettingsTab === "popup" ? (
        <section className={styles.popupSettings}>
          <div className={styles.clientAccessHeader}>
            <div>
              <span>Popup do chat</span>
              <h2>Popups cadastrados</h2>
              <p>
                Cadastre varios avisos e deixe ativo apenas o que deve aparecer
                para o cliente ao abrir o chat.
              </p>
            </div>
            <button type="button" onClick={handleNewPopup}>
              Novo popup
            </button>
          </div>

          {isPopupLoading ? <p className={styles.state}>Carregando popup...</p> : null}

          {!isPopupLoading && popups.length === 0 ? (
            <p className={styles.state}>Nenhum popup cadastrado.</p>
          ) : null}

          {popups.length > 0 ? (
            <div className={styles.popupList}>
              {popups.map((popup) => (
                <article
                  className={`${styles.popupCard} ${
                    editingPopupId === popup.id ? styles.activePopupCard : ""
                  }`}
                  key={popup.id}
                >
                  <div>
                    <span>{popup.enabled ? "Ativo" : "Inativo"}</span>
                    <strong>{popup.title || "Popup sem titulo"}</strong>
                    <small>Versao: {popup.id}</small>
                    <p>{popup.message || popup.imageUrl || "Sem conteudo configurado."}</p>
                  </div>
                  <div className={styles.popupCardActions}>
                    <button type="button" onClick={() => handleEditPopup(popup)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSavePopupFromCard({
                          ...popup,
                          enabled: !popup.enabled,
                        })
                      }
                    >
                      {popup.enabled ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => void handleDeletePopup(popup)}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <form className={styles.popupForm} onSubmit={handleSavePopup}>
            <div className={styles.popupFormHeader}>
              <div>
                <span>{editingPopupId ? "Editando" : "Novo cadastro"}</span>
                <h3>{editingPopupId ? popupForm.title || popupForm.id : "Criar popup"}</h3>
              </div>
              {editingPopupId ? (
                <button type="button" onClick={handleNewPopup}>
                  Cancelar edicao
                </button>
              ) : null}
            </div>
            <div className={styles.formChecks}>
              <label>
                <input
                  checked={popupForm.enabled}
                  type="checkbox"
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />
                Popup ativo
              </label>
              <label>
                <input
                  checked={popupForm.closeOnBackdrop}
                  type="checkbox"
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      closeOnBackdrop: event.target.checked,
                    }))
                  }
                />
                Fechar clicando fora
              </label>
              <label>
                <input
                  checked={popupForm.allowMarkAsSeen}
                  type="checkbox"
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      allowMarkAsSeen: event.target.checked,
                    }))
                  }
                />
                Permitir marcar como visto
              </label>
              <label>
                <input
                  checked={popupForm.requireConversation}
                  type="checkbox"
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      requireConversation: event.target.checked,
                    }))
                  }
                />
                Mostrar so depois de iniciar conversa
              </label>
            </div>

            <div className={styles.popupFormGrid}>
              <label>
                Versao do popup
                <div className={styles.popupVersionRow}>
                  <input
                    value={popupForm.id}
                    onChange={(event) =>
                      setPopupForm((current) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPopupForm((current) => ({
                        ...current,
                        id: `popup-${Date.now()}`,
                      }))
                    }
                  >
                    Nova versao
                  </button>
                </div>
                <small>
                  Mude a versao quando quiser que clientes que marcaram como
                  visto vejam o popup novamente.
                </small>
              </label>

              <label>
                Titulo
                <input
                  placeholder="Ex: Bem-vindo ao atendimento"
                  value={popupForm.title}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Mensagem
                <textarea
                  rows={5}
                  placeholder="Digite o aviso que aparece quando o cliente entrar no chat."
                  value={popupForm.message}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                />
              </label>

              <div className={styles.popupImageField}>
                <span>Imagem do popup</span>
                {popupForm.imageUrl ? (
                  <div className={styles.popupImagePreview}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={popupForm.imageUrl} alt={popupForm.imageAlt} />
                    <button
                      type="button"
                      onClick={() =>
                        setPopupForm((current) => ({
                          ...current,
                          imageUrl: "",
                        }))
                      }
                    >
                      Remover imagem
                    </button>
                  </div>
                ) : null}
                <input
                  accept="image/*"
                  disabled={isPopupImageUploading}
                  type="file"
                  onChange={(event) => {
                    void handlePopupImageUpload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <small>
                  {isPopupImageUploading
                    ? "Enviando imagem..."
                    : "Envie uma imagem do computador para aparecer no popup do cliente."}
                </small>
              </div>

              <label>
                Texto alternativo da imagem
                <input
                  value={popupForm.imageAlt}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      imageAlt: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Texto do botao
                <input
                  placeholder="Ex: Saiba mais"
                  value={popupForm.ctaLabel}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      ctaLabel: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Link do botao
                <input
                  placeholder="https://..."
                  value={popupForm.ctaUrl}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      ctaUrl: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Reaparecer apos fechar
                <select
                  value={String(popupForm.dismissHours)}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      dismissHours: Number(event.target.value),
                    }))
                  }
                >
                  <option value="0">Sempre que entrar</option>
                  <option value="24">24 horas</option>
                  <option value="48">2 dias</option>
                  <option value="72">3 dias</option>
                  <option value="168">7 dias</option>
                  <option value="720">30 dias</option>
                </select>
              </label>

              <label>
                Atraso para aparecer em ms
                <input
                  min={0}
                  type="number"
                  value={popupForm.delayMs}
                  onChange={(event) =>
                    setPopupForm((current) => ({
                      ...current,
                      delayMs: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            {popupError ? <p className={styles.clientAccessError}>{popupError}</p> : null}
            {popupFeedback ? (
              <p className={styles.clientAccessFeedback}>{popupFeedback}</p>
            ) : null}

            <div className={styles.popupActions}>
              <button disabled={isPopupSaving || !token} type="submit">
                {isPopupSaving ? "Salvando..." : "Salvar popup"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {activeSettingsTab === "account" ? (
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
      ) : null}

      {activeSettingsTab === "access" ? (
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
      ) : null}

      {activeSettingsTab === "maintenance" && user?.role === "ADMIN" ? (
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

      {activeSettingsTab === "shortcuts" ? (
      <>
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
      </>
      ) : null}

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
