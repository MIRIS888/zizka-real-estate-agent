import { z } from "zod";

import { getDataSourceEnvironment } from "@/lib/env";
import {
  createSupabaseServiceClient,
  getDefaultOrganizationId,
} from "@/lib/supabase/server";

const ContactSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  email: z.email().optional(),
  phone: z.string().trim().min(1).optional(),
});

export const LeadWebhookSchema = z
  .object({
    source: z.string().trim().min(1),
    contact: ContactSchema,
    message: z.string().trim().min(1).optional(),
    propertyReference: z.string().trim().min(1).optional(),
    receivedAt: z.string().datetime().optional(),
  })
  .refine(
    (payload) => payload.contact.email || payload.contact.phone,
    "Lead contact must include email or phone.",
  );

export type LeadWebhook = z.infer<typeof LeadWebhookSchema>;

type ClientRow = {
  id: string;
};

type LeadRow = {
  id: string;
};

function buildLeadNotes(payload: LeadWebhook) {
  return [
    payload.message ? `Message: ${payload.message}` : null,
    payload.propertyReference ? `Property: ${payload.propertyReference}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function findExistingClientId(
  organizationId: string,
  payload: LeadWebhook,
) {
  const supabase = createSupabaseServiceClient();

  if (payload.contact.email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", payload.contact.email)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to search client by email: ${error.message}`);
    }

    if (data) {
      return (data as ClientRow).id;
    }
  }

  if (payload.contact.phone) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", payload.contact.phone)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to search client by phone: ${error.message}`);
    }

    if (data) {
      return (data as ClientRow).id;
    }
  }

  return null;
}

async function createClient(organizationId: string, payload: LeadWebhook) {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      organization_id: organizationId,
      full_name:
        payload.contact.fullName ??
        payload.contact.email ??
        payload.contact.phone ??
        "Unknown contact",
      email: payload.contact.email ?? null,
      phone: payload.contact.phone ?? null,
      source: payload.source,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  return (data as ClientRow).id;
}

export async function ingestLead(payload: LeadWebhook) {
  const organizationId = getDefaultOrganizationId();
  const dataSource = getDataSourceEnvironment();
  const receivedAt = payload.receivedAt ?? new Date().toISOString();
  const notes = buildLeadNotes(payload);

  if (dataSource.DATA_SOURCE === "local") {
    return {
      stored: false,
      organizationId,
      clientId: null,
      leadId: null,
      message:
        "Lead payload is valid. Set DATA_SOURCE=supabase to store it in the database.",
    };
  }

  const supabase = createSupabaseServiceClient();
  const clientId =
    (await findExistingClientId(organizationId, payload)) ??
    (await createClient(organizationId, payload));

  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      status: "new",
      source: payload.source,
      notes: notes || null,
      created_at: receivedAt,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return {
    stored: true,
    organizationId,
    clientId,
    leadId: (data as LeadRow).id,
    message: "Lead stored.",
  };
}
