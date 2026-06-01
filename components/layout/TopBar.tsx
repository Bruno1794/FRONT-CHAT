import styles from "./TopBar.module.css";

type Props = {
  title: string;
  subtitle?: string;
  userName?: string;
};

export function TopBar({ title, subtitle, userName = "Atendente" }: Props) {
  return (
    <header className={styles.topbar}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className={styles.user}>
        <span className={styles.status} />
        {userName}
      </div>
    </header>
  );
}
