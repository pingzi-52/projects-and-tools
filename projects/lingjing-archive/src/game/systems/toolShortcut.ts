interface ToolKeys {
  on(event: "keydown-SPACE", listener: (event: Pick<KeyboardEvent, "repeat" | "preventDefault">) => void): unknown;
  off(event: "keydown-SPACE", listener: (event: Pick<KeyboardEvent, "repeat" | "preventDefault">) => void): unknown;
}

/** One deliberate tool action per press; ownership ends with the scene. */
export function bindToolShortcut(keys: ToolKeys, canUse: () => boolean, use: () => void): () => void {
  const listener = (event: Pick<KeyboardEvent, "repeat" | "preventDefault">): void => {
    if (!canUse()) return;
    event.preventDefault();
    if (!event.repeat) use();
  };
  keys.on("keydown-SPACE", listener);
  return () => { keys.off("keydown-SPACE", listener); };
}
