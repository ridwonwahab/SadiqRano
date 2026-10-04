"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Check, MapPin, Minus, Plus, ShoppingBag, Wheat } from "lucide-react";
import AuthButton from "@/components/auth-button";
import { CART_STORAGE_KEY, parseCart, type CartLine } from "@/lib/cart";
import { mergeAndSaveUserCart, saveUserCartLine } from "@/lib/cart-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Product = {
  id: string;
  name: string;
  description: string;
  size_kg: number;
  price_ngn: number;
  is_sample: boolean;
};

const naira = (amount: number) =>
  `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount)}`;

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      setCart(parseCart(window.localStorage.getItem(CART_STORAGE_KEY)));
    } catch {
      setNotice("Your saved cart could not be loaded.");
    }

    let active = true;
    try {
      const supabase = getSupabaseBrowserClient();
      const guestCart = parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
      void supabase.auth.getUser().then(async ({ data, error }) => {
        if (!active) return;
        if (error && error.name !== "AuthSessionMissingError") {
          setNotice(`Could not verify your sign-in: ${error.message}`);
          setCart(guestCart);
          setCartLoading(false);
          return;
        }
        if (!data.user) {
          setCart(guestCart);
          setCartLoading(false);
          return;
        }
        try {
          const mergedCart = await mergeAndSaveUserCart(supabase, data.user.id, guestCart);
          if (!active) return;
          setUserId(data.user.id);
          setCart(mergedCart);
          try {
            window.localStorage.removeItem(CART_STORAGE_KEY);
          } catch {
            setNotice("Your cart was synced, but this browser could not clear its temporary cart copy.");
          }
        } catch (error) {
          if (active) {
            setNotice(error instanceof Error ? error.message : "Could not load your saved cart.");
            setCart(guestCart);
          }
        } finally {
          if (active) setCartLoading(false);
        }
      }).catch((error: unknown) => {
        if (!active) return;
        setNotice(error instanceof Error ? error.message : "Could not load your saved cart.");
        setCartLoading(false);
      });
      void supabase
        .from("products")
        .select("id,name,description,size_kg,price_ngn,is_sample")
        .eq("active", true)
        .order("size_kg")
        .then(({ data, error }) => {
          if (!active) return;
          if (error) setLoadError(`Could not load the rice catalog: ${error.message}`);
          else setProducts(data ?? []);
        });
      const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          setUserId(null);
          setCart(parseCart(window.localStorage.getItem(CART_STORAGE_KEY)));
        }
      });
      return () => {
        active = false;
        authListener.subscription.unsubscribe();
      };
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Supabase is not configured.");
      setCartLoading(false);
    }
  }, []);

  function updateQuantity(productId: string, delta: number) {
    const nextCart = [...cart];
    const index = nextCart.findIndex((line) => line.productId === productId);
    if (index >= 0 && delta > 0 && nextCart[index].quantity >= 99) {
      setNotice("You can add up to 99 bags of each size per order.");
      return;
    }
    if (index < 0 && delta > 0) nextCart.push({ productId, quantity: 1 });
    else if (index >= 0) {
      nextCart[index] = { ...nextCart[index], quantity: nextCart[index].quantity + delta };
      if (nextCart[index].quantity < 1) nextCart.splice(index, 1);
    }
    setCart(nextCart);
    try {
      if (userId) {
        const quantity = nextCart.find((line) => line.productId === productId)?.quantity ?? 0;
        void saveUserCartLine(getSupabaseBrowserClient(), userId, { productId, quantity }).catch((error) => {
          setNotice(error instanceof Error ? error.message : "Your cart could not be saved.");
        });
      } else {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
      }
      setNotice("");
    } catch {
      setNotice("Your cart could not be saved on this device.");
    }
  }

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <main>
      <div className="announcement">
        <span>Official Rano Rice mega distributor</span>
        <span className="announcement-dot">✦</span>
        <span>Kwanar Dawaki, Kano State</span>
      </div>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Sadiq Rano Rice home">
          <span className="brand-mark"><Wheat size={24} strokeWidth={1.8} /></span>
          <span><strong>SADIQ RANO</strong><small>RICE · MEGA DISTRIBUTOR</small></span>
        </Link>
        <nav className="header-actions" aria-label="Main navigation">
          <a className="nav-link" href="#our-rice">Our rice</a>
          <a className="nav-link" href="#visit">Visit us</a>
          <AuthButton />
          <Link className="cart-link" href="/checkout">
            <ShoppingBag size={17} aria-hidden="true" />
            <span>Cart</span><b>{cartCount}</b>
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow"><span className="eyebrow-line" /> GOOD FOOD STARTS HERE</span>
          <h1>Make every<br />meal <em>matter.</em></h1>
          <p>Bring home the goodness of Rano Rice. Shop quality rice direct from your trusted mega distributor in Kano.</p>
          <a className="button button-gold" href="#our-rice">Shop Rano Rice <ArrowRight size={17} /></a>
          <div className="hero-proof"><span><Check size={15} /> Official mega distributor</span><span><Check size={15} /> Pick up in Kano</span></div>
        </div>
        <div className="hero-art" aria-label="A bowl of rice surrounded by golden rice grains">
          <div className="sun-disc" />
          <div className="rice-stalk stalk-one">✳</div><div className="rice-stalk stalk-two">✳</div>
          <div className="rice-plate"><div className="rice-pile">✦ ✦ ✦<br />✦ ✦ ✦ ✦<br />✦ ✦ ✦</div></div>
          <div className="art-caption"><span>THE GOODNESS<br />OF RANO</span><span>01 / 01</span></div>
          <div className="art-seal"><Wheat size={20} /><small>GOODNESS<br />IN EVERY GRAIN</small></div>
        </div>
        <a className="scroll-cue" href="#our-rice"><ArrowDown size={16} /> SCROLL TO DISCOVER</a>
      </section>

      <section className="benefits" aria-label="Shop highlights">
        <div><span className="benefit-number">01</span><span><strong>Rano Rice, direct</strong><small>Your local mega distributor</small></span></div>
        <div><span className="benefit-number">02</span><span><strong>Sizes for every home</strong><small>Choose your preferred bag size</small></span></div>
        <div><span className="benefit-number">03</span><span><strong>Easy shop pickup</strong><small>Pay by cash or transfer in store</small></span></div>
      </section>

      <section className="products-section" id="our-rice">
        <div className="section-heading">
          <div><span className="eyebrow"><span className="eyebrow-line" /> FROM OUR STORE</span><h2>Good rice.<br /><em>Good living.</em></h2></div>
          <p>Find the Rano Rice size that fits your table. Place an order online, then pay when you pick it up from our shop.</p>
        </div>
        {notice && <p className="inline-notice" role="status">{notice}</p>}
        {loadError ? (
          <div className="empty-state" role="alert">{loadError}<p>Check your Supabase settings and run the included database setup script.</p></div>
        ) : products.length === 0 ? (
          <div className="empty-state">Our catalog is getting ready. Add active Rano Rice products in your Supabase database to display them here.</div>
        ) : (
          <div className="product-grid">
            {products.map((product, index) => {
              const quantity = cart.find((line) => line.productId === product.id)?.quantity ?? 0;
              return (
                <article className="product-card" key={product.id}>
                  <div className={`product-visual product-visual-${index % 4}`}>
                    <span className="product-grain">R</span>
                    <span className="bag-tag">RANO<br />RICE</span>
                    <span className="bag-size">{product.size_kg} <small>KG</small></span>
                    <span className="bag-base" />
                  </div>
                  <div className="product-details">
                    <div className="product-name-line"><div><h3>{product.name}</h3><span>{product.size_kg} kg bag</span></div><strong>{naira(product.price_ngn)}</strong></div>
                    <p>{product.description}</p>
                    {product.is_sample && <span className="sample-label">Sample price — edit in Supabase before selling</span>}
                    <div className="product-action">
                      {quantity > 0 ? (
                        <div className="quantity-control" aria-label={`Quantity of ${product.name}`}>
                          <button disabled={cartLoading || quantity >= 99} onClick={() => updateQuantity(product.id, -1)} aria-label="Remove one"><Minus size={15} /></button>
                          <span>{quantity} in cart</span>
                          <button disabled={cartLoading || quantity >= 99} onClick={() => updateQuantity(product.id, 1)} aria-label="Add one"><Plus size={15} /></button>
                        </div>
                      ) : (
                        <button className="add-button" disabled={cartLoading} onClick={() => updateQuantity(product.id, 1)}>Add to cart <Plus size={16} /></button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="catalog-note"><span>Need a bulk quantity?</span> Visit us in Kwanar Dawaki or contact our shop to discuss your order.</div>
      </section>

      <section className="visit-section" id="visit">
        <div className="visit-icon"><MapPin size={25} /></div>
        <div><span className="eyebrow">COME SAY HELLO</span><h2>Your Rano Rice shop<br /><em>is right here.</em></h2><p>Kano State, Kwanar Dawaki</p></div>
        <Link href="/checkout" className="button button-brown">Review your cart <ArrowRight size={17} /></Link>
      </section>
      <footer className="site-footer"><Link href="/" className="footer-brand">SADIQ RANO RICE</Link><span>Official Rano Rice mega distributor</span><span>© {new Date().getFullYear()} Sadiq Rano Rice · Kano State</span></footer>
    </main>
  );
}
