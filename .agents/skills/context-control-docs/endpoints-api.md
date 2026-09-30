Source: app/docs/page.tsx (route: /docs?section=endpoints-api)

Developer API & Testing Tools · Section 10
# Endpoints API & Live cURL Generator
Interactive REST API endpoint reference (`/api/v1/*`) with pre-populated cURL request builders.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Endpoints API** enables seamless headless integration of the Context Control autonomous agent engine into external enterprise systems. By utilizing the platform's RESTful API (`/api/v1/*`), tenants can embed autonomous capabilities directly into their own custom mobile apps, React web frontends, Zapier webhooks, and legacy CRM backend triggers.
### 2. Key Capabilities & Architecture
* **Tenant API Gateway (`/api/v1/*`):** The core REST engine validates inbound requests using a strict multi-tenant authentication protocol. Every request must include the `x-tenant-id` header and a secure Bearer Authorization token signed by the tenant's BYOK vault.
* **Core Exposed Routes:** Include `POST /api/v1/chat`, `POST /api/v1/schedule_task`, `GET /api/v1/conversations`, and `POST /api/v1/context/resolve`.
* **Interactive Snippet Hydration:** The UI dynamically pre-populates authorization headers (`x-tenant-id`) and variables matching the currently logged-in user's workspace session, ensuring that copied snippets work instantly when pasted into a local terminal.
### 3. Step-by-Step UI How-To-Use Guide
* Click **Endpoints** in the sidebar navigation menu under the *Developer* section.
* Use the left pane to select the target API route (e.g. `POST /api/v1/schedule_task`).
* In the center form pane, adjust the request body parameters.
* Observe the right pane **Code Viewer** updating in real-time.
* Select your preferred programming language from the top tabs (cURL, JS, Python, Go) and click **Copy Snippet**.