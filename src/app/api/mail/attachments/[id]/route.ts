import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";

/**
 * GET /api/mail/attachments/:id
 *
 * Opens/downloads one attachment. The row is read with the CALLER's own
 * session, so row-level security guarantees they can only get attachments
 * from their own mailbox. Only after that does the service-role client mint a
 * short-lived signed link to the (private) file in storage.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: att } = await supabase
    .from("attachments")
    .select("file_name, storage_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!att || !att.storage_path) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await createAdminClient()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(att.storage_path, 120);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "file_unavailable", message: "This attachment's file wasn't saved, so it can't be opened." },
      { status: 404 }
    );
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
