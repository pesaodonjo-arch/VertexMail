import { Inbox, Send, FileEdit, Archive, ShieldAlert, Trash2, Search, type LucideIcon } from "lucide-react";

/** Single source of truth for the mail folders, shared by the desktop sidebar and the mobile drawer. */
export const folders: { href: string; label: string; icon: LucideIcon; showUnread?: boolean }[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox, showUnread: true },
  { href: "/sent", label: "Sent", icon: Send },
  { href: "/drafts", label: "Drafts", icon: FileEdit },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/spam", label: "Spam", icon: ShieldAlert },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/search", label: "Search", icon: Search },
];
