import { openmrsFetch } from '@openmrs/esm-framework';

// Corresponds to the search fields in the UI
export interface PatientSearchQuery {
  dpi?: string;
  name?: string;
  family?: string;
  birthdate?: string;
}

// The shape of the patient data returned from the external FHIR service
// This should be adjusted to match the actual response.
export interface PatientSearchResult {
  id: string;
  uuid: string;
  name: string;
  gender: string;
  birthDate: string;
}

const BASE_URL = 'http://localhost:9999/fhir/Patient'; // This should be the base URL for the external patient search API

/**
 * Searches for patients in the external registry via a FHIR API.
 * @param query The search parameters.
 * @param abortController An AbortController to cancel the request.
 * @returns A promise that resolves to an array of patient results.
 */
export interface PatientSearchPaginatedResponse {
  results: PatientSearchResult[];
  total: number;
}

/**
 * Searches for patients in the external registry via a FHIR API.
 * @param query The search parameters.
 * @param page The page number to fetch.
 * @param pageSize The number of results per page.
 * @param abortController An AbortController to cancel the request.
 * @returns A promise that resolves to a paginated response of patient results.
 */
export function searchExternalPatients(
  query: PatientSearchQuery,
  page: number,
  pageSize: number,
  abortController: AbortController,
): Promise<PatientSearchPaginatedResponse> {
  const params = new URLSearchParams();

  if (query.dpi) {
    params.append('identifier', query.dpi);
  } else {
    if (query.name) {
      params.append('given', query.name);
    }
    if (query.family) {
      params.append('family', query.family);
    }
    if (query.birthdate) {
      params.append('birthdate', query.birthdate);
    }
  }

  // Add pagination parameters for the FHIR search
  params.append('_count', pageSize.toString());
  params.append('_getpagesoffset', ((page - 1) * pageSize).toString());

  const url = `${BASE_URL}?${params.toString()}`;

  return openmrsFetch(url, { signal: abortController.signal }).then(({ data }) => {
    const response: PatientSearchPaginatedResponse = { results: [], total: 0 };

    if (data.entry) {
      response.total = data.total;
      response.results = data.entry.map((entry) => {
        const resource = entry.resource;
        const name = resource.name?.[0];
        const fullName = [name?.given?.join(' '), name?.family].filter(Boolean).join(' ');

        return {
          id: resource.id,
          uuid: resource.id,
          name: fullName,
          gender: resource.gender,
          birthDate: resource.birthDate,
        };
      });
    } else {
      response.total = 0;
      response.results = [];
    }
    return response;
  });
}
