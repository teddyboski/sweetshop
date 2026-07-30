// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postUpload } from "@/app/api/admin/uploads/route";

const admin = createAdminSupabaseClient();

let adminUserId: string;
let adminToken: string;
let customerToken: string;
let snackId: string;
const createdImageIds: string[] = [];
const createdStoragePaths: string[] = [];

beforeAll(async () => {
  const password = crypto.randomUUID();
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const adminEmail = `test-admin-uploads-${crypto.randomUUID()}@mailinator.com`;
  const { data: adminUser, error: adminError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  if (adminError || !adminUser.user) throw adminError;
  adminUserId = adminUser.user.id;
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminUserId);
  const { data: adminSession } = await anonAuthClient.auth.signInWithPassword({ email: adminEmail, password });
  adminToken = adminSession!.session!.access_token;

  const customerEmail = `test-customer-uploads-${crypto.randomUUID()}@mailinator.com`;
  await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
  });
  const { data: customerSession } = await anonAuthClient.auth.signInWithPassword({ email: customerEmail, password });
  customerToken = customerSession!.session!.access_token;

  const { data: snack } = await admin
    .from("snacks")
    .insert({ slug: `test-upload-snack-${crypto.randomUUID()}`, name: "Upload Test Snack" })
    .select("id")
    .single();
  snackId = snack!.id;
});

afterAll(async () => {
  for (const id of createdImageIds) {
    if (id) await admin.from("product_images").delete().eq("id", id);
  }
  for (const path of createdStoragePaths) {
    await admin.storage.from("product-images").remove([path]);
  }
  if (snackId) await admin.from("snacks").delete().eq("id", snackId);
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
});

afterEach(() => {
  createdImageIds.length = 0;
});

function uploadRequest(formData: FormData, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/admin/uploads", { method: "POST", headers, body: formData });
}

function fakeImageFile(sizeBytes: number, mimeType: string, name = "test.jpg") {
  return new File([new Uint8Array(sizeBytes)], name, { type: mimeType });
}

describe("POST /api/admin/uploads", () => {
  it("uploads a valid image to Storage and creates a product_images row", async () => {
    const formData = new FormData();
    formData.append("file", fakeImageFile(1024, "image/jpeg"));
    formData.append("snackId", snackId);
    formData.append("isPrimary", "true");

    const response = await postUpload(uploadRequest(formData, adminToken));
    const body = await response.json();
    expect(response.status).toBe(201);
    createdImageIds.push(body.data.id);

    expect(body.data.snack_id).toBe(snackId);
    expect(body.data.is_primary).toBe(true);
    expect(body.data.image_url).toContain("product-images");

    const path = new URL(body.data.image_url).pathname.split("/object/public/product-images/")[1];
    createdStoragePaths.push(path);
  });

  it("rejects a file over 5 MB with 400 and creates no row", async () => {
    const formData = new FormData();
    formData.append("file", fakeImageFile(6 * 1024 * 1024, "image/jpeg"));
    formData.append("snackId", snackId);

    const response = await postUpload(uploadRequest(formData, adminToken));
    expect(response.status).toBe(400);
  });

  it("rejects an unsupported MIME type with 400", async () => {
    const formData = new FormData();
    formData.append("file", fakeImageFile(1024, "application/pdf", "test.pdf"));
    formData.append("snackId", snackId);

    const response = await postUpload(uploadRequest(formData, adminToken));
    expect(response.status).toBe(400);
  });

  it("un-sets the previous primary image when a new one is uploaded as primary", async () => {
    const first = new FormData();
    first.append("file", fakeImageFile(1024, "image/jpeg"));
    first.append("snackId", snackId);
    first.append("isPrimary", "true");
    const firstResponse = await postUpload(uploadRequest(first, adminToken));
    const firstBody = await firstResponse.json();
    createdImageIds.push(firstBody.data.id);
    createdStoragePaths.push(new URL(firstBody.data.image_url).pathname.split("/object/public/product-images/")[1]);

    const second = new FormData();
    second.append("file", fakeImageFile(1024, "image/png", "second.png"));
    second.append("snackId", snackId);
    second.append("isPrimary", "true");
    const secondResponse = await postUpload(uploadRequest(second, adminToken));
    const secondBody = await secondResponse.json();
    createdImageIds.push(secondBody.data.id);
    createdStoragePaths.push(new URL(secondBody.data.image_url).pathname.split("/object/public/product-images/")[1]);

    const { data: firstAfter } = await admin.from("product_images").select("is_primary").eq("id", firstBody.data.id).single();
    const { data: secondAfter } = await admin
      .from("product_images")
      .select("is_primary")
      .eq("id", secondBody.data.id)
      .single();
    expect(firstAfter!.is_primary).toBe(false);
    expect(secondAfter!.is_primary).toBe(true);
  });

  it("rejects a non-admin with 403", async () => {
    const formData = new FormData();
    formData.append("file", fakeImageFile(1024, "image/jpeg"));
    formData.append("snackId", snackId);

    const response = await postUpload(uploadRequest(formData, customerToken));
    expect(response.status).toBe(403);
  });
});
