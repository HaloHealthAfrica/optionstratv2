import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle, Shield, Zap, Settings2, Lock, Target } from "lucide-react";
import { useHealth } from "@/hooks/useSystemData";
import { toast } from "sonner";
import { ExitRulesSettings } from "@/components/dashboard/ExitRulesSettings";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

interface AdapterInfo {
  name: string;
  configured_brokers: string[];
}

interface HealthData {
  mode: string;
  live_trading_enabled: boolean;
  adapter?: AdapterInfo;
}

export default function SettingsPage() {
  const { data: health } = useHealth();
  const healthData = health as HealthData | undefined;
  
  const [preferredBroker, setPreferredBroker] = useState<string>("tradier");
  
  const mode = healthData?.mode || "PAPER";
  const liveTradingEnabled = healthData?.live_trading_enabled || false;
  const configuredBrokers = healthData?.adapter?.configured_brokers || [];
  const currentAdapter = healthData?.adapter?.name || "paper";
  
  const handleBrokerChange = (value: string) => {
    setPreferredBroker(value);
    toast.info(`Preferred broker set to ${value}. Update PREFERRED_BROKER secret to persist.`);
  };
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Settings</h1>
            <p className="text-xs text-muted-foreground">
              Configure trading mode, broker connections, and exit rules
            </p>
          </div>
        </div>
        
        <Tabs defaultValue="trading" className="space-y-6">
          <TabsList>
            <TabsTrigger value="trading" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Trading Mode
            </TabsTrigger>
            <TabsTrigger value="brokers" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Brokers
            </TabsTrigger>
            <TabsTrigger value="exit-rules" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Exit Rules
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="trading" className="space-y-6">
            {/* Trading Mode Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Trading Mode
                </CardTitle>
                <CardDescription>
                  Control whether trades execute in paper (simulated) or live mode
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Status */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <p className="font-medium">Current Mode</p>
                    <p className="text-sm text-muted-foreground">
                      {mode === "PAPER" 
                        ? "All trades are simulated with no real money" 
                        : "CAUTION: Trades will execute with real money"}
                    </p>
                  </div>
                  <Badge 
                    variant={mode === "LIVE" ? "destructive" : "outline"} 
                    className="text-lg px-4 py-2"
                  >
                    {mode === "LIVE" ? (
                      <><Zap className="h-4 w-4 mr-2" /> LIVE</>
                    ) : (
                      <><Settings2 className="h-4 w-4 mr-2" /> PAPER</>
                    )}
                  </Badge>
                </div>
                
                {/* Safety Gates */}
                <div className="space-y-4">
                  <h4 className="font-medium">Safety Gates</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-md border">
                      <div className="flex items-center gap-3">
                        {mode === "LIVE" ? (
                          <CheckCircle className="h-5 w-5 text-success" />
                        ) : (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">APP_MODE = LIVE</p>
                          <p className="text-sm text-muted-foreground">Environment flag for live trading</p>
                        </div>
                      </div>
                      <Badge variant={mode === "LIVE" ? "default" : "secondary"}>
                        {mode === "LIVE" ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-md border">
                      <div className="flex items-center gap-3">
                        {liveTradingEnabled ? (
                          <CheckCircle className="h-5 w-5 text-success" />
                        ) : (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">ALLOW_LIVE_EXECUTION = true</p>
                          <p className="text-sm text-muted-foreground">Explicit opt-in for real trades</p>
                        </div>
                      </div>
                      <Badge variant={liveTradingEnabled ? "default" : "secondary"}>
                        {liveTradingEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  
                  {!liveTradingEnabled && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
                      <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                      <div>
                        <p className="font-medium text-warning">
                          Live Trading Disabled
                        </p>
                        <p className="text-sm text-muted-foreground">
                          To enable live trading, both <code className="text-xs bg-muted px-1 py-0.5 rounded">APP_MODE=LIVE</code> and{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">ALLOW_LIVE_EXECUTION=true</code> must be set in your secrets.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="brokers" className="space-y-6">
            {/* Broker Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Broker Configuration
                </CardTitle>
                <CardDescription>
                  Configure and manage broker connections for live trading
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Active Adapter */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <p className="font-medium">Active Adapter</p>
                    <p className="text-sm text-muted-foreground">
                      Currently executing trades via this adapter
                    </p>
                  </div>
                  <Badge variant="outline" className="text-base px-3 py-1.5 capitalize">
                    {currentAdapter}
                  </Badge>
                </div>
                
                <Separator />
                
                {/* Broker Status */}
                <div className="space-y-4">
                  <h4 className="font-medium">Available Brokers</h4>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Tradier */}
                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                            T
                          </div>
                          <span className="font-medium">Tradier</span>
                        </div>
                        <Badge variant={configuredBrokers.includes("tradier") ? "default" : "secondary"}>
                          {configuredBrokers.includes("tradier") ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Commission-free stock & options trading with robust API
                      </p>
                    </div>
                    
                    {/* Alpaca */}
                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                            A
                          </div>
                          <span className="font-medium">Alpaca</span>
                        </div>
                        <Badge variant={configuredBrokers.includes("alpaca") ? "default" : "secondary"}>
                          {configuredBrokers.includes("alpaca") ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Commission-free trading with paper trading support
                      </p>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Preferred Broker Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="preferred-broker">Preferred Broker</Label>
                      <p className="text-sm text-muted-foreground">
                        Broker to use when live trading is enabled
                      </p>
                    </div>
                    <Select value={preferredBroker} onValueChange={handleBrokerChange}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select broker" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tradier">Tradier</SelectItem>
                        <SelectItem value="alpaca">Alpaca</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Paper Trading Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Paper Trading Settings
                </CardTitle>
                <CardDescription>
                  Configure simulation parameters for paper trading
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-2xl font-bold">0.1%</p>
                    <p className="text-sm text-muted-foreground">Slippage</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-2xl font-bold">$0.65</p>
                    <p className="text-sm text-muted-foreground">Commission/Contract</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-2xl font-bold">$0.02</p>
                    <p className="text-sm text-muted-foreground">Fees/Contract</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="exit-rules">
            <ExitRulesSettings mode={mode} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
