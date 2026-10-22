import type { EmailGroup, ListEmailsResponse } from "@brew.new/sdk";
import type { StudioEmail } from "../lib/contracts.ts";
export interface PickerActions {
  loadGroup(id: string, more?: boolean): unknown;
  selectGroup(id: string): unknown;
  selectEmail(groupId: string, emailId: string): unknown;
  renameGroup(group: EmailGroup): unknown;
  createGroup(): unknown;
  moreGroups(): unknown;
}
export interface PickerProps {
  groups?: EmailGroup[];
  groupId: string;
  email?: StudioEmail | null;
  groupRows?: Map<string, ListEmailsResponse>;
  hasMore?: boolean;
  busy?: boolean;
}
import { createRoot } from "react-dom/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu.tsx";
export function createEmailPicker(
  element: HTMLElement,
  actions: PickerActions,
) {
  const root = createRoot(element);
  return (props: PickerProps) =>
    root.render(<Picker {...props} actions={actions} />);
}
function Picker({
  groups = [],
  groupId,
  email,
  groupRows = new Map(),
  hasMore = false,
  busy = false,
  actions,
}: PickerProps & { actions: PickerActions }) {
  const group = groups.find((g) => g.groupId === groupId);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="button small picker-trigger"
          disabled={busy || !groups.length}
          aria-label="Choose group or email"
        >
          {email?.title || group?.groupName || "Choose group or email"}
          <span aria-hidden>⌄</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={12}>
        {groups.map((group) => (
          <DropdownMenuSub
            key={group.groupId}
            onOpenChange={(open) => {
              if (open) actions.loadGroup(group.groupId);
            }}
          >
            <DropdownMenuSubTrigger>
              {group.groupName}
              <span className="menu-count">{group.emailCount}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent collisionPadding={12}>
              <DropdownMenuItem
                onSelect={() => actions.selectGroup(group.groupId)}
              >
                Open group canvas
              </DropdownMenuItem>
              {group.groupId !== "ungrouped" && (
                <DropdownMenuItem onSelect={() => actions.renameGroup(group)}>
                  Rename group…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!groupRows.has(group.groupId) ? (
                <DropdownMenuItem disabled>Loading emails…</DropdownMenuItem>
              ) : null}
              {groupRows.get(group.groupId)?.data.map((row) => (
                <DropdownMenuItem
                  key={row.emailId}
                  onSelect={() =>
                    actions.selectEmail(group.groupId, row.emailId)
                  }
                >
                  {row.title || row.emailId}
                  {row.status !== "ready" ? " · " + row.status : ""}
                </DropdownMenuItem>
              ))}
              {groupRows.get(group.groupId)?.data.length === 0 ? (
                <DropdownMenuItem disabled>No emails yet</DropdownMenuItem>
              ) : null}
              {groupRows.get(group.groupId)?.pagination?.hasMore ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    actions.loadGroup(group.groupId, true);
                  }}
                >
                  Load more emails
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
        <DropdownMenuSeparator />
        {hasMore && (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              actions.moreGroups();
            }}
          >
            Load more groups
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => actions.createGroup()}>
          New group…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
