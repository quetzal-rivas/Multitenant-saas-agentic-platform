Source: app/docs/page.tsx (route: /docs?section=security-vault)

Developer API & Testing Tools · Section 13
# API Keys & BYOK Security Vault
AES-256-GCM encrypted credential vault and Supabase PostgreSQL Row-Level Security (RLS) tenant isolation.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **API Keys & BYOK (Bring Your Own Key) Security Vault** forms the cryptographic foundation of the platform's multi-tenant architecture. In an environment where autonomous agents act on behalf of enterprise organizations, credential leakage or cross-tenant data exposure represents an existential threat.
This module guarantees that all API tokens, database connection strings, and third-party OAuth credentials are encrypted at rest using military-grade AES-256-GCM authenticated encryption. Furthermore, it enforces hardware-level data isolation using PostgreSQL Row-Level Security (RLS), ensuring that even if an agent prompt goes rogue, it is physically impossible to query data belonging to another tenant.
### 2. Key Capabilities & Architecture
* **AES-256-GCM Vault Encryption:** When a tenant enters an API key for a tool spoke, the vault manager encrypts the plaintext using the `pgcrypto` extension and a master encryption key. Plaintext tokens are strictly scrubbed from LLM context windows and application logs.
* **Hardware-Level Row-Level Security (RLS):** Every table in the database implements restrictive RLS policies. The database engine natively filters all operations where `tenant_id != app.current_tenant_id`, guaranteeing absolute data isolation.
* **Short-Lived Client Token Minter:** Provides a short-lived token minter that generates HMAC-SHA256 signed JSON Web Tokens (JWTs) with granular scope restrictions and tight expiration windows for secure agent widget embedding.
### 3. Step-by-Step UI How-To-Use Guide
* Navigate to **API Keys & Security Vault** under the *Workspace Settings* menu.
* **To Manage the BYOK Vault:** Review active encrypted provider connections, click the key fingerprint to view health, and click **Rotate Credential** to override an existing token.
* **To Generate Workspace API Keys:** Click **Generate New API Key**, assign a descriptive name, select permission scopes, and copy the plaintext API key.
* **To Mint a Short-Lived Client Token:** Open the **Client Token Minter** drawer, specify the target agent profile ID and set the TTL, then click **Mint Token** to copy the resulting JWT.