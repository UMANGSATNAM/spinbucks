import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code, Megaphone, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      {/* Hero Section */}
      <main className="flex-1 relative">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/20 rounded-full blur-[120px]" />
        </div>
        
        <div className="relative z-10 container mx-auto px-6 pt-32 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/50 border border-zinc-800 text-sm font-medium text-zinc-300 mb-8 shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-md">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span>Monetize your AI coding time</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 via-indigo-100 to-zinc-400">
            Earn while your <br /> agent thinks.
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12">
            SpinAds turns the idle waiting time of AI coding agents into a revenue stream for developers, and a high-attention advertising channel for brands.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/developer/dashboard">
              <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all">
                I'm a Developer
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/advertiser/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 rounded-xl border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 backdrop-blur-md transition-all">
                I'm an Advertiser
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Split */}
        <div className="relative z-10 container mx-auto px-6 py-24 border-t border-zinc-900">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-24">
            <div className="group p-8 rounded-3xl bg-zinc-900/30 border border-zinc-800/50 backdrop-blur-sm hover:bg-zinc-900/50 transition-all duration-500">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                <Code className="w-7 h-7 text-indigo-400" />
              </div>
              <h3 className="text-3xl font-bold mb-4 text-zinc-100">For Developers</h3>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                Install our VS Code extension. Whenever you trigger an AI agent, we show a small, non-intrusive sponsored message. You earn 60% of the ad revenue for every impression and click.
              </p>
              <ul className="space-y-3 text-zinc-300 mb-8">
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Seamless VS Code integration
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Zero impact on performance
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Fast payouts via Stripe or Razorpay
                </li>
              </ul>
              <Link href="/developer/dashboard">
                <span className="inline-flex items-center text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  View Developer Dashboard <ArrowRight className="ml-2 w-4 h-4" />
                </span>
              </Link>
            </div>

            <div className="group p-8 rounded-3xl bg-zinc-900/30 border border-zinc-800/50 backdrop-blur-sm hover:bg-zinc-900/50 transition-all duration-500">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-6 border border-rose-500/20 group-hover:scale-110 transition-transform">
                <Megaphone className="w-7 h-7 text-rose-400" />
              </div>
              <h3 className="text-3xl font-bold mb-4 text-zinc-100">For Advertisers</h3>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                Reach a highly captive audience of engineers exactly when they are waiting for their agents. No ad-blockers, 100% viewability, and completely measurable performance.
              </p>
              <ul className="space-y-3 text-zinc-300 mb-8">
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Reach top-tier software engineers
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Pay-per-impression (CPM) bidding
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Detailed performance analytics
                </li>
              </ul>
              <Link href="/advertiser/dashboard">
                <span className="inline-flex items-center text-rose-400 hover:text-rose-300 font-medium transition-colors">
                  View Advertiser Dashboard <ArrowRight className="ml-2 w-4 h-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-8 border-t border-zinc-900 text-center text-zinc-500 text-sm">
        <p>© 2026 SpinAds Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
