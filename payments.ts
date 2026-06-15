// Payments — Stripe (global) + Razorpay (India). Code-complete, but the live
// round-trip needs real keys. With no keys set, every call returns
// { configured: false } and the server keeps running. SDKs are imported lazily
// so they're optional until you actually wire payments.

export interface PaymentEnv {
  stripeKey?: string;
  stripeWebhookSecret?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  publicBaseUrl?: string;
}

export function paymentsEnv(): PaymentEnv {
  return {
    stripeKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
  };
}

async function stripe(env: PaymentEnv): Promise<any | null> {
  if (!env.stripeKey) return null;
  try {
    const pkg = "stripe"; // indirect so it stays an optional dependency
    const mod: any = await import(pkg);
    const Stripe = mod.default ?? mod;
    return new Stripe(env.stripeKey);
  } catch {
    return null; // SDK not installed
  }
}

type NotConfigured = { configured: false };
const NOT_CONFIGURED: NotConfigured = { configured: false };

// --- Advertiser top-up (add ad budget) --------------------------------------

/** Stripe Checkout session for global cards. amountInr in whole rupees. */
export async function createStripeTopup(
  env: PaymentEnv, advId: string, amountInr: number,
): Promise<{ url: string } | NotConfigured> {
  const s = await stripe(env);
  if (!s) return NOT_CONFIGURED;
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "inr",
        product_data: { name: "SpinBucks ad credit" },
        unit_amount: amountInr * 100, // paise
      },
      quantity: 1,
    }],
    success_url: `${env.publicBaseUrl ?? ""}/portal/advertiser?topup=success`,
    cancel_url: `${env.publicBaseUrl ?? ""}/portal/advertiser?topup=cancel`,
    metadata: { advId, amountPaise: String(amountInr * 100) },
  });
  return { url: session.url };
}

/** Razorpay order for India top-up. amountInr in whole rupees. */
export async function createRazorpayOrder(
  env: PaymentEnv, advId: string, amountInr: number,
): Promise<{ orderId: string; amount: number; keyId: string } | NotConfigured> {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) return NOT_CONFIGURED;
  try {
    const pkg = "razorpay"; // indirect so it stays an optional dependency
    const mod: any = await import(pkg);
    const Razorpay = mod.default ?? mod;
    const rzp = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
    const order = await rzp.orders.create({ amount: amountInr * 100, currency: "INR", notes: { advId } });
    return { orderId: order.id, amount: order.amount, keyId: env.razorpayKeyId };
  } catch {
    return NOT_CONFIGURED;
  }
}

/** Verify a Stripe webhook and return the credit to apply, or null. */
export async function handleStripeWebhook(
  env: PaymentEnv, rawBody: Buffer, sig: string,
): Promise<{ advId: string; paise: number } | null> {
  const s = await stripe(env);
  if (!s || !env.stripeWebhookSecret) return null;
  let event: any;
  try {
    event = s.webhooks.constructEvent(rawBody, sig, env.stripeWebhookSecret);
  } catch {
    return null; // bad signature
  }
  if (event.type === "checkout.session.completed") {
    const m = event.data.object?.metadata ?? {};
    if (m.advId && m.amountPaise) return { advId: m.advId, paise: Number(m.amountPaise) };
  }
  return null;
}

// --- Developer payout -------------------------------------------------------

/**
 * Pay a developer their balance. Stripe Connect transfer (global) needs a
 * connected account id; RazorpayX (India) needs a fund account / UPI. Both
 * require the developer to have onboarded a payout method first — wire that in
 * production. Until then this returns a reason and the payout stays "pending".
 */
export async function payoutDeveloper(
  env: PaymentEnv,
  opts: { connectedAccountId?: string; amountPaise: number },
): Promise<{ ok: boolean; reason?: string }> {
  if (env.stripeKey && opts.connectedAccountId) {
    const s = await stripe(env);
    if (!s) return { ok: false, reason: "stripe_unavailable" };
    await s.transfers.create({
      amount: opts.amountPaise,
      currency: "inr",
      destination: opts.connectedAccountId,
    });
    return { ok: true };
  }
  // TODO(razorpayx): payout to the developer's fund account / UPI here.
  return { ok: false, reason: "no_payout_method_configured" };
}
