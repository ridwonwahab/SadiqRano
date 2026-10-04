"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Minus, Plus, ShoppingBag, Wheat } from "lucide-react";
import AuthButton from "@/components/auth-button";
import { CART_STORAGE_KEY, parseCart, type CartLine } from "@/lib/cart";
import { mergeAndSaveUserCart, saveUserCartLine } from "@/lib/cart-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Product = {
  id: string;
  name: string;
  size_kg: number;
  price_ngn: number;
  is_sample: boolean;
};

const naira = (amount: number) =>
  `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount)}`;

export default function Checkout() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; emailSent: boolean } | null>(null);

  useEffect(() => {
    try {
      const guestCart = parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
      setCart(guestCart);
      const supabase = getSupabaseBrowserClient();
      void Promise.all([
        supabase.auth.getUser(),
        supabase.from("products").select("id,name,size_kg,price_ngn,is_sample").eq("active", true),
      ]).then(async ([authResult, productsResult]) => {
        if (authResult.error) setError(authResult.error.message);
        setEmail(authResult.data.user?.email ?? "");
        const displayName = authResult.data.user?.user_metadata?.full_name;
        setName(typeof displayName === "string" ? displayName : "");
        if (authResult.data.user) {
          setUserId(authResult.data.user.id);
          try {
            const savedCart = await mergeAndSaveUserCart(supabase, authResult.data.user.id, guestCart);
            setCart(savedCart);
            try {
              window.localStorage.removeItem(CART_STORAGE_KEY);
            } catch {
              setError("Your cart was synced, but this browser could not clear its temporary cart copy.");
            }
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load your saved cart.");
          }
        }
        if (productsResult.error) setError(`Could not load order prices: ${productsResult.error.message}`);
        else setProducts(productsResult.data ?? []);
        setLoading(false);
      }).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not load checkout.");
        setLoading(false);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load checkout.");
      setLoading(false);
    }
  }, []);

  const orderedProducts = cart
    .map((line) => ({ ...line, product: products.find((product) => product.id === line.productId) }))
    .filter((line): line is CartLine & { product: Product } => Boolean(line.product));
  const total = orderedProducts.reduce((sum, line) => sum + line.product.price_ngn * line.quantity, 0);
  const hasSamplePrice = orderedProducts.some((line) => line.product.is_sample);

  function updateQuantity(productId: string, delta: number) {
    if (delta > 0 && (cart.find((line) => line.productId === productId)?.quantity ?? 0) >= 99) {
      setError("You can add up to 99 bags of each size per order.");
      return;
    }
    const nextCart = cart
      .map((line) => line.productId === productId ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0);
    setCart(nextCart);
    setError("");
    if (userId) {
      const quantity = nextCart.find((line) => line.productId === productId)?.quantity ?? 0;
      void saveUserCartLine(getSupabaseBrowserClient(), userId, { productId, quantity }).catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Your cart could not be saved.");
      });
    } else {
      try {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
      } catch {
        setError("Your cart could not be saved on this device.");
      }
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          paymentMethod,
          items: orderedProducts.map(({ productId, quantity }) => ({ productId, quantity })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your order could not be submitted.");
      setSuccess({ id: result.order.id, emailSent: result.emailSent });
      setCart([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your order could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="checkout-page">
      <div className="announcement"><span>Official Rano Rice mega distributor</span><span className="announcement-dot">✦</span><span>Kwanar Dawaki, Kano State</span></div>
      <header className="site-header">
        <Link href="/" className="brand"><span className="brand-mark"><Wheat size={24} /></span><span><strong>SADIQ RANO</strong><small>RICE · MEGA DISTRIBUTOR</small></span></Link>
        <nav className="header-actions" aria-label="Main navigation"><Link className="nav-link" href="/">Continue shopping</Link><AuthButton /></nav>
      </header>

      <section className="checkout-wrap">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Back to shop</Link>
        {success ? (
          <div className="success-card">
            <span className="success-icon"><CheckCircle2 size={34} /></span>
            <span className="eyebrow">ORDER RECEIVED</span>
            <h1>Thank you for<br /><em>your order.</em></h1>
            <p>Your order <strong>{success.id}</strong> is saved. Pay by {paymentMethod === "cash" ? "cash" : "bank transfer"} when you collect it at our shop in Kwanar Dawaki.</p>
            <div className={`email-status ${success.emailSent ? "email-ok" : "email-pending"}`}>
              {success.emailSent ? `Confirmation sent to ${email}.` : "Your order is saved, but the email confirmation could not be sent. Please keep your order reference."}
            </div>
            <Link href="/" className="button button-brown">Back to the shop <ArrowRight size={17} /></Link>
          </div>
        ) : (
          <>
            <div className="checkout-title"><span className="eyebrow"><span className="eyebrow-line" /> YOUR RANO RICE ORDER</span><h1>Almost <em>yours.</em></h1><p>Place your order now and pay at the shop when you collect it.</p></div>
            {loading ? <div className="empty-state">Loading your cart…</div> : (
              <div className="checkout-grid">
                <form className="checkout-form" onSubmit={submitOrder}>
                  <section className="form-section">
                    <span className="form-step">01</span><div><h2>Your details</h2><p>Sign in with Google to place your order.</p></div>
                    <div className="form-field"><label htmlFor="customer-name">Name</label><input id="customer-name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></div>
                    <div className="form-field"><label htmlFor="customer-email">Email for confirmation</label><input id="customer-email" type="email" value={email} readOnly aria-readonly="true" /></div>
                    {!email && <div className="signin-prompt"><p>Sign in with Google to continue checkout.</p><AuthButton /></div>}
                    <div className="form-field"><label htmlFor="customer-phone">Phone number</label><input id="customer-phone" type="tel" autoComplete="tel" required minLength={6} maxLength={30} placeholder="e.g. 080 1234 5678" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
                  </section>
                  <section className="form-section payment-section">
                    <span className="form-step">02</span><div><h2>Pay at the shop</h2><p>Choose how you’d like to pay when you collect your order.</p></div>
                    <div className="payment-options">
                      <label className={`payment-option ${paymentMethod === "cash" ? "selected" : ""}`}><input type="radio" name="payment" value="cash" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} /><span><strong>Cash</strong><small>Pay in person at collection</small></span></label>
                      <label className={`payment-option ${paymentMethod === "transfer" ? "selected" : ""}`}><input type="radio" name="payment" value="transfer" checked={paymentMethod === "transfer"} onChange={() => setPaymentMethod("transfer")} /><span><strong>Bank transfer</strong><small>Transfer when you visit the shop</small></span></label>
                    </div>
                  </section>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className="button button-gold submit-order" type="submit" disabled={submitting || !email || orderedProducts.length === 0 || hasSamplePrice}>
                    {submitting ? "Placing your order…" : "Place order"} <ArrowRight size={17} />
                  </button>
                  {hasSamplePrice && <p className="sample-warning">Checkout is disabled while sample prices are active. Update the catalog prices and turn off “is sample” in Supabase to accept orders.</p>}
                </form>
                <aside className="order-summary">
                  <h2><ShoppingBag size={18} /> Your order</h2>
                  {orderedProducts.length === 0 ? (
                    <div className="summary-empty"><p>Your cart is empty.</p><Link href="/">Browse Rano Rice <ArrowRight size={14} /></Link></div>
                  ) : (
                    <>
                      {orderedProducts.map(({ product, productId, quantity }) => (
                        <div className="summary-item" key={productId}>
                          <div className="summary-bag">R<span>{product.size_kg}kg</span></div>
                          <div className="summary-name"><strong>{product.name}</strong><small>{naira(product.price_ngn)} each</small>
                            {product.is_sample && <small className="sample-inline">Sample price</small>}
                            <div className="quantity-control summary-quantity"><button type="button" onClick={() => updateQuantity(productId, -1)} aria-label="Remove one"><Minus size={13} /></button><span>{quantity}</span><button type="button" disabled={quantity >= 99} onClick={() => updateQuantity(productId, 1)} aria-label="Add one"><Plus size={13} /></button></div>
                          </div><strong className="summary-line-total">{naira(product.price_ngn * quantity)}</strong>
                        </div>
                      ))}
                      <div className="summary-total"><span>Total due at collection</span><strong>{naira(total)}</strong></div>
                      <p className="summary-pickup">Pickup at Kano State, Kwanar Dawaki</p>
                      {hasSamplePrice && <p className="sample-warning">Sample prices are for setup only. Confirm current pricing with the shop before placing a real order.</p>}
                    </>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
      </section>
      <footer className="site-footer"><Link href="/" className="footer-brand">SADIQ RANO RICE</Link><span>Official Rano Rice mega distributor</span><span>© {new Date().getFullYear()} Sadiq Rano Rice · Kano State</span></footer>
    </main>
  );
}
