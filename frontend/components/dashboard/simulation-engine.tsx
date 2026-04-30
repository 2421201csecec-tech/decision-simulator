"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Zap } from "lucide-react";
import {
  fetchLatestSimulation,
  runThreadSimulation,
  type SimulationResult,
} from "@/lib/api/threads";

interface SimulationEngineProps {
  threadId?: string | null;
  onResultsShown?: (shown: boolean) => void;
}

export function SimulationEngine({ threadId, onResultsShown }: SimulationEngineProps) {
  const [price, setPrice] = useState("");
  const [targetMarket, setTargetMarket] = useState("Early Adopters");
  const [marketingSpend, setMarketingSpend] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("3 Months");
  const [hasRun, setHasRun] = useState(false);
  const [results, setResults] = useState<SimulationResult | null>(null);
  const [showWorstCase, setShowWorstCase] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      setResults(null);
      setHasRun(false);
      return;
    }

    let active = true;

    const loadLatest = async () => {
      try {
        setLoading(true);
        setError(null);
        const latest = await fetchLatestSimulation(threadId);
        if (!active) return;

        if (!latest || !latest.variables || !latest.results) {
          setPrice("");
          setMarketingSpend("");
          setResults(null);
          setHasRun(false);
          onResultsShown?.(false);
          return;
        }

        setPrice(latest.variables.price);
        setTargetMarket(latest.variables.targetMarket);
        setMarketingSpend(latest.variables.marketingSpend);
        setTimeHorizon(latest.variables.timeHorizon);
        setResults(latest.results);
        setHasRun(true);
        onResultsShown?.(true);
      } catch {
        if (!active) return;
        setError("Unable to load simulation data.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadLatest();

    return () => {
      active = false;
    };
  }, [threadId, onResultsShown]);

  const normalizeCurrencyInput = (value: string): string => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    if (!digitsOnly) return "";

    const numeric = Number(digitsOnly);
    if (!Number.isFinite(numeric) || numeric <= 0) return "";

    return `Rs ${new Intl.NumberFormat("en-IN").format(numeric)}`;
  };

  const handleRunSimulation = async () => {
    if (!threadId || running) return;

    const normalizedPrice = normalizeCurrencyInput(price);
    const normalizedSpend = normalizeCurrencyInput(marketingSpend);

    if (!normalizedPrice || !normalizedSpend) {
      setError("Enter valid price and marketing spend values.");
      return;
    }

    try {
      setRunning(true);
      setError(null);

      const run = await runThreadSimulation(threadId, {});
      if (run.variables) setPrice(run.variables.price ?? "");
      if (run.variables) setMarketingSpend(run.variables.marketingSpend ?? "");
      setResults(run.results ?? null);
      setHasRun(true);
      onResultsShown?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run simulation. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading simulation state...</p>;
  }

  if (!threadId) {
    return <p className="text-sm text-muted-foreground">Select or create a thread to run simulation.</p>;
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Simulation Variables</h4>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Price</label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. Rs 1,999 or 1999"
            list="price-presets"
            className="w-full px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <datalist id="price-presets">
            <option value="1499" />
            <option value="1999" />
            <option value="2499" />
          </datalist>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Target Market</label>
          <select
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
            className="w-full px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option>Early Adopters</option>
            <option>Mass Market</option>
            <option>Enterprise</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Marketing Spend</label>
          <input
            type="text"
            value={marketingSpend}
            onChange={(e) => setMarketingSpend(e.target.value)}
            placeholder="e.g. Rs 50,000 or 50000"
            list="marketing-spend-presets"
            className="w-full px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <datalist id="marketing-spend-presets">
            <option value="25000" />
            <option value="50000" />
            <option value="100000" />
          </datalist>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Time Horizon</label>
          <select
            value={timeHorizon}
            onChange={(e) => setTimeHorizon(e.target.value)}
            className="w-full px-3 py-2 bg-secondary border border-border/50 rounded-lg text-sm text-foreground hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option>1 Month</option>
            <option>3 Months</option>
            <option>6 Months</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleRunSimulation}
        disabled={running}
        className="w-full px-4 py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {running ? "Running..." : "Run Simulation"}
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Simulation Results */}
      {results && (
        <div className="space-y-4 pt-4 border-t border-border/30">
          <h4 className="text-sm font-medium text-foreground">Simulation Results</h4>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Adoption Projection</span>
              <span className="text-foreground">{results.adoptionProjection}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue Projection</span>
              <span className="text-foreground">{results.revenueProjection}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Competitor Reaction</span>
              <span className="text-foreground">{results.competitorReaction}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">User Perception</span>
              <span className="text-foreground">{results.userPerception}</span>
            </div>
          </div>

          {/* Risk Probability */}
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground font-medium">Risk Probability</p>
            {results.risks.map((risk, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground/80">{risk.label}</span>
                  <span className="text-xs font-medium text-accent">{risk.percentage}%</span>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${risk.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* AI Insight */}
          <div className="p-3 bg-accent/10 rounded-lg border border-accent/30">
            <div className="flex gap-2">
              <Zap className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-foreground/80">{results.insight}</p>
            </div>
          </div>

          {/* Simulate Failure Button */}
          {!showWorstCase && (
            <button
              onClick={() => setShowWorstCase(true)}
              className="w-full px-4 py-2 bg-secondary border border-border/50 text-foreground/80 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              Simulate Failure
            </button>
          )}

          {/* Failure Mode */}
          {showWorstCase && (
            <div className="space-y-3 pt-3 border-t border-border/30">
              <h4 className="text-xs font-medium text-accent">Failure Analysis</h4>

              <div className="text-xs space-y-2">
                <div className="flex justify-between p-2 bg-destructive/10 rounded border border-destructive/20">
                  <span className="text-foreground/80">Adoption</span>
                  <span className="text-destructive font-medium">Low</span>
                </div>
                <div className="flex justify-between p-2 bg-destructive/10 rounded border border-destructive/20">
                  <span className="text-foreground/80">Revenue</span>
                  <span className="text-destructive font-medium">₹0.8L – ₹1.2L</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Risk Escalation</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground/80">Market Rejection</span>
                    <span className="text-xs font-medium text-destructive">78%</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-destructive rounded-full" style={{ width: "78%" }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground/80">Competitor Undercut</span>
                    <span className="text-xs font-medium text-destructive">85%</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-destructive rounded-full" style={{ width: "85%" }} />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/80">Low pricing damaged perceived value. Consider ₹2499 premium positioning.</p>
                </div>
              </div>

              <button
                onClick={() => setShowWorstCase(false)}
                className="w-full px-4 py-2 bg-secondary border border-border/50 text-foreground/80 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Back to Results
              </button>
            </div>
          )}
        </div>
      )}

      {!results && hasRun && (
        <p className="text-xs text-muted-foreground">Run completed, but no result payload available.</p>
      )}
    </div>
  );
}
