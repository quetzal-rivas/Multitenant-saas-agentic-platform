Source: app/docs/page.tsx (route: /docs?section=test-simulator)

Developer API & Testing Tools · Section 11
# Test Simulator & Time-Travel Sandbox
Sandbox playground for evaluating agent graph state machine transitions and simulating tool failures.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Test Simulator** is an isolated developer playground designed specifically to evaluate complex multi-agent graph state transitions, test fallback escalation matrices, and debug BullMQ scheduled tasks safely without mutating production database tables or firing real API requests.
Because the Context Control platform relies heavily on autonomous, delayed background jobs (e.g., executing a billing audit 24 hours from now), waiting for actual time to pass to observe a bug is not feasible. The Simulator solves this with a "Time-Travel" clock overriding architecture, coupled with synthetic fault injection.
### 2. Key Capabilities & Architecture
* **Time-Travel Clock Fast-Forwarding:** Developers can input a virtual target time, allowing the simulator engine to immediately flush and execute deferred BullMQ and EventBridge scheduled tasks as if the target date had arrived.
* **Synthetic Fault Injection & Chaos Testing:** Allows administrators to toggle synthetic failures (e.g. Mock HTTP 429 Too Many Requests on Gmail spoke calls). By injecting these failures, tenants can verify that their `edgeCasePolicies` successfully catch the error.
* **Execution Waterfall Tracing:** Once a simulation runs, the UI displays a detailed waterfall trace chart visualizing the node-to-node state transition path, total latency, LLM token usage, and payload diffs.
* **Isolated Memory Sandbox:** All simulated operations write to an ephemeral, in-memory state dictionary rather than committing persistent records to production.
### 3. Step-by-Step UI How-To-Use Guide
* Select **Test Simulator** under the *Developer* section of the sidebar menu.
* Under the **Scenario Setup** panel, select the target Agent Profile or Team Graph to evaluate.
* Enter custom task input parameters (e.g., *"Simulate an overnight refund request for Client X"*).
* **To Inject Faults:** Scroll to the **Chaos Testing & Fault Injection** drawer, toggle **Simulate Primary Tool Failure**, select the target tool to fail, and choose the failure mode.
* **To Time-Travel:** Under the **Virtual Clock** section, set the simulated execution date to a future timestamp.
* Click **Run Simulation** and review the exact prompt tokens used, the error catching mechanism in action, and the final state matrix.