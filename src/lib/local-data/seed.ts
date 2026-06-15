export type LocalLead = {
  id: string;
  organizationId: string;
  clientId: string;
  createdAt: string;
  source: string;
  status: string;
};

export type LocalClient = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone: string;
  source: string;
  createdAt: string;
};

export type LocalProperty = {
  id: string;
  organizationId: string;
  title: string;
  address: string;
  city: string;
  reconstructionYear: number | null;
  buildingModifications: string | null;
  energyRating: string | null;
  floorArea: number | null;
};

export type LocalSale = {
  id: string;
  organizationId: string;
  propertyTitle: string;
  soldAt: string;
  price: number;
};

export type LocalCalendarSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string;
};

export type LocalMarketListing = {
  id: string;
  title: string;
  location: string;
  price: number;
  source: string;
  url: string;
  firstSeenAt: string;
};

export const LOCAL_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export const localClients: LocalClient[] = [
  {
    id: "client-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    fullName: "Petra Svobodova",
    email: "petra.svobodova@example.com",
    phone: "+420777111222",
    source: "Sreality",
    createdAt: "2026-01-12T09:00:00.000Z",
  },
  {
    id: "client-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    fullName: "Martin Dvorak",
    email: "martin.dvorak@example.com",
    phone: "+420777222333",
    source: "Facebook",
    createdAt: "2026-02-03T11:30:00.000Z",
  },
  {
    id: "client-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    fullName: "Jana Kralova",
    email: "jana.kralova@example.com",
    phone: "+420777333444",
    source: "Doporuceni",
    createdAt: "2026-02-22T15:10:00.000Z",
  },
  {
    id: "client-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    fullName: "Tomas Novak",
    email: "tomas.novak@example.com",
    phone: "+420777444555",
    source: "Web",
    createdAt: "2026-03-08T08:45:00.000Z",
  },
  {
    id: "client-005",
    organizationId: LOCAL_ORGANIZATION_ID,
    fullName: "Lucie Vesela",
    email: "lucie.vesela@example.com",
    phone: "+420777555666",
    source: "Sreality",
    createdAt: "2026-04-14T12:00:00.000Z",
  },
];

export const localLeads: LocalLead[] = [
  {
    id: "lead-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-001",
    createdAt: "2026-01-12T09:00:00.000Z",
    source: "Sreality",
    status: "qualified",
  },
  {
    id: "lead-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-002",
    createdAt: "2026-02-03T11:30:00.000Z",
    source: "Facebook",
    status: "contacted",
  },
  {
    id: "lead-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-003",
    createdAt: "2026-02-22T15:10:00.000Z",
    source: "Doporuceni",
    status: "won",
  },
  {
    id: "lead-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-004",
    createdAt: "2026-03-08T08:45:00.000Z",
    source: "Web",
    status: "qualified",
  },
  {
    id: "lead-005",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-005",
    createdAt: "2026-04-14T12:00:00.000Z",
    source: "Sreality",
    status: "viewing_scheduled",
  },
  {
    id: "lead-006",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-006",
    createdAt: "2026-05-20T16:20:00.000Z",
    source: "Bezrealitky",
    status: "new",
  },
  {
    id: "lead-007",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-007",
    createdAt: "2026-06-02T10:00:00.000Z",
    source: "Web",
    status: "contacted",
  },
  {
    id: "lead-008",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-008",
    createdAt: "2026-06-11T14:25:00.000Z",
    source: "Sreality",
    status: "new",
  },
];

export const localSales: LocalSale[] = [
  {
    id: "sale-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyTitle: "Byt 1+kk, Praha-Liben",
    soldAt: "2026-01-28T13:00:00.000Z",
    price: 5_250_000,
  },
  {
    id: "sale-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyTitle: "Byt 2+1, Praha-Vrsovice",
    soldAt: "2026-03-19T10:00:00.000Z",
    price: 7_900_000,
  },
  {
    id: "sale-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyTitle: "Garsonka, Praha-Zizkov",
    soldAt: "2026-04-24T15:30:00.000Z",
    price: 4_850_000,
  },
  {
    id: "sale-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyTitle: "Rodinny dum, Roztoky",
    soldAt: "2026-06-05T09:15:00.000Z",
    price: 15_400_000,
  },
];

export const localCalendarSlots: LocalCalendarSlot[] = [
  {
    id: "slot-001",
    startsAt: "2026-06-17T08:30:00.000Z",
    endsAt: "2026-06-17T09:15:00.000Z",
    label: "Streda 17. 6. v 10:30",
  },
  {
    id: "slot-002",
    startsAt: "2026-06-18T12:00:00.000Z",
    endsAt: "2026-06-18T12:45:00.000Z",
    label: "Ctvrtek 18. 6. ve 14:00",
  },
  {
    id: "slot-003",
    startsAt: "2026-06-19T07:00:00.000Z",
    endsAt: "2026-06-19T07:45:00.000Z",
    label: "Patek 19. 6. v 9:00",
  },
];

export const localMarketListings: LocalMarketListing[] = [
  {
    id: "listing-001",
    title: "Byt 2+kk, Praha-Holesovice, Tusarova",
    location: "Praha Holesovice",
    price: 8_490_000,
    source: "Sreality",
    url: "https://example.com/sreality/tusarova-2kk",
    firstSeenAt: "2026-06-15T06:10:00.000Z",
  },
  {
    id: "listing-002",
    title: "Loft 1+kk u Vltavy",
    location: "Praha Holesovice",
    price: 6_950_000,
    source: "Bezrealitky",
    url: "https://example.com/bezrealitky/loft-vltava",
    firstSeenAt: "2026-06-15T06:35:00.000Z",
  },
  {
    id: "listing-003",
    title: "Byt 3+kk, Delnicka",
    location: "Praha Holesovice",
    price: 11_200_000,
    source: "Reality.idnes",
    url: "https://example.com/idnes/delnicka-3kk",
    firstSeenAt: "2026-06-15T07:05:00.000Z",
  },
];

export const localProperties: LocalProperty[] = [
  {
    id: "property-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Byt 2+kk, Praha-Holešovice",
    address: "Komunardů 18",
    city: "Praha",
    reconstructionYear: null,
    buildingModifications: null,
    energyRating: "C",
    floorArea: 54,
  },
  {
    id: "property-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Ateliér u Vltavy",
    address: "Jankovcova 31",
    city: "Praha",
    reconstructionYear: 2021,
    buildingModifications: "Nová elektroinstalace, koupelna",
    energyRating: null,
    floorArea: 41,
  },
  {
    id: "property-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Rodinný dům, Roztoky",
    address: "Tiché údolí 7",
    city: "Roztoky",
    reconstructionYear: 2018,
    buildingModifications: null,
    energyRating: "B",
    floorArea: 132,
  },
  {
    id: "property-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Byt 3+1, Praha-Bubeneč",
    address: "Československé armády 22",
    city: "Praha",
    reconstructionYear: null,
    buildingModifications: "Repase parket",
    energyRating: "D",
    floorArea: null,
  },
];
