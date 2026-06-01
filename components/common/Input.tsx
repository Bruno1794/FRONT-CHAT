import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ className = "", id, label, ...props }: InputProps) {
  const inputId = id ?? props.name ?? label.toLowerCase();

  return (
    <label className={`${styles.field} ${className}`} htmlFor={inputId}>
      <span>{label}</span>
      <input id={inputId} {...props} />
    </label>
  );
}
