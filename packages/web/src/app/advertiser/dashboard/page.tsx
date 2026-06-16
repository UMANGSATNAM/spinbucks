"use client";

import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Megaphone, Wallet, Plus, Trophy, LogOut } from "lucide-react";

export default function AdvertiserDashboard() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Campaign Form
  const [adLine, setAdLine] = useState("");
  const [destUrl, setDestUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [bidCpm, setBidCpm] = useState("100");
  const [budget, setBudget] = useState("10000");

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_URL}/leaderboard`);
      if (res.ok) {
        setLeaderboard(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_URL}/advertisers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      if (!res.ok) throw new Error("Failed to authenticate.");
      const data = await res.json();
      setApiKey(data.apiKey);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_URL}/campaigns`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-advertiser-key": apiKey
        },
        body: JSON.stringify({ 
          adLine, 
          destinationUrl: destUrl, 
          brandName, 
          bidCpm: Number(bidCpm), 
          dailyBudget: Number(budget) 
        }),
      });
      if (!res.ok) throw new Error("Failed to create campaign. Check your balance or inputs.");
      
      // Reset form
      setAdLine(""); setDestUrl(""); setBrandName(""); setBidCpm("100"); setBudget("10000");
      await fetchLeaderboard();
      alert("Campaign created successfully!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_URL}/advertiser/topup`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-advertiser-key": apiKey
        },
        body: JSON.stringify({ amountInr: 5000, provider: "stripe" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Top-up simulated (No payment keys configured)");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[100px]" />
        
        <Card className="w-full max-w-md relative z-10 bg-zinc-900/60 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-zinc-100 flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-rose-400" />
              Advertiser Login
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Enter your details to access or create your ad account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-300">Brand / Company Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="bg-zinc-950/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-rose-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="bg-zinc-950/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-rose-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button disabled={loading || !email || !name} type="submit" className="w-full bg-rose-600 hover:bg-rose-700 text-white">
                {loading ? "Authenticating..." : "Access Dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between py-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Advertiser Dashboard</h1>
              <p className="text-sm text-zinc-400">{name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={handleTopup} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Wallet className="w-4 h-4 mr-2" /> Top-up Balance
            </Button>
            <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={() => setApiKey("")}>
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Campaign */}
          <Card className="bg-zinc-900/40 border-zinc-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-400" />
                New Campaign
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCampaign} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Brand Name</Label>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Linear" className="bg-zinc-950/50 border-zinc-800" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Ad Copy (max 60 chars)</Label>
                  <Input value={adLine} onChange={(e) => setAdLine(e.target.value)} maxLength={60} placeholder="Try Linear — issue tracking built for speed" className="bg-zinc-950/50 border-zinc-800" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Destination URL</Label>
                  <Input type="url" value={destUrl} onChange={(e) => setDestUrl(e.target.value)} placeholder="https://linear.app" className="bg-zinc-950/50 border-zinc-800" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Bid CPM (INR)</Label>
                    <Input type="number" min="1" value={bidCpm} onChange={(e) => setBidCpm(e.target.value)} className="bg-zinc-950/50 border-zinc-800" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Daily Budget (INR)</Label>
                    <Input type="number" min="10" value={budget} onChange={(e) => setBudget(e.target.value)} className="bg-zinc-950/50 border-zinc-800" required />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <Button disabled={loading} type="submit" className="w-full bg-rose-600 hover:bg-rose-700 text-white mt-4">
                  {loading ? "Launching..." : "Launch Campaign"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card className="bg-zinc-900/40 border-zinc-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Live Auction Leaderboard
              </CardTitle>
              <CardDescription className="text-zinc-400">Current top bidding campaigns globally</CardDescription>
            </CardHeader>
            <CardContent>
              {leaderboard.length > 0 ? (
                <div className="space-y-3">
                  {leaderboard.map((camp, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-zinc-950/50 border border-zinc-800">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
                          #{i + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-200">{camp.brand_name}</p>
                          <p className="text-xs text-zinc-500">{camp.impressions} impressions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-zinc-300">₹{camp.bid_cpm}</p>
                        <p className="text-xs text-zinc-500">CPM</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-500">
                  No active campaigns yet. Be the first!
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
