import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 403 });
  return NextResponse.json({ status: "revoked" });
}
