export const LOCAL_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export type LocalClient = {
  id: string;
  organizationId: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "active" | "inactive";
  assignedTo: string;
};

export type LocalLead = {
  id: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  source: string;
  propertyId: string;
  createdAt: string;
  status: "new" | "contacted" | "qualified" | "viewing_scheduled" | "won" | "lost";
};

export type LocalProperty = {
  id: string;
  organizationId: string;
  title: string;
  address: string;
  district: string;
  city: string;
  price: number;
  status: "active" | "reserved" | "sold" | "draft";
  ownerName: string;
  reconstructionInfo: string | null;
  constructionModifications: string | null;
  createdAt: string;
  soldAt: string | null;
  reconstructionYear: number | null;
  buildingModifications: string | null;
  energyRating: string | null;
  floorArea: number | null;
};

export type LocalViewing = {
  id: string;
  propertyId: string;
  clientName: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled";
};

export type LocalDeal = {
  id: string;
  organizationId: string;
  propertyId: string;
  propertyTitle: string;
  clientName: string;
  soldPrice: number;
  price: number;
  closedAt: string;
  soldAt: string;
  status: "closed" | "signed" | "lost";
};

export type LocalTask = {
  id: string;
  title: string;
  description: string;
  status: "open" | "scheduled" | "done";
  dueDate: string;
  owner: string;
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

export const localClients: LocalClient[] = [
  {
    id: "client-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Petra Svobodova",
    fullName: "Petra Svobodova",
    email: "petra.svobodova@example.com",
    phone: "+420777111222",
    source: "Sreality",
    createdAt: "2026-01-12T09:00:00.000Z",
    status: "qualified",
    assignedTo: "Jana Maklerova",
  },
  {
    id: "client-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Martin Dvorak",
    fullName: "Martin Dvorak",
    email: "martin.dvorak@example.com",
    phone: "+420777222333",
    source: "Facebook",
    createdAt: "2026-02-03T11:30:00.000Z",
    status: "contacted",
    assignedTo: "Petr Novak",
  },
  {
    id: "client-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Jana Kralova",
    fullName: "Jana Kralova",
    email: "jana.kralova@example.com",
    phone: "+420777333444",
    source: "Doporuceni",
    createdAt: "2026-02-22T15:10:00.000Z",
    status: "active",
    assignedTo: "Jana Maklerova",
  },
  {
    id: "client-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Tomas Novak",
    fullName: "Tomas Novak",
    email: "tomas.novak@example.com",
    phone: "+420777444555",
    source: "Web",
    createdAt: "2026-03-08T08:45:00.000Z",
    status: "qualified",
    assignedTo: "Petr Novak",
  },
  {
    id: "client-005",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Lucie Vesela",
    fullName: "Lucie Vesela",
    email: "lucie.vesela@example.com",
    phone: "+420777555666",
    source: "Sreality",
    createdAt: "2026-03-21T12:00:00.000Z",
    status: "new",
    assignedTo: "Jana Maklerova",
  },
  {
    id: "client-006",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Karel Benes",
    fullName: "Karel Benes",
    email: "karel.benes@example.com",
    phone: "+420777666777",
    source: "Bezrealitky",
    createdAt: "2026-04-14T12:00:00.000Z",
    status: "contacted",
    assignedTo: "Petr Novak",
  },
  {
    id: "client-007",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Eva Horakova",
    fullName: "Eva Horakova",
    email: "eva.horakova@example.com",
    phone: "+420777777888",
    source: "Web",
    createdAt: "2026-05-20T16:20:00.000Z",
    status: "active",
    assignedTo: "Jana Maklerova",
  },
  {
    id: "client-008",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Ondrej Marek",
    fullName: "Ondrej Marek",
    email: "ondrej.marek@example.com",
    phone: "+420777888999",
    source: "Sreality",
    createdAt: "2026-06-02T10:00:00.000Z",
    status: "new",
    assignedTo: "Petr Novak",
  },
  {
    id: "client-009",
    organizationId: LOCAL_ORGANIZATION_ID,
    name: "Alena Pokorna",
    fullName: "Alena Pokorna",
    email: "alena.pokorna@example.com",
    phone: "+420777999000",
    source: "Reality.idnes",
    createdAt: "2026-06-11T14:25:00.000Z",
    status: "contacted",
    assignedTo: "Jana Maklerova",
  },
];

export const localProperties: LocalProperty[] = [
  {
    id: "property-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Byt 2+kk, Praha-Holesovice",
    address: "Komunardu 18",
    district: "Holesovice",
    city: "Praha",
    price: 8490000,
    status: "active",
    ownerName: "Marie Cerna",
    reconstructionInfo: null,
    constructionModifications: null,
    createdAt: "2026-01-05T10:00:00.000Z",
    soldAt: null,
    reconstructionYear: null,
    buildingModifications: null,
    energyRating: "C",
    floorArea: 54,
  },
  {
    id: "property-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Atelier u Vltavy",
    address: "Jankovcova 31",
    district: "Holesovice",
    city: "Praha",
    price: 6950000,
    status: "reserved",
    ownerName: "Pavel Urban",
    reconstructionInfo: "Kompletni rekonstrukce 2021",
    constructionModifications: "Nova elektroinstalace, koupelna",
    createdAt: "2026-02-01T10:00:00.000Z",
    soldAt: null,
    reconstructionYear: 2021,
    buildingModifications: "Nova elektroinstalace, koupelna",
    energyRating: null,
    floorArea: 41,
  },
  {
    id: "property-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Rodinny dum, Roztoky",
    address: "Tiche udoli 7",
    district: "Roztoky",
    city: "Roztoky",
    price: 15400000,
    status: "sold",
    ownerName: "Rodina Veselych",
    reconstructionInfo: "Rekonstrukce strechy a oken 2018",
    constructionModifications: null,
    createdAt: "2026-01-18T10:00:00.000Z",
    soldAt: "2026-06-05T09:15:00.000Z",
    reconstructionYear: 2018,
    buildingModifications: null,
    energyRating: "B",
    floorArea: 132,
  },
  {
    id: "property-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Byt 3+1, Praha-Bubenec",
    address: "Ceskoslovenske armady 22",
    district: "Bubenec",
    city: "Praha",
    price: 11200000,
    status: "active",
    ownerName: "Tomas Hruby",
    reconstructionInfo: null,
    constructionModifications: "Repase parket",
    createdAt: "2026-03-11T10:00:00.000Z",
    soldAt: null,
    reconstructionYear: null,
    buildingModifications: "Repase parket",
    energyRating: "D",
    floorArea: null,
  },
  {
    id: "property-005",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Garsonka, Praha-Zizkov",
    address: "Biskupcova 9",
    district: "Zizkov",
    city: "Praha",
    price: 4850000,
    status: "sold",
    ownerName: "Ivana Mala",
    reconstructionInfo: "Kuchyne a koupelna 2020",
    constructionModifications: "Bez dispozicnich zmen",
    createdAt: "2026-01-28T10:00:00.000Z",
    soldAt: "2026-04-24T15:30:00.000Z",
    reconstructionYear: 2020,
    buildingModifications: "Bez dispozicnich zmen",
    energyRating: "C",
    floorArea: 29,
  },
  {
    id: "property-006",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Byt 2+1, Praha-Vrsovice",
    address: "Krymska 12",
    district: "Vrsovice",
    city: "Praha",
    price: 7900000,
    status: "sold",
    ownerName: "Karel Dvorak",
    reconstructionInfo: "Castecna rekonstrukce 2019",
    constructionModifications: "Nova kuchynska linka",
    createdAt: "2026-01-08T10:00:00.000Z",
    soldAt: "2026-03-19T10:00:00.000Z",
    reconstructionYear: 2019,
    buildingModifications: "Nova kuchynska linka",
    energyRating: "C",
    floorArea: 62,
  },
  {
    id: "property-007",
    organizationId: LOCAL_ORGANIZATION_ID,
    title: "Byt 1+kk, Praha-Liben",
    address: "Zenklova 44",
    district: "Liben",
    city: "Praha",
    price: 5250000,
    status: "sold",
    ownerName: "Lenka Ruzickova",
    reconstructionInfo: "Puvodni stav, bez rekonstrukce",
    constructionModifications: "Zadne",
    createdAt: "2025-12-12T10:00:00.000Z",
    soldAt: "2026-01-28T13:00:00.000Z",
    reconstructionYear: null,
    buildingModifications: "Zadne",
    energyRating: "E",
    floorArea: 35,
  },
];

export const localLeads: LocalLead[] = [
  {
    id: "lead-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-001",
    clientName: "Petra Svobodova",
    createdAt: "2026-01-12T09:00:00.000Z",
    source: "Sreality",
    propertyId: "property-001",
    status: "qualified",
  },
  {
    id: "lead-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-002",
    clientName: "Martin Dvorak",
    createdAt: "2026-02-03T11:30:00.000Z",
    source: "Facebook",
    propertyId: "property-006",
    status: "contacted",
  },
  {
    id: "lead-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-003",
    clientName: "Jana Kralova",
    createdAt: "2026-02-22T15:10:00.000Z",
    source: "Doporuceni",
    propertyId: "property-005",
    status: "won",
  },
  {
    id: "lead-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-004",
    clientName: "Tomas Novak",
    createdAt: "2026-03-08T08:45:00.000Z",
    source: "Web",
    propertyId: "property-004",
    status: "qualified",
  },
  {
    id: "lead-005",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-005",
    clientName: "Lucie Vesela",
    createdAt: "2026-03-21T12:00:00.000Z",
    source: "Sreality",
    propertyId: "property-001",
    status: "new",
  },
  {
    id: "lead-006",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-006",
    clientName: "Karel Benes",
    createdAt: "2026-04-14T12:00:00.000Z",
    source: "Bezrealitky",
    propertyId: "property-002",
    status: "viewing_scheduled",
  },
  {
    id: "lead-007",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-007",
    clientName: "Eva Horakova",
    createdAt: "2026-05-20T16:20:00.000Z",
    source: "Web",
    propertyId: "property-003",
    status: "contacted",
  },
  {
    id: "lead-008",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-008",
    clientName: "Ondrej Marek",
    createdAt: "2026-06-02T10:00:00.000Z",
    source: "Sreality",
    propertyId: "property-001",
    status: "new",
  },
  {
    id: "lead-009",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-009",
    clientName: "Alena Pokorna",
    createdAt: "2026-06-11T14:25:00.000Z",
    source: "Reality.idnes",
    propertyId: "property-004",
    status: "contacted",
  },
  {
    id: "lead-010",
    organizationId: LOCAL_ORGANIZATION_ID,
    clientId: "client-001",
    clientName: "Petra Svobodova",
    createdAt: "2026-06-15T09:15:00.000Z",
    source: "Sreality",
    propertyId: "property-002",
    status: "qualified",
  },
];

export const localViewings: LocalViewing[] = [
  {
    id: "viewing-001",
    propertyId: "property-001",
    clientName: "Ondrej Marek",
    scheduledAt: "2026-06-16T08:30:00.000Z",
    status: "completed",
  },
  {
    id: "viewing-002",
    propertyId: "property-002",
    clientName: "Karel Benes",
    scheduledAt: "2026-06-18T12:00:00.000Z",
    status: "scheduled",
  },
  {
    id: "viewing-003",
    propertyId: "property-004",
    clientName: "Alena Pokorna",
    scheduledAt: "2026-06-19T07:00:00.000Z",
    status: "scheduled",
  },
];

export const localDeals: LocalDeal[] = [
  {
    id: "deal-001",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyId: "property-007",
    propertyTitle: "Byt 1+kk, Praha-Liben",
    clientName: "Petra Svobodova",
    soldPrice: 5250000,
    price: 5250000,
    closedAt: "2026-01-28T13:00:00.000Z",
    soldAt: "2026-01-28T13:00:00.000Z",
    status: "closed",
  },
  {
    id: "deal-002",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyId: "property-006",
    propertyTitle: "Byt 2+1, Praha-Vrsovice",
    clientName: "Martin Dvorak",
    soldPrice: 7900000,
    price: 7900000,
    closedAt: "2026-03-19T10:00:00.000Z",
    soldAt: "2026-03-19T10:00:00.000Z",
    status: "closed",
  },
  {
    id: "deal-003",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyId: "property-005",
    propertyTitle: "Garsonka, Praha-Zizkov",
    clientName: "Jana Kralova",
    soldPrice: 4850000,
    price: 4850000,
    closedAt: "2026-04-24T15:30:00.000Z",
    soldAt: "2026-04-24T15:30:00.000Z",
    status: "closed",
  },
  {
    id: "deal-004",
    organizationId: LOCAL_ORGANIZATION_ID,
    propertyId: "property-003",
    propertyTitle: "Rodinny dum, Roztoky",
    clientName: "Eva Horakova",
    soldPrice: 15400000,
    price: 15400000,
    closedAt: "2026-06-05T09:15:00.000Z",
    soldAt: "2026-06-05T09:15:00.000Z",
    status: "closed",
  },
];

export const localSales = localDeals;

export const localTasks: LocalTask[] = [
  {
    id: "task-001",
    title: "Doplnit technicka data pro Byt 2+kk Holesovice",
    description: "Chybi rekonstrukce a stavebni upravy.",
    status: "open",
    dueDate: "2026-06-20",
    owner: "Jana Maklerova",
  },
  {
    id: "task-002",
    title: "Potvrdit prohlidku Atelier u Vltavy",
    description: "Zajemce Karel Benes preferuje termin 18. 6.",
    status: "scheduled",
    dueDate: "2026-06-18",
    owner: "Petr Novak",
  },
];

export const localCalendarSlots: LocalCalendarSlot[] = [
  {
    id: "slot-001",
    startsAt: "2026-06-18T12:00:00.000Z",
    endsAt: "2026-06-18T12:45:00.000Z",
    label: "Ctvrtek 18. 6. ve 14:00",
  },
  {
    id: "slot-002",
    startsAt: "2026-06-19T07:00:00.000Z",
    endsAt: "2026-06-19T07:45:00.000Z",
    label: "Patek 19. 6. v 9:00",
  },
  {
    id: "slot-003",
    startsAt: "2026-06-22T08:30:00.000Z",
    endsAt: "2026-06-22T09:15:00.000Z",
    label: "Pondeli 22. 6. v 10:30",
  },
];

export const localMarketListings: LocalMarketListing[] = [
  {
    id: "listing-001",
    title: "Byt 2+kk, Praha-Holesovice, Tusarova",
    location: "Praha Holesovice",
    price: 8490000,
    source: "Sreality",
    url: "https://example.com/sreality/tusarova-2kk",
    firstSeenAt: "2026-06-15T06:10:00.000Z",
  },
  {
    id: "listing-002",
    title: "Loft 1+kk u Vltavy",
    location: "Praha Holesovice",
    price: 6950000,
    source: "Bezrealitky",
    url: "https://example.com/bezrealitky/loft-vltava",
    firstSeenAt: "2026-06-15T06:35:00.000Z",
  },
  {
    id: "listing-003",
    title: "Byt 3+kk, Delnicka",
    location: "Praha Holesovice",
    price: 11200000,
    source: "Reality.idnes",
    url: "https://example.com/idnes/delnicka-3kk",
    firstSeenAt: "2026-06-15T07:05:00.000Z",
  },
];
