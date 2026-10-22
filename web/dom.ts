type Controls = {
  "connection-form": HTMLFormElement;
  "api-key": HTMLInputElement;
  "client-id": HTMLInputElement;
  "brand-select": HTMLSelectElement;
  "extract-form": HTMLFormElement;
  "hotel-url": HTMLInputElement;
  "brand-form": HTMLFormElement;
  "brand-name": HTMLInputElement;
  "brand-tagline": HTMLInputElement;
  "brand-description": HTMLTextAreaElement;
  "design-form": HTMLFormElement;
  "email-design": HTMLTextAreaElement;
  "image-style": HTMLTextAreaElement;
  "generate-form": HTMLFormElement;
  "generate-subject": HTMLInputElement;
  "template-reference": HTMLInputElement;
  locale: HTMLSelectElement;
  "generate-prompt": HTMLTextAreaElement;
  "edit-form": HTMLFormElement;
  "edit-prompt": HTMLTextAreaElement;
  "rename-dialog": HTMLDialogElement;
  "rename-form": HTMLFormElement;
  "rename-name": HTMLInputElement;
  "html-dialog": HTMLDialogElement;
  "edit-baseline": HTMLSelectElement;
};
export function element<K extends string>(
  id: K,
): K extends keyof Controls ? Controls[K] : HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as K extends keyof Controls ? Controls[K] : HTMLElement;
}
