import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// CLAUDE.md security rule: "Validate MIME type and size (5 MB max) on all
// file uploads server-side" - had no implementation anywhere in the repo
// until this route (Milestone 8, Task 4/Product Decision #6).
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ data: null, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  const boxId = formData.get("boxId");
  const snackId = formData.get("snackId");
  const isPrimary = formData.get("isPrimary") === "true";
  const altText = formData.get("altText");

  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { data: null, error: `Unsupported file type - must be one of: ${ALLOWED_MIME_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ data: null, error: "File exceeds the 5 MB size limit" }, { status: 400 });
  }
  if (typeof boxId !== "string" && typeof snackId !== "string") {
    return NextResponse.json({ data: null, error: "Either boxId or snackId is required" }, { status: 400 });
  }
  if (typeof boxId === "string" && typeof snackId === "string") {
    return NextResponse.json({ data: null, error: "Provide only one of boxId or snackId, not both" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const extension = EXTENSION_BY_MIME[file.type];
  const entityId = (boxId as string | null) ?? (snackId as string);
  const path = `${typeof boxId === "string" ? "boxes" : "snacks"}/${entityId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from("product-images")
    .upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ data: null, error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("product-images").getPublicUrl(path);

  // Same default-swap pattern as Milestone 7's customer_addresses: unset
  // any existing primary before inserting the new one, since the unique
  // partial index (one primary per box/snack) would otherwise reject the
  // insert while an old primary row still holds that flag.
  if (isPrimary) {
    await admin
      .from("product_images")
      .update({ is_primary: false })
      .eq(typeof boxId === "string" ? "box_id" : "snack_id", entityId)
      .eq("is_primary", true);
  }

  const { data: image, error: insertError } = await admin
    .from("product_images")
    .insert({
      box_id: typeof boxId === "string" ? boxId : null,
      snack_id: typeof snackId === "string" ? snackId : null,
      image_url: publicUrl,
      alt_text: typeof altText === "string" ? altText : null,
      is_primary: isPrimary,
    })
    .select("*")
    .single();

  if (insertError || !image) {
    return NextResponse.json({ data: null, error: insertError?.message ?? "Failed to record image" }, { status: 500 });
  }

  return NextResponse.json({ data: image, error: null }, { status: 201 });
}
