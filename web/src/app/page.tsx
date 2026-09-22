import { ShoppingBasket } from "lucide-react";

import { OrderCalculator } from "@/features/order/OrderCalculator";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to calculator
      </a>
      <main
        className="mx-auto min-h-dvh w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12"
        id="main-content"
        tabIndex={-1}
      >
        <header className="mb-8 max-w-2xl lg:mb-10">
          <div className="bg-primary text-primary-foreground mb-4 flex size-12 items-center justify-center rounded-[var(--radius-md)]">
            <ShoppingBasket aria-hidden="true" size={25} strokeWidth={1.75} />
          </div>
          <p className="text-primary mb-2 font-mono text-sm font-semibold tracking-[0.14em] uppercase">
            Food Store · Order Desk
          </p>
          <h1 className="text-3xl leading-9 font-bold tracking-[-0.025em] sm:text-4xl sm:leading-10">
            Food Store Calculator
          </h1>
          <p className="text-muted-foreground mt-3 text-base leading-6">
            Build an Order Draft below. Calculate &amp; Place Order creates an
            accepted Order and returns the API&apos;s authoritative Pricing
            Breakdown.
          </p>
        </header>
        <OrderCalculator />
      </main>
    </>
  );
}
