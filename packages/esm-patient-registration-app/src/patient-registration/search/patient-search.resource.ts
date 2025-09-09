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

const BASE_URL = '/ws/fhir2/R4/Patient'; // This should be the base URL for the external patient search API

/**
 * Searches for patients in the external registry via a FHIR API.
 * @param query The search parameters.
 * @param abortController An AbortController to cancel the request.
 * @returns A promise that resolves to an array of patient results.
 */
export function searchExternalPatients(
  query: PatientSearchQuery,
  abortController: AbortController,
): Promise<PatientSearchResult[]> {
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

  const url = `${BASE_URL}?${params.toString()}`;

  return openmrsFetch(url, { signal: abortController.signal }).then(({ data }) => {
    if (data.entry) {
      return data.entry.map((entry) => {
        const resource = entry.resource;
        // Basic name construction. Assumes the first name entry is the official one.
        const name = resource.name?.[0];
        const fullName = [name?.given?.join(' '), name?.family].filter(Boolean).join(' ');

        return {
          id: resource.id,
          uuid: resource.id, // In FHIR, the resource ID is often used as the logical UUID.
          name: fullName,
          gender: resource.gender,
          birthDate: resource.birthDate,
        };
      });
    } else {
      return [];
    }
  });
}
