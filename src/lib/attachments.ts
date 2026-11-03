// Shared attachment rules, used by the compose screen (browser) and the send
// API (server) so the two can never disagree.

export const ATTACHMENT_BUCKET = "attachments";

// Combined size of everything attached to ONE email. Gmail and most providers
// refuse mail over ~25 MB once the file is encoded for email (which adds
// about a third), so 15 MB of real files is the practical ceiling.
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

// File types Resend refuses to send (https://resend.com/docs/knowledge-base/what-attachment-types-are-not-supported).
export const BLOCKED_EXTENSIONS = new Set([
  "adp","app","asp","bas","bat","cer","chm","cmd","com","cpl","crt","csh","der","exe","fxp","gadget","hlp","hta",
  "inf","ins","isp","its","js","jse","ksh","lib","lnk","mad","maf","mag","mam","maq","mar","mas","mat","mau","mav",
  "maw","mda","mdb","mde","mdt","mdw","mdz","msc","msh","msh1","msh2","mshxml","msh1xml","msh2xml","msi","msp","mst",
  "ops","pcd","pif","plg","prf","prg","reg","scf","scr","sct","shb","shs","sys","ps1","ps1xml","ps2","ps2xml","psc1",
  "psc2","tmp","url","vb","vbe","vbs","vps","vsmacros","vss","vst","vsw","vxd","ws","wsc","wsf","wsh","xnk",
]);

export function isBlockedFileName(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return BLOCKED_EXTENSIONS.has(ext);
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
