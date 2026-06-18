/**
 * Seed demo data into Supabase for Žižka Reality presentation.
 * Usage: npm run seed:supabase
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   Both must be set in .env.local or already in environment.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv() {
  const envPath = ".env.local";
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  console.error("Add them to .env.local or export them before running this script.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_ID =
  process.env.DEFAULT_ORGANIZATION_ID ?? "00000000-0000-4000-8000-000000000001";

const clients = [
  { id: "00000000-0000-4001-8001-000000000001", full_name: "Petra Svobodová",      email: "petra.svobodova@example.com",    phone: "+420777111222", source: "Sreality",      created_at: "2026-01-12T09:00:00Z" },
  { id: "00000000-0000-4001-8001-000000000002", full_name: "Martin Dvořák",        email: "martin.dvorak@example.com",      phone: "+420777222333", source: "Facebook",      created_at: "2026-02-03T11:30:00Z" },
  { id: "00000000-0000-4001-8001-000000000003", full_name: "Jana Králová",          email: "jana.kralova@example.com",       phone: "+420777333444", source: "Doporučení",    created_at: "2026-02-22T15:10:00Z" },
  { id: "00000000-0000-4001-8001-000000000004", full_name: "Tomáš Novák",           email: "tomas.novak@example.com",        phone: "+420777444555", source: "Web",           created_at: "2026-03-08T08:45:00Z" },
  { id: "00000000-0000-4001-8001-000000000005", full_name: "Lucie Veselá",          email: "lucie.vesela@example.com",       phone: "+420777555666", source: "Sreality",      created_at: "2026-03-21T12:00:00Z" },
  { id: "00000000-0000-4001-8001-000000000006", full_name: "Karel Beneš",           email: "karel.benes@example.com",        phone: "+420777666777", source: "Bezrealitky",   created_at: "2026-04-14T12:00:00Z" },
  { id: "00000000-0000-4001-8001-000000000007", full_name: "Eva Horáková",          email: "eva.horakova@example.com",       phone: "+420777777888", source: "Web",           created_at: "2026-05-20T16:20:00Z" },
  { id: "00000000-0000-4001-8001-000000000008", full_name: "Ondřej Marek",          email: "ondrej.marek@example.com",       phone: "+420777888999", source: "Sreality",      created_at: "2026-06-02T10:00:00Z" },
  { id: "00000000-0000-4001-8001-000000000009", full_name: "Alena Pokorná",         email: "alena.pokorna@example.com",      phone: "+420777999000", source: "Reality.idnes", created_at: "2026-06-11T14:25:00Z" },
  { id: "00000000-0000-4001-8001-000000000010", full_name: "Radek Novotný",         email: "radek.novotny@example.com",      phone: "+420776100200", source: "Instagram",     created_at: "2026-01-28T10:15:00Z" },
  { id: "00000000-0000-4001-8001-000000000011", full_name: "Lenka Pospíšilová",    email: "lenka.pospisilova@example.com",  phone: "+420776200300", source: "Telefon",       created_at: "2026-02-14T08:30:00Z" },
  { id: "00000000-0000-4001-8001-000000000012", full_name: "Jakub Řezníček",       email: "jakub.reznicek@example.com",     phone: "+420776300400", source: "Sreality",      created_at: "2026-04-02T13:45:00Z" },
  { id: "00000000-0000-4001-8001-000000000013", full_name: "Veronika Králíčková",  email: "veronika.kralickova@example.com",phone: "+420776400500", source: "Facebook",      created_at: "2026-04-28T15:00:00Z" },
  { id: "00000000-0000-4001-8001-000000000014", full_name: "Šimon Fiala",          email: "simon.fiala@example.com",        phone: "+420776500600", source: "Bezrealitky",   created_at: "2026-05-09T11:20:00Z" },
  { id: "00000000-0000-4001-8001-000000000015", full_name: "Martin Šedlák",        email: "martin.sedlak@example.com",      phone: "+420776600700", source: "Web",           created_at: "2026-06-16T09:00:00Z" },
];

const properties = [
  { id: "00000000-0000-4002-8002-000000000001", title: "Byt 2+kk, Praha-Holešovice", address: "Komunardů 18",               city: "Praha",    district: "Holešovice", status: "active",   price: 8490000,  floor_area: 54,  reconstruction_year: null, building_modifications: null,                             energy_rating: "C", created_at: "2026-01-05T10:00:00Z", updated_at: "2026-01-05T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000002", title: "Ateliér u Vltavy",            address: "Jankovicova 31",             city: "Praha",    district: "Holešovice", status: "reserved", price: 6950000,  floor_area: 41,  reconstruction_year: 2021, building_modifications: "Nová elektroinstalace, koupelna", energy_rating: null, created_at: "2026-02-01T10:00:00Z", updated_at: "2026-06-10T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000003", title: "Rodinný dům, Roztoky",        address: "Tiché údolí 7",              city: "Roztoky",  district: "Roztoky",    status: "sold",     price: 15400000, floor_area: 132, reconstruction_year: 2018, building_modifications: null,                             energy_rating: "B", created_at: "2026-01-18T10:00:00Z", updated_at: "2026-06-05T09:15:00Z" },
  { id: "00000000-0000-4002-8002-000000000004", title: "Byt 3+1, Praha-Bubeneč",      address: "Československé armády 22",  city: "Praha",    district: "Bubeneč",    status: "active",   price: 11200000, floor_area: null,reconstruction_year: null, building_modifications: "Repase parket",                  energy_rating: "D", created_at: "2026-03-11T10:00:00Z", updated_at: "2026-03-11T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000005", title: "Garsonka, Praha-Žižkov",      address: "Biskupcová 9",               city: "Praha",    district: "Žižkov",     status: "sold",     price: 4850000,  floor_area: 29,  reconstruction_year: 2020, building_modifications: "Bez dispozičních změn",          energy_rating: "C", created_at: "2026-01-28T10:00:00Z", updated_at: "2026-04-24T15:30:00Z" },
  { id: "00000000-0000-4002-8002-000000000006", title: "Byt 2+1, Praha-Vršovice",     address: "Krymská 12",                 city: "Praha",    district: "Vršovice",   status: "sold",     price: 7900000,  floor_area: 62,  reconstruction_year: 2019, building_modifications: "Nová kuchyňská linka",           energy_rating: "C", created_at: "2026-01-08T10:00:00Z", updated_at: "2026-03-19T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000007", title: "Byt 1+kk, Praha-Libeň",       address: "Ženklovka 44",               city: "Praha",    district: "Libeň",      status: "sold",     price: 5250000,  floor_area: 35,  reconstruction_year: null, building_modifications: "Žádné",                          energy_rating: "E", created_at: "2025-12-12T10:00:00Z", updated_at: "2026-01-28T13:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000008", title: "Byt 2+kk, Praha-Karlín",      address: "Sokolovská 88",              city: "Praha",    district: "Karlín",     status: "active",   price: 9200000,  floor_area: null,reconstruction_year: 2022, building_modifications: "Otevřená kuchyně, nová koupelna", energy_rating: null, created_at: "2026-03-25T10:00:00Z", updated_at: "2026-03-25T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000009", title: "Byt 3+kk, Praha-Vinohrady",   address: "Mánesova 47",                city: "Praha",    district: "Vinohrady",  status: "reserved", price: 12500000, floor_area: 78,  reconstruction_year: 2023, building_modifications: "Nové podlahy, koupelna, okna",   energy_rating: "B", created_at: "2026-04-18T10:00:00Z", updated_at: "2026-06-01T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000010", title: "Byt 2+kk, Praha-Dejvice",     address: "Dejvická 21",                city: "Praha",    district: "Dejvice",    status: "sold",     price: 10800000, floor_area: 59,  reconstruction_year: 2020, building_modifications: "Nová okna, podlaha",             energy_rating: "A", created_at: "2026-01-15T10:00:00Z", updated_at: "2026-02-27T14:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000011", title: "Byt 4+1, Praha-Žižkov",       address: "Seifertova 31",              city: "Praha",    district: "Žižkov",     status: "active",   price: 14500000, floor_area: 95,  reconstruction_year: null, building_modifications: "Částečná rekonstrukce koupelny", energy_rating: "D", created_at: "2026-05-03T10:00:00Z", updated_at: "2026-05-03T10:00:00Z" },
  { id: "00000000-0000-4002-8002-000000000012", title: "Řadový dům, Skalice",         address: "Na Vinici 12",               city: "Skalice",  district: "Skalice",    status: "sold",     price: 6800000,  floor_area: 110, reconstruction_year: 2015, building_modifications: "Nová střecha, fasáda",          energy_rating: "C", created_at: "2026-03-20T10:00:00Z", updated_at: "2026-05-15T11:30:00Z" },
];

const leads = [
  { id: "00000000-0000-4003-8003-000000000001", client_id: "00000000-0000-4001-8001-000000000001", status: "qualified",         source: "Sreality",      created_at: "2026-01-12T09:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000002", client_id: "00000000-0000-4001-8001-000000000002", status: "contacted",         source: "Facebook",      created_at: "2026-02-03T11:30:00Z" },
  { id: "00000000-0000-4003-8003-000000000003", client_id: "00000000-0000-4001-8001-000000000003", status: "won",               source: "Doporučení",    created_at: "2026-02-22T15:10:00Z" },
  { id: "00000000-0000-4003-8003-000000000004", client_id: "00000000-0000-4001-8001-000000000004", status: "qualified",         source: "Web",           created_at: "2026-03-08T08:45:00Z" },
  { id: "00000000-0000-4003-8003-000000000005", client_id: "00000000-0000-4001-8001-000000000005", status: "new",               source: "Sreality",      created_at: "2026-03-21T12:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000006", client_id: "00000000-0000-4001-8001-000000000006", status: "viewing_scheduled", source: "Bezrealitky",   created_at: "2026-04-14T12:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000007", client_id: "00000000-0000-4001-8001-000000000007", status: "contacted",         source: "Web",           created_at: "2026-05-20T16:20:00Z" },
  { id: "00000000-0000-4003-8003-000000000008", client_id: "00000000-0000-4001-8001-000000000008", status: "new",               source: "Sreality",      created_at: "2026-06-02T10:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000009", client_id: "00000000-0000-4001-8001-000000000009", status: "contacted",         source: "Reality.idnes", created_at: "2026-06-11T14:25:00Z" },
  { id: "00000000-0000-4003-8003-000000000010", client_id: "00000000-0000-4001-8001-000000000001", status: "qualified",         source: "Sreality",      created_at: "2026-06-15T09:15:00Z" },
  { id: "00000000-0000-4003-8003-000000000011", client_id: "00000000-0000-4001-8001-000000000010", status: "contacted",         source: "Instagram",     created_at: "2026-01-28T10:15:00Z" },
  { id: "00000000-0000-4003-8003-000000000012", client_id: "00000000-0000-4001-8001-000000000011", status: "qualified",         source: "Telefon",       created_at: "2026-02-14T08:30:00Z" },
  { id: "00000000-0000-4003-8003-000000000013", client_id: "00000000-0000-4001-8001-000000000012", status: "won",               source: "Sreality",      created_at: "2026-04-02T13:45:00Z" },
  { id: "00000000-0000-4003-8003-000000000014", client_id: "00000000-0000-4001-8001-000000000013", status: "viewing_scheduled", source: "Facebook",      created_at: "2026-04-28T15:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000015", client_id: "00000000-0000-4001-8001-000000000014", status: "lost",              source: "Bezrealitky",   created_at: "2026-05-09T11:20:00Z" },
  { id: "00000000-0000-4003-8003-000000000016", client_id: "00000000-0000-4001-8001-000000000015", status: "new",               source: "Web",           created_at: "2026-06-16T09:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000017", client_id: "00000000-0000-4001-8001-000000000002", status: "won",               source: "Facebook",      created_at: "2026-03-10T14:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000018", client_id: "00000000-0000-4001-8001-000000000005", status: "contacted",         source: "Sreality",      created_at: "2026-02-08T09:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000019", client_id: "00000000-0000-4001-8001-000000000007", status: "qualified",         source: "Web",           created_at: "2026-04-05T10:30:00Z" },
  { id: "00000000-0000-4003-8003-000000000020", client_id: "00000000-0000-4001-8001-000000000003", status: "viewing_scheduled", source: "Doporučení",    created_at: "2026-05-14T11:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000021", client_id: "00000000-0000-4001-8001-000000000004", status: "lost",              source: "Web",           created_at: "2026-01-22T07:30:00Z" },
  { id: "00000000-0000-4003-8003-000000000022", client_id: "00000000-0000-4001-8001-000000000006", status: "won",               source: "Bezrealitky",   created_at: "2026-06-03T13:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000023", client_id: "00000000-0000-4001-8001-000000000008", status: "new",               source: "Sreality",      created_at: "2026-05-28T08:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000024", client_id: "00000000-0000-4001-8001-000000000010", status: "qualified",         source: "Instagram",     created_at: "2026-03-15T15:20:00Z" },
  { id: "00000000-0000-4003-8003-000000000025", client_id: "00000000-0000-4001-8001-000000000011", status: "contacted",         source: "Telefon",       created_at: "2026-04-20T09:45:00Z" },
  { id: "00000000-0000-4003-8003-000000000026", client_id: "00000000-0000-4001-8001-000000000012", status: "new",               source: "Sreality",      created_at: "2026-06-08T10:00:00Z" },
  { id: "00000000-0000-4003-8003-000000000027", client_id: "00000000-0000-4001-8001-000000000013", status: "lost",              source: "Facebook",      created_at: "2026-02-25T14:30:00Z" },
  { id: "00000000-0000-4003-8003-000000000028", client_id: "00000000-0000-4001-8001-000000000014", status: "viewing_scheduled", source: "Bezrealitky",   created_at: "2026-05-30T16:00:00Z" },
];

const tasks = [
  { id: "00000000-0000-4004-8004-000000000001", property_id: "00000000-0000-4002-8002-000000000001", title: "Doplnit technická data pro Byt 2+kk Holešovice", description: "Chybí rok rekonstrukce a stavební úpravy.", due_at: "2026-06-25T12:00:00Z" },
  { id: "00000000-0000-4004-8004-000000000002", property_id: "00000000-0000-4002-8002-000000000002", title: "Potvrdit prohlídku Ateliér u Vltavy",              description: "Zájemce Karel Beneš — termín 20. 6.",    due_at: "2026-06-20T10:00:00Z" },
  { id: "00000000-0000-4004-8004-000000000003", property_id: null,                                   title: "Kontaktovat nové leady z Instagramu",             description: "Odpovědět do 24 hodin.",                 due_at: "2026-06-22T12:00:00Z" },
  { id: "00000000-0000-4004-8004-000000000004", property_id: "00000000-0000-4002-8002-000000000004", title: "Připravit podklady pro Byt 3+1 Bubeneč",          description: "Chybí rok rekonstrukce a plocha.",       due_at: "2026-06-30T12:00:00Z" },
  { id: "00000000-0000-4004-8004-000000000005", property_id: "00000000-0000-4002-8002-000000000008", title: "Doplnit energetický průkaz pro Byt 2+kk Karlín", description: "Zadat u certifikovaného auditora.",       due_at: "2026-06-25T12:00:00Z" },
  { id: "00000000-0000-4004-8004-000000000006", property_id: "00000000-0000-4002-8002-000000000009", title: "Follow-up po prohlídce Byt 3+kk Vinohrady",      description: "Zjistit zájem a další kroky.",           due_at: "2026-06-23T12:00:00Z" },
  { id: "00000000-0000-4004-8004-000000000007", property_id: "00000000-0000-4002-8002-000000000011", title: "Nahrát fotografie Byt 4+1 Žižkov",               description: "Před publikací na Sreality.",            due_at: "2026-06-28T12:00:00Z" },
];

async function upsertTable(tableName, rows, description) {
  process.stdout.write(`  Seeding ${description} (${rows.length} rows)... `);
  const { error } = await supabase
    .from(tableName)
    .upsert(rows.map((row) => ({ ...row, organization_id: tableName !== "organizations" ? ORG_ID : undefined })), {
      onConflict: "id",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(`FAILED: ${error.message}`);
    return false;
  }
  console.log("OK");
  return true;
}

async function seed() {
  console.log("🌱 Seeding Žižka Reality demo data into Supabase...");
  console.log(`   URL: ${supabaseUrl}`);
  console.log(`   Org: ${ORG_ID}\n`);

  let ok = true;

  // Organization
  process.stdout.write("  Seeding organization... ");
  const { error: orgError } = await supabase
    .from("organizations")
    .upsert([{ id: ORG_ID, name: "Žižka Reality", created_at: "2025-12-01T08:00:00Z" }], {
      onConflict: "id",
      ignoreDuplicates: true,
    });
  if (orgError) {
    console.error(`FAILED: ${orgError.message}`);
    ok = false;
  } else {
    console.log("OK");
  }

  // Clients
  const clientRows = clients.map(({ id, full_name, email, phone, source, created_at }) => ({
    id,
    organization_id: ORG_ID,
    full_name,
    email,
    phone,
    source,
    created_at,
  }));
  ok = (await upsertTable("clients", clientRows, "clients")) && ok;

  // Properties
  const propertyRows = properties.map((p) => ({
    id: p.id,
    organization_id: ORG_ID,
    title: p.title,
    address: p.address,
    city: p.city,
    district: p.district,
    status: p.status,
    price: p.price,
    floor_area: p.floor_area,
    reconstruction_year: p.reconstruction_year,
    building_modifications: p.building_modifications,
    energy_rating: p.energy_rating,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
  ok = (await upsertTable("properties", propertyRows, "properties")) && ok;

  // Leads
  const leadRows = leads.map(({ id, client_id, status, source, created_at }) => ({
    id,
    organization_id: ORG_ID,
    client_id,
    status,
    source,
    created_at,
  }));
  ok = (await upsertTable("leads", leadRows, "leads")) && ok;

  // Tasks
  const taskRows = tasks.map(({ id, property_id, title, description, due_at }) => ({
    id,
    organization_id: ORG_ID,
    property_id: property_id ?? null,
    title,
    description,
    due_at,
  }));
  ok = (await upsertTable("tasks", taskRows, "tasks")) && ok;

  if (ok) {
    console.log("\n✅ Seed complete.");
    console.log(`   clients: 15, properties: 12, leads: 28, tasks: 7`);
    console.log(`   organization_id: ${ORG_ID}`);
  } else {
    console.log("\n❌ Seed finished with errors.");
  }
  console.log("\nNext steps:");
  console.log("  1. Set DATA_SOURCE=supabase in .env.local");
  console.log(`  2. Set DEFAULT_ORGANIZATION_ID=${ORG_ID} in .env.local`);
  console.log("  3. npm run dev");

  if (!ok) process.exit(1);
}

seed().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
