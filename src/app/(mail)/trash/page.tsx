import { getThreadsForFolder } from "@/lib/mail";
import { ThreadList } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const threads = await getThreadsForFolder("trash");
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Trash" count={threads.length} />
      <ThreadList threads={threads} emptyLabel="Trash is empty" />
    </div>
  );
}
