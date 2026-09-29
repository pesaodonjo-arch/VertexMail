import { getThreadsForFolder } from "@/lib/mail";
import { ThreadList } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export const dynamic = "force-dynamic";

export default async function SpamPage() {
  const threads = await getThreadsForFolder("spam");
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Spam" count={threads.length} />
      <ThreadList
        threads={threads}
        emptyLabel="No spam"
        emptyHint="Conversations you report as spam will show up here."
      />
    </div>
  );
}
