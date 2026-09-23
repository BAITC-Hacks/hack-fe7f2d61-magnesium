"use client";
import { useEffect, useId, useRef } from "react";

export function DiscardDialog({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="discard-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onKeep();
      }}
    >
      <h2 id={titleId}>Есть несохранённый текст</h2>
      <p>
        Если уйти, введённые изменения потеряются. Можно остаться и сохранить
        их.
      </p>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onDiscard}>
          Уйти без сохранения
        </button>
        <button className="btn btn-primary" autoFocus onClick={onKeep}>
          Продолжить редактирование
        </button>
      </div>
    </dialog>
  );
}
