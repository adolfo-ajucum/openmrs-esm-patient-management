import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  TextInput,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableSelectRow,
  DatePicker,
  DatePickerInput,
} from '@carbon/react';
import { showSnackbar } from '@openmrs/esm-framework';
import styles from './patient-search.scss';
import { searchExternalPatients, type PatientSearchQuery, type PatientSearchResult } from './patient-search.resource';

interface PatientSearchProps {
  onPatientSelect: (patient: PatientSearchResult) => void;
}

export function PatientSearchComponent({ onPatientSelect }: PatientSearchProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState<PatientSearchQuery>({ dpi: '', name: '', family: '', birthdate: '' });
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController>();

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSearch = useCallback(() => {
    // Client-side validation based on acceptance criteria
    const { dpi, name, family, birthdate } = searchQuery;
    const isDpiSearch = dpi.trim().length > 0;
    const isNameSearch = name.trim().length > 0 && family.trim().length > 0;

    if (!isDpiSearch && !isNameSearch) {
      showSnackbar({
        isLowContrast: true,
        kind: 'warning',
        title: t('invalidSearchCriteria', 'Invalid Search Criteria'),
        subtitle: t('invalidSearchCriteriaSubtitle', 'Please provide a DPI, or at least a name and family name.'),
      });
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setResults([]);

    searchExternalPatients(searchQuery, abortControllerRef.current)
      .then((data) => {
        setResults(data);
        if (data.length === 0) {
          showSnackbar({
            isLowContrast: true,
            kind: 'info',
            title: t('noResultsFound', 'No results found'),
            subtitle: t('noPatientsMatchedCriteria', 'No patients matched the search criteria.'),
          });
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          showSnackbar({
            isLowContrast: true,
            kind: 'error',
            title: t('errorSearching', 'Error searching'),
            subtitle: error.message || t('errorSearchingSubtitle', 'An unexpected error occurred.'),
          });
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [searchQuery, t]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSearchQuery((prev) => ({ ...prev, [name]: value }));
  };

  const headers = [
    { key: 'name', header: t('name', 'Name') },
    { key: 'gender', header: t('gender', 'Gender') },
    { key: 'birthDate', header: t('birthDate', 'Birth Date') },
  ];

  return (
    <div className={styles.container}>
      <h4>{t('searchInNationalRegistry', 'Search in National Registry')}</h4>
      <p>
        {t(
          'searchInNationalRegistryDescription',
          'Search for a patient in the national registry to auto-fill the form.',
        )}
      </p>
      <div className={styles.formContainer}>
        <TextInput
          id="dpi"
          name="dpi"
          labelText={t('dpi', 'DPI')}
          value={searchQuery.dpi}
          onChange={handleInputChange}
        />
        <TextInput
          id="name"
          name="name"
          labelText={t('givenName', 'Given Name')}
          value={searchQuery.name}
          onChange={handleInputChange}
        />
        <TextInput
          id="family"
          name="family"
          labelText={t('familyName', 'Family Name')}
          value={searchQuery.family}
          onChange={handleInputChange}
        />
        <DatePicker
          datePickerType="single"
          dateFormat="Y-m-d"
          onChange={(dates) =>
            setSearchQuery((prev) => ({ ...prev, birthdate: dates[0] ? dates[0].toISOString().split('T')[0] : '' }))
          }>
          <DatePickerInput
            id="birthdate"
            name="birthdate"
            labelText={t('birthdate', 'Birth Date')}
            placeholder="YYYY-MM-DD"
            value={searchQuery.birthdate}
          />
        </DatePicker>
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? t('searching', 'Searching...') : t('search', 'Search')}
        </Button>
      </div>

      {results.length > 0 && (
        <DataTable rows={results} headers={headers}>
          {({ rows, headers, getTableProps, getHeaderProps, getRowProps, getSelectionProps }) => (
            <TableContainer>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    <th />
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })}>{header.header}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow {...getRowProps({ row })} key={row.id}>
                      <TableSelectRow
                        {...getSelectionProps({
                          row,
                          onSelect: () => onPatientSelect(results.find((p) => p.id === row.id)),
                        })}
                      />
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{cell.value}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </div>
  );
}
