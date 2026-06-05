import { env } from "../../config/env.js";
import { cache } from "../../infrastructure/cache/cache.js";
import { HttpError } from "../../utils/http.js";

type LocationResult = {
  id: string;
  label: string;
  name: string;
  country: string;
  countryCode: string;
  region: string;
  latitude: number;
  longitude: number;
  category: string;
};

type NominatimPlace = {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  address?: {
    country?: string;
    country_code?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
  };
};

type PhotonFeature = {
  type?: string;
  geometry?: {
    coordinates?: number[];
  };
  properties?: {
    osm_type?: string;
    osm_id?: number | string;
    name?: string;
    country?: string;
    countrycode?: string;
    state?: string;
    county?: string;
    city?: string;
    street?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

type LocationSearchResponse = {
  provider: string;
  attribution: string;
  results: LocationResult[];
};

let lastNominatimRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function throttleNominatim() {
  const elapsed = Date.now() - lastNominatimRequestAt;
  if (elapsed < 1100) {
    await sleep(1100 - elapsed);
  }
  lastNominatimRequestAt = Date.now();
}

function emptyResponse(provider: string, attribution: string): LocationSearchResponse {
  return {
    provider,
    attribution,
    results: []
  };
}

function cleanParts(parts: Array<string | undefined>) {
  return parts.filter((part): part is string => Boolean(part?.trim())).map((part) => part.trim());
}

function countryMatches(expectedCountryCode: string | undefined, actualCountryCode: string | undefined) {
  if (!expectedCountryCode) {
    return true;
  }
  return actualCountryCode?.toLowerCase() === expectedCountryCode;
}

async function searchNominatim(normalizedQuery: string, normalizedCountry: string | undefined) {
  await throttleNominatim();

  const url = new URL("/search", env.NOMINATIM_BASE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");
  if (normalizedCountry) {
    url.searchParams.set("countrycodes", normalizedCountry);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": env.NOMINATIM_USER_AGENT,
      Referer: env.WEB_APP_URL
    }
  });

  if (!response.ok) {
    throw new HttpError(response.status, "Nominatim location search is unavailable");
  }

  const payload = (await response.json()) as NominatimPlace[];
  const results = payload.map<LocationResult>((place) => ({
    id: `${place.osm_type}:${place.osm_id}`,
    label: place.display_name,
    name:
      place.address?.city ??
      place.address?.town ??
      place.address?.village ??
      place.address?.municipality ??
      place.display_name.split(",")[0] ??
      place.display_name,
    country: place.address?.country ?? "",
    countryCode: place.address?.country_code?.toUpperCase() ?? "",
    region: place.address?.state ?? "",
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    category: place.type ?? place.class ?? "place"
  }));

  return {
    provider: "OpenStreetMap Nominatim",
    attribution: "Location results from OpenStreetMap contributors via Nominatim.",
    results
  };
}

function mapPhotonFeature(feature: PhotonFeature): LocationResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const longitude = coordinates[0];
  const latitude = coordinates[1];
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  const properties = feature.properties ?? {};
  const name =
    properties.name ?? properties.city ?? properties.street ?? properties.county ?? properties.state ?? properties.country ?? "Location";
  const countryCode = properties.countrycode?.toUpperCase() ?? "";
  const label = cleanParts([name, properties.city, properties.county, properties.state, properties.country]).join(", ");

  return {
    id: `${properties.osm_type ?? feature.type ?? "photon"}:${properties.osm_id ?? `${latitude}:${longitude}`}`,
    label: label || name,
    name,
    country: properties.country ?? "",
    countryCode,
    region: properties.state ?? properties.county ?? "",
    latitude,
    longitude,
    category: properties.type ?? properties.osm_value ?? properties.osm_key ?? "place"
  };
}

async function searchPhoton(normalizedQuery: string, normalizedCountry: string | undefined) {
  const url = new URL("/api/", env.PHOTON_BASE_URL);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");

  const response = await fetch(url, {
    headers: {
      "User-Agent": env.NOMINATIM_USER_AGENT,
      Referer: env.WEB_APP_URL
    }
  });

  if (!response.ok) {
    throw new HttpError(response.status, "Photon location search is unavailable");
  }

  const payload = (await response.json()) as PhotonResponse;
  const results = (payload.features ?? [])
    .map((feature) => mapPhotonFeature(feature))
    .filter((result): result is LocationResult => Boolean(result))
    .filter((result) => countryMatches(normalizedCountry, result.countryCode.toLowerCase()));

  return {
    provider: "OpenStreetMap Photon",
    attribution: "Location results from OpenStreetMap contributors via Photon.",
    results
  };
}

export async function searchLocations(query: string, countryCode?: string): Promise<LocationSearchResponse> {
  const normalizedQuery = query.trim();
  const normalizedCountry = countryCode?.trim().toLowerCase();
  if (normalizedQuery.length < 3) {
    return emptyResponse(
      "OpenStreetMap Nominatim",
      "Location results from OpenStreetMap contributors via Nominatim."
    );
  }

  const cacheKey = `geo:search:${normalizedCountry ?? "all"}:${normalizedQuery.toLowerCase()}`;
  const cached = await cache.get<LocationSearchResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  let nominatimResult: LocationSearchResponse | null = null;
  try {
    nominatimResult = await searchNominatim(normalizedQuery, normalizedCountry);
    if (nominatimResult.results.length > 0) {
      await cache.set(cacheKey, nominatimResult, 60 * 60 * 24);
      return nominatimResult;
    }
  } catch {
    nominatimResult = null;
  }

  try {
    const photonResult = await searchPhoton(normalizedQuery, normalizedCountry);
    const result = photonResult.results.length > 0 || !nominatimResult ? photonResult : nominatimResult;
    await cache.set(cacheKey, result, 60 * 60 * 24);
    return result;
  } catch {
    if (nominatimResult) {
      await cache.set(cacheKey, nominatimResult, 60 * 60 * 24);
      return nominatimResult;
    }
    throw new HttpError(502, "Location search providers are unavailable right now");
  }
}
