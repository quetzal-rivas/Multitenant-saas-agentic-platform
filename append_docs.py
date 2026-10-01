import os

new_components = """
function DocFunctionStudio() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
        <Code2 className="w-6 h-6 text-emerald-400" />
        Function Studio (Serverless Lambda Tools)
      </h1>
      <p className="text-zinc-400">
        The AI Function Studio provides an interactive interface for creating, testing, and deploying serverless tools as AWS Lambda functions directly from the browser. It integrates with the platform's stateless JSON-RPC endpoints to register these functions as MCP tools.
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Features</h2>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span>Write custom Python/Node scripts that get auto-deployed to serverless functions.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span>Test execution in a secure sandbox before deploying.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span>Exposes an API gateway link for each function to test the payload format.</span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl overflow-hidden border border-zinc-800 shadow-2xl relative">
        <img src="/docs/images/function_studio.png" alt="Function Studio Interface" className="w-full object-cover" />
      </div>
    </div>
  );
}

function DocSupervisorBoard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6 text-emerald-400" />
        Supervisor Board (Agent Orchestration)
      </h1>
      <p className="text-zinc-400">
        The Supervisor Board provides a centralized operational view to monitor and orchestrate a fleet of autonomous agents. It displays real-time execution status, active goals, and transactional states of different sub-agents managed by a primary supervisor.
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Key Capabilities</h2>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span>Monitor sub-agent heartbeats and task progress.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span>Track distributed task queues managed via BullMQ.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span>Transactional visualization for multi-agent workflows.</span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl overflow-hidden border border-zinc-800 shadow-2xl relative">
        <img src="/docs/images/supervisor_board.png" alt="Supervisor Board View" className="w-full object-cover" />
      </div>
    </div>
  );
}
"""

with open("app/docs/page.tsx", "a") as f:
    f.write("\n" + new_components + "\n")

print("Components appended.")
