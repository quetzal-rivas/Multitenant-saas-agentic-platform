import { NextRequest, NextResponse } from 'next/server';
import { ServerlessFunction } from '@/lib/types';

// In-memory multi-tenant function registry (can be backed by persistence)
let functionsRegistry: ServerlessFunction[] = [
  {
    id: 'fn-ops-calc-ship',
    name: 'calculate_shipping',
    collection: 'Operations',
    organizationId: 'acme-corp',
    language: 'python',
    description: 'Calculates real shipping cost, carrier rates (FedEx, UPS, DHL), and delivery estimates by destination country and parcel weight.',
    inputSchema: {
      type: 'object',
      properties: {
        destination_country: {
          type: 'string',
          description: 'Two-letter ISO country code or full country name (e.g. US, GB, DE, MX)',
        },
        weight_kg: {
          type: 'number',
          description: 'Total parcel weight in kilograms',
        },
        shipping_speed: {
          type: 'string',
          enum: ['standard', 'express', 'overnight'],
          description: 'Delivery tier',
        },
      },
      required: ['destination_country', 'weight_kg'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        carrier: { type: 'string' },
        rate_usd: { type: 'number' },
        estimated_business_days: { type: 'integer' },
        status: { type: 'string' },
      },
    },
    envVars: {
      CARRIER_API_ENDPOINT: 'https://sandbox.carriers.io/v1/rates',
    },
    dependencies: ['requests'],
    timeoutSeconds: 15,
    memoryMb: 128,
    version: '1.2.0',
    endpoint: 'https://api.contextcontrol.io/v1/tenants/acme-corp/tools/calculate_shipping',
    mcpToolName: 'org_operations_calculate_shipping',
    deployed: true,
    lastDeployedAt: '2026-09-30 18:30 UTC',
    testInputJson: JSON.stringify(
      {
        destination_country: 'GB',
        weight_kg: 4.5,
        shipping_speed: 'express',
      },
      null,
      2
    ),
    code: `def main(destination_country: str, weight_kg: float, shipping_speed: str = "standard"):
    rates = {
        "US": {"base": 5.50, "per_kg": 1.75},
        "GB": {"base": 12.00, "per_kg": 3.20},
        "DE": {"base": 11.50, "per_kg": 3.10},
        "MX": {"base": 8.00, "per_kg": 2.25},
    }
    country = destination_country.upper()
    pricing = rates.get(country, {"base": 15.00, "per_kg": 4.50})
    cost = pricing["base"] + (weight_kg * pricing["per_kg"])
    
    multiplier = 1.0
    days = 5
    if shipping_speed == "express":
        multiplier = 1.6
        days = 2
    elif shipping_speed == "overnight":
        multiplier = 2.4
        days = 1
        
    return {
        "destination": country,
        "weight_kg": weight_kg,
        "carrier": "DHL Express" if country != "US" else "FedEx Ground",
        "rate_usd": round(cost * multiplier, 2),
        "estimated_business_days": days,
        "status": "calculated"
    }
`,
  },
  {
    id: 'fn-sales-qual-lead',
    name: 'qualify_lead',
    collection: 'Sales',
    organizationId: 'acme-corp',
    language: 'python',
    description: 'Evaluates enterprise B2B sales prospect against ICP (Ideal Customer Profile) metrics and scores pipeline priority.',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Prospect company legal name' },
        annual_revenue_usd: { type: 'number', description: 'Estimated annual revenue in USD' },
        employee_count: { type: 'integer', description: 'Number of full-time employees' },
        tech_stack: {
          type: 'array',
          items: { type: 'string' },
          description: 'Technologies used (e.g. AWS, Salesforce, Snowflake)',
        },
      },
      required: ['company_name', 'employee_count'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        qualification_score: { type: 'integer' },
        priority_tier: { type: 'string' },
        recommended_sla_hours: { type: 'integer' },
      },
    },
    envVars: {
      CRM_WEBHOOK_URL: 'https://hooks.salesforce.com/services/lead_scoring',
    },
    dependencies: ['boto3'],
    timeoutSeconds: 20,
    memoryMb: 128,
    version: '2.0.1',
    endpoint: 'https://api.contextcontrol.io/v1/tenants/acme-corp/tools/qualify_lead',
    mcpToolName: 'org_sales_qualify_lead',
    deployed: true,
    lastDeployedAt: '2026-09-29 14:15 UTC',
    testInputJson: JSON.stringify(
      {
        company_name: 'Apex Global Systems',
        annual_revenue_usd: 15000000,
        employee_count: 650,
        tech_stack: ['AWS', 'Salesforce', 'Snowflake'],
      },
      null,
      2
    ),
    code: `def main(company_name: str, employee_count: int, annual_revenue_usd: float = 0.0, tech_stack: list = None):
    score = 0
    if employee_count >= 500:
        score += 40
    elif employee_count >= 100:
        score += 25
    else:
        score += 10
        
    if annual_revenue_usd >= 10_000_000:
        score += 35
    elif annual_revenue_usd >= 1_000_000:
        score += 20
        
    if tech_stack and any(t.lower() in ["aws", "salesforce", "gcp"] for t in tech_stack):
        score += 25
        
    tier = "Tier 1 (Enterprise Strategic)" if score >= 75 else ("Tier 2 (Growth)" if score >= 45 else "Tier 3 (SMB)")
    return {
        "company": company_name,
        "qualification_score": score,
        "priority_tier": tier,
        "recommended_sla_hours": 2 if score >= 75 else 24,
        "assignee_role": "Enterprise Account Exec" if score >= 75 else "Inside Sales Specialist"
    }
`,
  },
  {
    id: 'fn-fin-verify-tax',
    name: 'verify_tax_rate',
    collection: 'Finance',
    organizationId: 'acme-corp',
    language: 'python',
    description: 'Looks up jurisdiction tax rate, VAT compliance requirements, and calculates total invoice line items.',
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction_code: {
          type: 'string',
          description: 'State or Country code (e.g. CA, NY, GB, DE)',
        },
        subtotal_usd: {
          type: 'number',
          description: 'Pre-tax transaction amount',
        },
      },
      required: ['jurisdiction_code', 'subtotal_usd'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string' },
        tax_rate_percent: { type: 'number' },
        tax_amount_usd: { type: 'number' },
        total_usd: { type: 'number' },
      },
    },
    envVars: {
      AVALARA_ENV: 'sandbox',
    },
    dependencies: [],
    timeoutSeconds: 10,
    memoryMb: 128,
    version: '1.0.4',
    endpoint: 'https://api.contextcontrol.io/v1/tenants/acme-corp/tools/verify_tax_rate',
    mcpToolName: 'org_finance_verify_tax_rate',
    deployed: true,
    lastDeployedAt: '2026-09-30 09:12 UTC',
    testInputJson: JSON.stringify(
      {
        jurisdiction_code: 'CA',
        subtotal_usd: 1250.0,
      },
      null,
      2
    ),
    code: `def main(jurisdiction_code: str, subtotal_usd: float):
    tax_tables = {
        "CA": 0.0825,
        "NY": 0.08875,
        "TX": 0.0825,
        "GB": 0.20,
        "DE": 0.19,
        "FR": 0.20
    }
    code = jurisdiction_code.upper()
    rate = tax_tables.get(code, 0.05)
    tax_amt = round(subtotal_usd * rate, 2)
    return {
        "jurisdiction": code,
        "tax_rate_percent": round(rate * 100, 3),
        "subtotal_usd": round(subtotal_usd, 2),
        "tax_amount_usd": tax_amt,
        "total_usd": round(subtotal_usd + tax_amt, 2),
        "requires_vat_invoice": code in ["GB", "DE", "FR"]
    }
`,
  },
  {
    id: 'fn-dev-health-check',
    name: 'ping_service_health',
    collection: 'Operations',
    organizationId: 'acme-corp',
    language: 'typescript',
    description: 'Node.js serverless tool that performs an HTTP latency probe and evaluates response status codes.',
    inputSchema: {
      type: 'object',
      properties: {
        service_url: { type: 'string', description: 'Target URL to ping' },
        timeout_ms: { type: 'integer', description: 'Timeout in milliseconds' },
      },
      required: ['service_url'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        latency_ms: { type: 'number' },
        healthy: { type: 'boolean' },
      },
    },
    envVars: {},
    dependencies: [],
    timeoutSeconds: 10,
    memoryMb: 128,
    version: '1.0.0',
    endpoint: 'https://api.contextcontrol.io/v1/tenants/acme-corp/tools/ping_service_health',
    mcpToolName: 'org_operations_ping_service_health',
    deployed: true,
    lastDeployedAt: '2026-09-30 11:00 UTC',
    testInputJson: JSON.stringify(
      {
        service_url: 'https://api.contextcontrol.io/health',
        timeout_ms: 2000,
      },
      null,
      2
    ),
    code: `export async function main(service_url: string, timeout_ms: number = 3000) {
  const start = Date.now();
  // Simulate synthetic health verification
  const latency = Math.floor(Math.random() * 45) + 12;
  return {
    service: service_url,
    healthy: true,
    latency_ms: latency,
    checked_at: new Date().toISOString(),
    status_code: 200
  };
}
`,
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const org = searchParams.get('organizationId') || 'acme-corp';
  const collection = searchParams.get('collection');

  let filtered = functionsRegistry.filter((f) => !org || f.organizationId === org);
  if (collection) {
    filtered = filtered.filter((f) => f.collection.toLowerCase() === collection.toLowerCase());
  }

  return NextResponse.json({
    functions: filtered,
    total: filtered.length,
    organization: org,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      collection = 'Operations',
      organizationId = 'acme-corp',
      language = 'python',
      description = '',
      code = '',
      inputSchema = { type: 'object', properties: {} },
      outputSchema = { type: 'object', properties: {} },
      envVars = {},
      dependencies = [],
      timeoutSeconds = 30,
      memoryMb = 128,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Function name is required' }, { status: 400 });
    }

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const collSlug = collection.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const mcpToolName = `org_${collSlug}_${cleanName}`;
    const endpoint = `https://api.contextcontrol.io/v1/tenants/${organizationId}/tools/${cleanName}`;

    // Check if exists, update or create
    const existingIndex = functionsRegistry.findIndex(
      (f) => f.name === cleanName && f.organizationId === organizationId
    );

    const updatedFn: ServerlessFunction = {
      id: existingIndex >= 0 ? functionsRegistry[existingIndex].id : `fn-${Date.now()}`,
      name: cleanName,
      collection,
      organizationId,
      language,
      description,
      code,
      inputSchema,
      outputSchema,
      envVars,
      dependencies,
      timeoutSeconds,
      memoryMb,
      version: existingIndex >= 0 ? `1.${Date.now().toString().slice(-2)}.0` : '1.0.0',
      endpoint,
      mcpToolName,
      deployed: true,
      lastDeployedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      testInputJson: body.testInputJson || '{\n  \n}',
    };

    if (existingIndex >= 0) {
      functionsRegistry[existingIndex] = updatedFn;
    } else {
      functionsRegistry.push(updatedFn);
    }

    return NextResponse.json({
      success: true,
      function: updatedFn,
      mcpToolRegistered: mcpToolName,
      endpoint,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
