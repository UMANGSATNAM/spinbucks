"use client";

import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Activity, CreditCard, Laptop, LogOut } from "lucide-react";

export default function DeveloperDashboard() {
  const [deviceId, setDeviceId] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [data, setData] = useState<{ earningsMicros: number; payouts: any[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Automatically login if deviceId is provided in URL
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get("deviceId");
    if (idFromUrl) {
      setDeviceId(idFromUrl);
      fetchEarnings(idFromUrl);
    }
  }, []);

  const fetchEarnings = async (devId: string) => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_URL}/developer/earnings?deviceId=${devId}`);
      if (!res.ok) {
        throw new Error("Device not found or error fetching data.");
      }
      const json = await res.json();
      setData(json);
      setIsLoggedIn(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId) return;
    fetchEarnings(deviceId);
  };

  const handlePayout = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/developer/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) throw new Error("Failed to request payout");
      await fetchEarnings(deviceId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px]" />
        
        <Card className="w-full max-w-md relative z-10 bg-zinc-900/60 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-zinc-100 flex items-center gap-2">
              <Laptop className="w-6 h-6 text-indigo-400" />
              Developer Login
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Enter your VS Code Device ID to view earnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="deviceId" className="text-zinc-300">Device ID</Label>
                <Input
                  id="deviceId"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="e.g. machine-A"
                  className="bg-zinc-950/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-indigo-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button disabled={loading || !deviceId} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                {loading ? "Loading..." : "Access Dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const earningsInr = ((data?.earningsMicros || 0) / 1_000_000).toFixed(2);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between py-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Laptop className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Developer Dashboard</h1>
              <p className="text-sm text-zinc-400">{deviceId}</p>
            </div>
          </div>
          <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={() => setIsLoggedIn(false)}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-zinc-900/40 border-zinc-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-200 to-emerald-500">
                  ₹{earningsInr}
                </span>
                <span className="text-zinc-500 pb-2 font-medium">INR</span>
              </div>
              <Button 
                onClick={handlePayout} 
                disabled={loading || (data?.earningsMicros || 0) < 100_000_000} // Minimum ₹100 to payout
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Request Payout
              </Button>
              <p className="text-xs text-zinc-500 mt-2 text-center">Minimum payout: ₹100</p>
              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                Payout History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.payouts && data.payouts.length > 0 ? (
                <div className="space-y-4">
                  {data.payouts.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-zinc-950/50 border border-zinc-800">
                      <div>
                        <p className="font-medium text-zinc-200">₹{(p.amount_micros / 1_000_000).toFixed(2)}</p>
                        <p className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        p.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                        p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  No payouts yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
