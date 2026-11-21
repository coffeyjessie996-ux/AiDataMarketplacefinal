export default function ServiceCheckoutSuccessPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1220', color: '#e5edf8' }}>
      <section style={{ maxWidth: 620, width: '100%', padding: 28, borderRadius: 14, border: '1px solid #334155', background: '#101a2b' }}>
        <p style={{ color: '#86efac', fontWeight: 800, letterSpacing: 1 }}>CHECKOUT RETURNED</p>
        <h1 style={{ fontSize: 30, margin: '8px 0 14px' }}>Thank you.</h1>
        <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>Stripe has returned you to the marketplace. The payment is not marked complete on this page; our server records it only after verifying Stripe’s signed payment notification. Your service provider should confirm the agreed scope and delivery details before work begins.</p>
        <p style={{ color: '#93a4bd', fontSize: 13, lineHeight: 1.6 }}>If your payment is still processing, please allow a short time for confirmation. You can close this page after checkout.</p>
        <a href="/" style={{ display: 'inline-block', marginTop: 12, color: '#93c5fd' }}>Return to marketplace</a>
      </section>
    </main>
  );
}
