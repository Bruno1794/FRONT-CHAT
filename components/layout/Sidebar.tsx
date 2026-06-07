"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import styles from "./Sidebar.module.css";

const navItems = [
  { href: "/dashboard?tab=dashboard", label: "Dashboard", icon: "DB", tab: "dashboard" },
  { href: "/dashboard?tab=chats", label: "Chats", icon: "CH", tab: "chats" },
  { href: "/dashboard?tab=clientes", label: "Clientes", icon: "CL", tab: "clientes" },
  { href: "/dashboard?tab=settings", label: "Configuracoes", icon: "CF", tab: "settings" },
];

type Props = {
  hideMobileMenuButton?: boolean;
};

export function Sidebar({ hideMobileMenuButton = false }: Props) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "dashboard";
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <button
        className={`${styles.mobileMenuButton} ${
          hideMobileMenuButton ? styles.hideMobileMenuButton : ""
        }`}
        type="button"
        aria-label="Abrir menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen(true)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>
      {isMenuOpen ? (
        <button
          className={styles.mobileBackdrop}
          type="button"
          aria-label="Fechar menu"
          onClick={() => setIsMenuOpen(false)}
        />
      ) : null}
      <aside className={`${styles.sidebar} ${isMenuOpen ? styles.open : ""}`}>
        <Link className={styles.brand} href="/" onClick={() => setIsMenuOpen(false)}>
          <Image
            alt=""
            aria-hidden="true"
            height={40}
            src="/icons/atendimento-192.png"
            width={40}
          />
          <span>ATENDIMENTO</span>
        </Link>
        <nav className={styles.nav} aria-label="Navegacao principal">
          {navItems.map((item) => (
            <Link
              className={activeTab === item.tab ? styles.activeNav : undefined}
              key={item.label}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
            >
              <span>{item.icon}</span>
              <small>{item.label}</small>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
