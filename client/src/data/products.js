import { supabase } from "../lib/supabase";
import { deleteProductImage, uploadProductImage } from "../lib/productImages";

export const PAGE_SIZE = 20;

export const SORTS = {
  name: { label: "Name (A–Z)", column: "name", ascending: true },
  newest: { label: "Newest first", column: "created_at", ascending: false },
  price_desc: {
    label: "Price: high to low",
    column: "selling_price",
    ascending: false,
  },
  price_asc: {
    label: "Price: low to high",
    column: "selling_price",
    ascending: true,
  },
  stock_asc: {
    label: "Stock: low to high",
    column: "quantity_on_hand",
    ascending: true,
  },
};

// Characters that would break PostgREST's or(...) syntax or act as wildcards.
const cleanTerm = (s) => s.replace(/[%_,()\\*]/g, " ").trim();

export async function listProducts({
  businessId,
  q,
  categoryId,
  status,
  stock,
  sort,
  page,
}) {
  let query = supabase
    .from("products_with_status")
    .select("*", { count: "exact" })
    .eq("business_id", businessId);

  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);
  if (categoryId === "none") query = query.is("category_id", null);
  else if (categoryId) query = query.eq("category_id", categoryId);
  if (stock === "low" || stock === "out")
    query = query.eq("stock_status", stock);

  const term = cleanTerm(q ?? "");
  if (term)
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`,
    );

  const { column, ascending } = SORTS[sort] ?? SORTS.name;
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order(column, { ascending })
    .order("id") // stable ordering so pages never overlap
    .range(from, from + PAGE_SIZE - 1);

  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

export function getProduct(businessId, id) {
  return supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
}

// Upload first, then save the row, then remove the replaced image. If the save fails, the new upload is removed again so no orphan files are left behind.
export async function saveProduct({
  businessId,
  id,
  fields,
  newImage,
  removeImage,
  previousPath,
}) {
  let uploadedPath = null;
  try {
    if (newImage)
      uploadedPath = await uploadProductImage(
        businessId,
        newImage.blob,
        newImage.ext,
      );
    const image_path = newImage
      ? uploadedPath
      : removeImage
        ? null
        : (previousPath ?? null);
    const payload = { ...fields, image_path };

    const request = id
      ? supabase
          .from("products")
          .update(payload)
          .eq("id", id)
          .eq("business_id", businessId)
          .is("deleted_at", null)
      : supabase
          .from("products")
          .insert({ ...payload, business_id: businessId });
    const { data, error } = await request.select("id").single();
    if (error) throw error;

    if (previousPath && previousPath !== image_path) {
      await deleteProductImage(previousPath).catch(() => {}); // best effort
    }
    return data.id;
  } catch (err) {
    if (uploadedPath) await deleteProductImage(uploadedPath).catch(() => {});
    throw err;
  }
}

export function productError(err) {
  if (err?.code === "23505") {
    return (err.message || "").includes("sku")
      ? "Another product already uses this SKU."
      : "A product with these details already exists.";
  }
  if (err?.code === "42501" || /row-level security/i.test(err?.message || "")) {
    return "You do not have permission to do that.";
  }
  return err?.message || "Could not save the product. Please try again.";
}

export function getProductUsage(businessId, productId) {
  return supabase.rpc("product_usage", {
    p_business_id: businessId,
    p_product_id: productId,
  });
}

// Returns { data: { result: 'deleted' | 'archived' } } or { error }.
// An unused product is erased, so its image file is removed too. A product with history keeps its image.
export async function deleteProduct(businessId, productId) {
  const { data, error } = await supabase.rpc("delete_product", {
    p_business_id: businessId,
    p_product_id: productId,
  });
  if (error) return { error };
  if (data.result === "deleted" && data.image_path) {
    await deleteProductImage(data.image_path).catch(() => {}); // best effort
  }
  return { data };
}

export function deleteError(err) {
  if (err?.code === "42501")
    return "Only the business owner can delete products.";
  if (err?.code === "P0002") return "This product no longer exists.";
  if (err?.code === "23503")
    return "This product was just used in a sale or stock change. Reload the page and try again.";
  return err?.message || "Could not delete the product. Please try again.";
}
