import { getThreadsForFolder } from "@/lib/mail";
import { ThreadList } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export const dynamic = "force-dynamic";

export default async function SentPage() {
  const threads = await getThreadsForFolder("sent");
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Sent" count={threads.length} />
      <ThreadList threads={threads} emptyLabel="No sent mail yet" />
    </div>
  );
}
