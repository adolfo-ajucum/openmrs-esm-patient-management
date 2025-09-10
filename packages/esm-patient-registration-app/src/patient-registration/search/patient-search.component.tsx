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
  Pagination,
} from '@carbon/react';
import { showSnackbar, OpenmrsDatePicker } from '@openmrs/esm-framework';
import styles from './patient-search.scss';
import { searchExternalPatients, type PatientSearchQuery, type PatientSearchResult } from './patient-search.resource';

interface PatientSearchProps {
  onPatientSelect: (patient: PatientSearchResult) => void;
}

export function PatientSearchComponent({ onPatientSelect }: PatientSearchProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState({
    dpi: '',
    primerNombre: '',
    segundoNombre: '',
    family: '',
    birthdate: '',
  });
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController>();

  // Pagination state
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSearch = useCallback(
    (searchPage: number, searchPageSize: number) => {
      const { dpi, primerNombre, segundoNombre, family, birthdate } = searchQuery;
      const isDpiSearch = dpi.trim().length > 0;
      const isNameSearch = primerNombre.trim().length > 0 && family.trim().length > 0;

      if (!isDpiSearch && !isNameSearch) {
        showSnackbar({
          isLowContrast: true,
          kind: 'warning',
          title: t('invalidSearchCriteria', 'Invalid Search Criteria'),
          subtitle: t(
            'invalidSearchCriteriaSubtitle',
            'Please provide a DPI, or at least a first name and first surname.',
          ),
        });
        return;
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      setResults([]);

      const apiQuery: PatientSearchQuery = {
        dpi,
        name: [primerNombre, segundoNombre].filter(Boolean).join(' '),
        family: family,
        birthdate,
      };

      searchExternalPatients(apiQuery, searchPage, searchPageSize, abortControllerRef.current)
        .then((response) => {
          setResults(response.results);
          setTotalItems(response.total);
          if (response.total === 0) {
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
    },
    [searchQuery, t],
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSearchQuery((prev) => ({ ...prev, [name]: value }));
  };

  const handleBirthdateChange = (date: Date) => {
    setSearchQuery((prev) => ({
      ...prev,
      birthdate: date ? date.toISOString().split('T')[0] : '',
    }));
  };

  const onSearchClick = () => {
    setPage(1);
    handleSearch(1, pageSize);
  };

  const onPaginationChange = ({ page, pageSize }) => {
    setPage(page);
    setPageSize(pageSize);
    handleSearch(page, pageSize);
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
          id="primerNombre"
          name="primerNombre"
          labelText={t('firstName', 'Primary Name')}
          value={searchQuery.primerNombre}
          onChange={handleInputChange}
        />
        <TextInput
          id="segundoNombre"
          name="segundoNombre"
          labelText={t('secondName', 'Second Name')}
          value={searchQuery.segundoNombre}
          onChange={handleInputChange}
        />
        <TextInput
          id="family"
          name="family"
          labelText={t('surnames', 'Surnames')}
          value={searchQuery.family}
          onChange={handleInputChange}
        />
        <OpenmrsDatePicker
          id="birthdate_input"
          data-testid="birthdate_input"
          labelText={t('dateOfBirthLabelText', 'Date of Birth')}
          maxDate={new Date()}
          value={searchQuery.birthdate}
          onChange={handleBirthdateChange}
        />
        <Button onClick={onSearchClick} disabled={isLoading}>
          {isLoading ? t('searching', 'Searching...') : t('search', 'Search')}
        </Button>
      </div>

      {totalItems > 0 && (
        <>
          <DataTable rows={results} headers={headers}>
            {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
              <TableContainer>
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHeader {...getHeaderProps({ header })}>{header.header}</TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        {...getRowProps({ row })}
                        key={row.id}
                        className={styles.clickableRow}
                        onClick={() => onPatientSelect(results.find((p) => p.id === row.id))}>
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
          <Pagination
            totalItems={totalItems}
            page={page}
            pageSize={pageSize}
            pageSizes={[10, 20, 50]}
            onChange={onPaginationChange}
          />
        </>
      )}
    </div>
  );
}
