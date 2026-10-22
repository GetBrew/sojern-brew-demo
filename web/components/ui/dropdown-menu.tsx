// Shadcn dropdown-menu composition, using Radix for focus, keyboard and submenus.
import type { ComponentProps } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuSub = Menu.Sub;
export function DropdownMenuContent(
  props: ComponentProps<typeof Menu.Content>,
) {
  return (
    <Menu.Portal>
      <Menu.Content
        data-slot="dropdown-menu-content"
        className="menu-content"
        sideOffset={6}
        {...props}
      />
    </Menu.Portal>
  );
}
export function DropdownMenuSubContent(
  props: ComponentProps<typeof Menu.SubContent>,
) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        data-slot="dropdown-menu-sub-content"
        className="menu-content"
        sideOffset={6}
        {...props}
      />
    </Menu.Portal>
  );
}
export function DropdownMenuSubTrigger({
  children,
  ...props
}: ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className="menu-item"
      {...props}
    >
      {children}
      <span className="menu-chevron" aria-hidden>
        ›
      </span>
    </Menu.SubTrigger>
  );
}
export function DropdownMenuItem(props: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      data-slot="dropdown-menu-item"
      className="menu-item"
      {...props}
    />
  );
}
export function DropdownMenuSeparator() {
  return <Menu.Separator className="menu-separator" />;
}
