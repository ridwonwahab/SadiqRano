import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AuthErrorPage() {
  return (
    <main className="checkout-page">
      <div className="announcement"><span>Official Rano Rice mega distributor</span><span className="announcement-dot">✦</span><span>Kwanar Dawaki, Kano State</span></div>
      <section className="checkout-wrap">
        <div className="success-card">
          <span className="eyebrow">SIGN-IN NOT COMPLETED</span>
          <h1>Please try<br /><em>again.</em></h1>
          <p>Google sign-in could not be completed. Check that Google is enabled in Supabase and that your callback URLs are configured correctly.</p>
          <Link href="/" className="button button-brown"><ArrowLeft size={16} /> Back to the shop</Link>
        </div>
      </section>
    </main>
  );
}
