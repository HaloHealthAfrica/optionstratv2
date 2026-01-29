import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Target, 
  TrendingDown, 
  Clock, 
  Activity, 
  Zap,
  Save,
  RotateCcw,
  Bot,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useAutoClose } from "@/hooks/useAutoClose";
import { useExitRules, type ExitRulesConfig } from "@/hooks/useExitRules";

const DEFAULT_VALUES = {
  profit_target_percent: 50,
  stop_loss_percent: 75,
  trailing_stop_percent: 25,
  min_days_to_expiration: 5,
  max_days_in_trade: 14,
  delta_exit_threshold: 0.82,
  theta_decay_threshold: 0.04,
  iv_crush_threshold: 0.20,
};

interface ExitRulesSettingsProps {
  mode?: string;
  onSave?: (config: ExitRulesConfig) => void;
}

export function ExitRulesSettings({ mode = "PAPER", onSave }: ExitRulesSettingsProps) {
  const { config: savedConfig, isLoading, save, isSaving } = useExitRules(mode);
  const { isEnabled: autoCloseEnabled, toggle: toggleAutoClose, isSaving: isTogglingAutoClose } = useAutoClose(mode);

  const [localConfig, setLocalConfig] = useState<ExitRulesConfig>(savedConfig);

  // Sync local state when saved config loads
  useEffect(() => {
    if (savedConfig) {
      setLocalConfig(savedConfig);
    }
  }, [savedConfig]);

  const [enabledRules, setEnabledRules] = useState({
    profit_target: true,
    stop_loss: true,
    trailing_stop: true,
    min_dte: true,
    max_days: true,
    delta_threshold: true,
    theta_decay: true,
    iv_crush: true,
  });

  // Update enabled state based on null values
  useEffect(() => {
    setEnabledRules({
      profit_target: localConfig.profit_target_percent !== null,
      stop_loss: localConfig.stop_loss_percent !== null,
      trailing_stop: localConfig.trailing_stop_percent !== null,
      min_dte: localConfig.min_days_to_expiration !== null,
      max_days: localConfig.max_days_in_trade !== null,
      delta_threshold: localConfig.delta_exit_threshold !== null,
      theta_decay: localConfig.theta_decay_threshold !== null,
      iv_crush: localConfig.iv_crush_threshold !== null,
    });
  }, [localConfig]);

  const handleToggle = (rule: keyof typeof enabledRules, configKey: keyof ExitRulesConfig, defaultValue: number) => {
    const newEnabled = !enabledRules[rule];
    setEnabledRules(prev => ({ ...prev, [rule]: newEnabled }));
    setLocalConfig(prev => ({
      ...prev,
      [configKey]: newEnabled ? defaultValue : null,
    }));
  };

  const handleSliderChange = (key: keyof ExitRulesConfig, value: number[]) => {
    setLocalConfig(prev => ({ ...prev, [key]: value[0] }));
  };

  const handleInputChange = (key: keyof ExitRulesConfig, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setLocalConfig(prev => ({ ...prev, [key]: numValue }));
  };

  const handleSave = () => {
    save(localConfig);
    onSave?.(localConfig);
  };

  const handleReset = () => {
    const resetConfig: ExitRulesConfig = {
      ...localConfig,
      profit_target_percent: DEFAULT_VALUES.profit_target_percent,
      stop_loss_percent: DEFAULT_VALUES.stop_loss_percent,
      trailing_stop_percent: DEFAULT_VALUES.trailing_stop_percent,
      min_days_to_expiration: DEFAULT_VALUES.min_days_to_expiration,
      max_days_in_trade: DEFAULT_VALUES.max_days_in_trade,
      delta_exit_threshold: DEFAULT_VALUES.delta_exit_threshold,
      theta_decay_threshold: DEFAULT_VALUES.theta_decay_threshold,
      iv_crush_threshold: DEFAULT_VALUES.iv_crush_threshold,
    };
    setLocalConfig(resetConfig);
    setEnabledRules({
      profit_target: true,
      stop_loss: true,
      trailing_stop: true,
      min_dte: true,
      max_days: true,
      delta_threshold: true,
      theta_decay: true,
      iv_crush: true,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Exit Rules Configuration
          <Badge variant="outline" className="ml-2">{mode}</Badge>
        </CardTitle>
        <CardDescription>
          Configure automated exit conditions for position management. Rules are evaluated every minute during market hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto-Close Master Toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label className="text-base font-semibold">Auto-Close Positions</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically close positions when exit rules trigger
                </p>
              </div>
            </div>
            <Switch
              checked={autoCloseEnabled}
              onCheckedChange={toggleAutoClose}
              disabled={isTogglingAutoClose}
            />
          </div>
          
          {autoCloseEnabled && (
            <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/5">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-sm">
                <span className="font-medium text-yellow-600 dark:text-yellow-400">Active:</span>{" "}
                Positions will be automatically closed when exit conditions are met during refresh cycles (every 1 minute).
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        {/* Profit/Loss Rules */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <TrendingDown className="h-4 w-4" />
            Profit & Loss Rules
          </h4>
          
          {/* Profit Target with Slider */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={enabledRules.profit_target}
                  onCheckedChange={() => handleToggle('profit_target', 'profit_target_percent', DEFAULT_VALUES.profit_target_percent)}
                />
                <div>
                  <Label className="font-medium">Profit Target</Label>
                  <p className="text-xs text-muted-foreground">Exit when profit reaches threshold</p>
                </div>
              </div>
              <Badge variant={enabledRules.profit_target ? "default" : "secondary"} className="text-lg px-3">
                {localConfig.profit_target_percent ?? 0}%
              </Badge>
            </div>
            {enabledRules.profit_target && (
              <Slider
                value={[localConfig.profit_target_percent ?? 50]}
                onValueChange={(v) => handleSliderChange('profit_target_percent', v)}
                min={10}
                max={200}
                step={5}
                className="mt-2"
              />
            )}
          </div>

          {/* Stop Loss with Slider */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={enabledRules.stop_loss}
                  onCheckedChange={() => handleToggle('stop_loss', 'stop_loss_percent', DEFAULT_VALUES.stop_loss_percent)}
                />
                <div>
                  <Label className="font-medium">Stop Loss</Label>
                  <p className="text-xs text-muted-foreground">Exit when loss reaches threshold</p>
                </div>
              </div>
              <Badge variant={enabledRules.stop_loss ? "destructive" : "secondary"} className="text-lg px-3">
                -{localConfig.stop_loss_percent ?? 0}%
              </Badge>
            </div>
            {enabledRules.stop_loss && (
              <Slider
                value={[localConfig.stop_loss_percent ?? 75]}
                onValueChange={(v) => handleSliderChange('stop_loss_percent', v)}
                min={10}
                max={100}
                step={5}
                className="mt-2"
              />
            )}
          </div>

          {/* Trailing Stop with Slider */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={enabledRules.trailing_stop}
                  onCheckedChange={() => handleToggle('trailing_stop', 'trailing_stop_percent', DEFAULT_VALUES.trailing_stop_percent)}
                />
                <div className="flex items-center gap-2">
                  <Label className="font-medium">Trailing Stop</Label>
                  <Badge variant="outline" className="text-xs">Advanced</Badge>
                </div>
              </div>
              <Badge variant={enabledRules.trailing_stop ? "default" : "secondary"} className="text-lg px-3">
                {localConfig.trailing_stop_percent ?? 0}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Trail from high-water mark of unrealized P&L</p>
            {enabledRules.trailing_stop && (
              <Slider
                value={[localConfig.trailing_stop_percent ?? 25]}
                onValueChange={(v) => handleSliderChange('trailing_stop_percent', v)}
                min={5}
                max={50}
                step={5}
                className="mt-2"
              />
            )}
          </div>
        </div>

        <Separator />

        {/* Time-based Rules */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            Time-based Rules
          </h4>
          
          {/* Min DTE */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Switch
                checked={enabledRules.min_dte}
                onCheckedChange={() => handleToggle('min_dte', 'min_days_to_expiration', DEFAULT_VALUES.min_days_to_expiration)}
              />
              <div>
                <Label className="font-medium">Minimum DTE</Label>
                <p className="text-xs text-muted-foreground">Exit when days to expiration falls below</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={localConfig.min_days_to_expiration ?? ''}
                onChange={(e) => handleInputChange('min_days_to_expiration', e.target.value)}
                disabled={!enabledRules.min_dte}
                className="w-20 text-right"
                min={1}
                max={30}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>

          {/* Max Days in Trade */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Switch
                checked={enabledRules.max_days}
                onCheckedChange={() => handleToggle('max_days', 'max_days_in_trade', DEFAULT_VALUES.max_days_in_trade)}
              />
              <div>
                <Label className="font-medium">Max Hold Time</Label>
                <p className="text-xs text-muted-foreground">Exit after maximum days in trade</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={localConfig.max_days_in_trade ?? ''}
                onChange={(e) => handleInputChange('max_days_in_trade', e.target.value)}
                disabled={!enabledRules.max_days}
                className="w-20 text-right"
                min={1}
                max={60}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Greeks-based Rules */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            Greeks-based Rules
          </h4>
          
          {/* Delta Threshold */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Switch
                checked={enabledRules.delta_threshold}
                onCheckedChange={() => handleToggle('delta_threshold', 'delta_exit_threshold', DEFAULT_VALUES.delta_exit_threshold)}
              />
              <div>
                <Label className="font-medium">Delta Threshold</Label>
                <p className="text-xs text-muted-foreground">Exit if |delta| exceeds value (deep ITM)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={localConfig.delta_exit_threshold ?? ''}
                onChange={(e) => handleInputChange('delta_exit_threshold', e.target.value)}
                disabled={!enabledRules.delta_threshold}
                className="w-24 text-right"
                min={0.5}
                max={0.99}
              />
            </div>
          </div>

          {/* Theta Decay */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Switch
                checked={enabledRules.theta_decay}
                onCheckedChange={() => handleToggle('theta_decay', 'theta_decay_threshold', DEFAULT_VALUES.theta_decay_threshold)}
              />
              <div>
                <Label className="font-medium">Theta Decay</Label>
                <p className="text-xs text-muted-foreground">Exit if daily decay exceeds % of position value</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={localConfig.theta_decay_threshold ?? ''}
                onChange={(e) => handleInputChange('theta_decay_threshold', e.target.value)}
                disabled={!enabledRules.theta_decay}
                className="w-24 text-right"
                min={0.01}
                max={0.20}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Volatility Rules */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4" />
            Volatility Rules
          </h4>
          
          {/* IV Crush */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Switch
                checked={enabledRules.iv_crush}
                onCheckedChange={() => handleToggle('iv_crush', 'iv_crush_threshold', DEFAULT_VALUES.iv_crush_threshold)}
              />
              <div>
                <Label className="font-medium">IV Crush</Label>
                <p className="text-xs text-muted-foreground">Exit if IV drops by threshold from entry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={localConfig.iv_crush_threshold ?? ''}
                onChange={(e) => handleInputChange('iv_crush_threshold', e.target.value)}
                disabled={!enabledRules.iv_crush}
                className="w-24 text-right"
                min={0.05}
                max={0.50}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Rules
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
