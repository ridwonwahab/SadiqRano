export type CartLine = {
  productId: string;
  quantity: number;
};

export const CART_STORAGE_KEY = "sadiq-rano-rice-cart";

export function parseCart(value: string | null): CartLine[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        line !== null &&
        typeof line === "object" &&
        typeof line.productId === "string" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        line.quantity <= 99,
    );
  } catch {
    return [];
  }
}
