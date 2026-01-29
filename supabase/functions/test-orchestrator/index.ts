/**
 * Decision Orchestrator Test Endpoint
 * 
 * Test endpoint for validating orchestrator decisions with mock inputs
 */

import { corsHeaders } from "../_shared/cors.ts";
import {
  orchestrateEntryDecision,
  orchestrateHoldDecision,
  orchestrateExitDecision,
  type OrchestratorEntryInput,
  type OrchestratorHoldInput,
  type OrchestratorExitInput,
} from "../_shared/decision-orchestrator/index.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { type, input, configOverrides } = body;

    if (!type || !input) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: type and input',
        usage: {
          type: 'ENTRY | HOLD | EXIT',
          input: 'OrchestratorEntryInput | OrchestratorHoldInput | OrchestratorExitInput',
          configOverrides: 'Partial<OrchestratorConfig> (optional)',
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;

    switch (type.toUpperCase()) {
      case 'ENTRY':
        result = await orchestrateEntryDecision({
          ...input,
          configOverrides,
        } as OrchestratorEntryInput);
        break;

      case 'HOLD':
        result = await orchestrateHoldDecision({
          ...input,
          configOverrides,
        } as OrchestratorHoldInput);
        break;

      case 'EXIT':
        result = await orchestrateExitDecision({
          ...input,
          configOverrides,
        } as OrchestratorExitInput);
        break;

      default:
        return new Response(JSON.stringify({ 
          error: `Invalid type: ${type}. Must be ENTRY, HOLD, or EXIT` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({
      success: true,
      type,
      decision: result,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[TestOrchestrator] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
