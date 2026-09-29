import { getThreadsForFolder } from "@/lib/mail";
import { ThreadList } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const threads = await getThreadsForFolder("archive");
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Archive" count={threads.length} />
      <ThreadList threads={threads} emptyLabel="Archive is empty" />
    </div>
  );
}
