import { getThreadsForFolder } from "@/lib/mail";
import { ThreadList } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const threads = await getThreadsForFolder("inbox");
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Inbox" count={threads.length} />
      <ThreadList threads={threads} emptyLabel="Nothing in your inbox" />
    </div>
  );
}
