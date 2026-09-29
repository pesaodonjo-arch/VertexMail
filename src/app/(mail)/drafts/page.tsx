import { getThreadsForFolder } from "@/lib/mail";
import { ThreadList } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const threads = await getThreadsForFolder("drafts");
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Drafts" count={threads.length} />
      <ThreadList threads={threads} emptyLabel="No drafts saved" />
    </div>
  );
}
