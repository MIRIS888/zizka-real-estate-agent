import { FindIncompletePropertiesInputSchema } from "@/lib/contracts/tools";
import { getDataSourceEnvironment } from "@/lib/env";
import { localProperties } from "@/lib/local-data/seed";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type PropertyQualityRow = {
  id: string;
  title: string;
  address: string;
  city: string;
  reconstruction_year: number | null;
  building_modifications: string | null;
  energy_rating: string | null;
  floor_area: number | null;
};

export type IncompleteProperty = {
  id: string;
  title: string;
  location: string;
  missingFields: string[];
};

const FIELD_LABELS: Record<keyof Omit<PropertyQualityRow, "id" | "title" | "address" | "city">, string> = {
  reconstruction_year: "Rok rekonstrukce",
  building_modifications: "Stavební úpravy",
  energy_rating: "Energetická náročnost",
  floor_area: "Podlahová plocha",
};

function isMissing(value: string | number | null) {
  return value === null || value === "";
}

export async function findIncompleteProperties(
  organizationId: string,
  rawInput: unknown,
): Promise<IncompleteProperty[]> {
  const input = FindIncompletePropertiesInputSchema.parse(rawInput);
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "local") {
    return localProperties
      .filter((property) => property.organizationId === organizationId)
      .map((property) => {
        const normalizedProperty: PropertyQualityRow = {
          id: property.id,
          title: property.title,
          address: property.address,
          city: property.city,
          reconstruction_year: property.reconstructionYear,
          building_modifications: property.buildingModifications,
          energy_rating: property.energyRating,
          floor_area: property.floorArea,
        };
        const missingFields = input.fields
          .filter((field) => isMissing(normalizedProperty[field]))
          .map((field) => FIELD_LABELS[field]);

        return {
          id: property.id,
          title: property.title,
          location: `${property.address}, ${property.city}`,
          missingFields,
        };
      })
      .filter((property) => property.missingFields.length > 0);
  }

  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("properties")
    .select(
      "id, title, address, city, reconstruction_year, building_modifications, energy_rating, floor_area",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load properties: ${error.message}`);
  }

  const rows = (data ?? []) as PropertyQualityRow[];

  return rows
    .map((property) => {
      const missingFields = input.fields
        .filter((field) => isMissing(property[field]))
        .map((field) => FIELD_LABELS[field]);

      return {
        id: property.id,
        title: property.title,
        location: `${property.address}, ${property.city}`,
        missingFields,
      };
    })
    .filter((property) => property.missingFields.length > 0);
}
