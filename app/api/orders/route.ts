import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type OrderRequest = {
  customerName?: unknown;
  customerPhone?: unknown;
  paymentMethod?: unknown;
  items?: unknown;
};

type PlacedOrder = {
  id: string;
  total_ngn: number;
  items: { name: string; quantity: number; unit_price_ngn: number }[];
};

function isPlacedOrder(value: unknown): value is PlacedOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.id === "string" &&
    typeof order.total_ngn === "number" &&
    Array.isArray(order.items) &&
    order.items.every(
      (item) =>
        item &&
        typeof item.name === "string" &&
        typeof item.quantity === "number" &&
        typeof item.unit_price_ngn === "number",
    )
  );
}

function isValidItems(value: unknown): value is { productId: string; quantity: number }[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 30 &&
    value.every(
      (item) =>
        item &&
        typeof item.productId === "string" &&
        /^[0-9a-f-]{36}$/i.test(item.productId) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 99,
    )
  );
}

export async function POST(request: Request) {
  let payload: OrderRequest;
  try {
    payload = (await request.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ error: "Please submit a valid order." }, { status: 400 });
  }

  if (
    typeof payload.customerName !== "string" ||
    payload.customerName.trim().length < 2 ||
    payload.customerName.trim().length > 100 ||
    typeof payload.customerPhone !== "string" ||
    payload.customerPhone.trim().length < 6 ||
    payload.customerPhone.trim().length > 30 ||
    (payload.paymentMethod !== "cash" && payload.paymentMethod !== "transfer") ||
    !isValidItems(payload.items)
  ) {
    return NextResponse.json({ error: "Check your contact details and cart, then try again." }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: "Sign in with Google before placing an order." }, { status: 401 });
    }

    const { data: order, error: orderError } = await supabase.rpc("place_order", {
      p_customer_name: payload.customerName.trim(),
      p_customer_email: user.email,
      p_customer_phone: payload.customerPhone.trim(),
      p_payment_method: payload.paymentMethod,
      p_items: payload.items,
    });
    if (orderError) {
      console.error("Order creation failed:", orderError.message);
      return NextResponse.json({ error: "We could not save your order. Please try again." }, { status: 400 });
    }
    if (!isPlacedOrder(order)) {
      console.error("Order creation returned an invalid result.");
      return NextResponse.json({ error: "We could not confirm your order. Please contact the shop." }, { status: 500 });
    }

    const mailgunApiKey = process.env.MAILGUN_API_KEY;
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunFrom = process.env.MAILGUN_FROM;
    if (!mailgunApiKey || !mailgunDomain || !mailgunFrom) {
      console.error("Order saved, but Mailgun is not fully configured.");
      return NextResponse.json({ order, emailSent: false }, { status: 201 });
    }

    const lines = order.items
      .map(
        (item) =>
          `${item.quantity} x ${item.name} — ${new Intl.NumberFormat("en-NG").format(item.unit_price_ngn * item.quantity)} NGN`,
      )
      .join("\n");
    const body = [
      `Hello ${payload.customerName.trim()},`,
      "",
      `Thank you for your order from SADIQ RANO RICE. Your order reference is ${order.id}.`,
      "",
      "Order:",
      lines,
      "",
      `Total: ${new Intl.NumberFormat("en-NG").format(order.total_ngn)} NGN`,
      `Payment: ${payload.paymentMethod === "cash" ? "Cash" : "Bank transfer"} at the shop`,
      "Collection: Pick up at Kano State, Kwanar Dawaki.",
      "",
      "We look forward to serving you.",
      "SADIQ RANO RICE",
    ].join("\n");
    const form = new URLSearchParams({
      from: mailgunFrom,
      to: user.email,
      subject: `Order confirmation ${order.id} — SADIQ RANO RICE`,
      text: body,
    });
    const apiBase = (process.env.MAILGUN_API_BASE || "https://api.mailgun.net").replace(/\/+$/, "");
    try {
      const mailResponse = await fetch(`${apiBase}/v3/${encodeURIComponent(mailgunDomain)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        cache: "no-store",
      });
      if (!mailResponse.ok) {
        const details = await mailResponse.text();
        console.error("Mailgun rejected the order confirmation:", mailResponse.status, details);
        return NextResponse.json({ order, emailSent: false }, { status: 201 });
      }
    } catch (error) {
      console.error("Mailgun request failed after the order was saved:", error);
      return NextResponse.json({ order, emailSent: false }, { status: 201 });
    }

    return NextResponse.json({ order, emailSent: true }, { status: 201 });
  } catch (error) {
    console.error("Order endpoint failed:", error);
    return NextResponse.json({ error: "The order service is temporarily unavailable." }, { status: 500 });
  }
}
