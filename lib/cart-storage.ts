import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartLine } from "@/lib/cart";

export async function loadUserCart(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id,quantity")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load your saved cart: ${error.message}`);

  return (data ?? []).map((line) => ({
    productId: line.product_id,
    quantity: line.quantity,
  })) satisfies CartLine[];
}

export async function saveUserCartLine(
  supabase: SupabaseClient,
  userId: string,
  line: CartLine,
) {
  const result = line.quantity === 0
    ? await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", line.productId)
    : await supabase.from("cart_items").upsert(
        {
          user_id: userId,
          product_id: line.productId,
          quantity: line.quantity,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,product_id" },
      );
  if (result.error) throw new Error(`Could not save your cart: ${result.error.message}`);
}

export async function mergeAndSaveUserCart(
  supabase: SupabaseClient,
  userId: string,
  guestCart: CartLine[],
) {
  const savedCart = await loadUserCart(supabase, userId);
  const quantities = new Map(savedCart.map(({ productId, quantity }) => [productId, quantity]));
  for (const line of guestCart) {
    quantities.set(line.productId, Math.min(99, (quantities.get(line.productId) ?? 0) + line.quantity));
  }

  const mergedCart = Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
  if (mergedCart.length > 0) {
    const { error } = await supabase.from("cart_items").upsert(
      mergedCart.map((line) => ({
        user_id: userId,
        product_id: line.productId,
        quantity: line.quantity,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,product_id" },
    );
    if (error) throw new Error(`Could not save your cart: ${error.message}`);
  }

  return mergedCart;
}
