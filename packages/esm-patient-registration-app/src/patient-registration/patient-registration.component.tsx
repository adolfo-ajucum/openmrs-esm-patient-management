import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button, InlineLoading, Link } from '@carbon/react';
import { XAxis } from '@carbon/react/icons';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Form, Formik, type FormikHelpers } from 'formik';
import {
  createErrorHandler,
  interpolateUrl,
  showSnackbar,
  useConfig,
  usePatient,
  usePatientPhoto,
} from '@openmrs/esm-framework';
import { builtInSections, type RegistrationConfig, type SectionDefinition } from '../config-schema';
import { cancelRegistration, filterOutUndefinedPatientIdentifiers, scrollIntoView } from './patient-registration-utils';
import { getValidationSchema } from './validation/patient-registration-validation';
import { DummyDataInput } from './input/dummy-data/dummy-data-input.component';
import { PatientRegistrationContextProvider } from './patient-registration-context';
import { useResourcesContext } from '../resources-context';
import { SectionWrapper } from './section/section-wrapper.component';
import { type CapturePhotoProps, type FormValues } from './patient-registration.types';
import { type SavePatientForm, SavePatientTransactionManager } from './form-manager';
import { useInitialAddressFieldValues, useInitialFormValues, usePatientUuidMap } from './patient-registration-hooks';
import BeforeSavePrompt from './before-save-prompt';
import { PatientSearchComponent } from './search/patient-search.component';
import styles from './patient-registration.scss';

let exportedInitialFormValuesForTesting = {} as FormValues;

export interface PatientRegistrationProps {
  savePatientForm: SavePatientForm;
  isOffline: boolean;
}

export const PatientRegistration: React.FC<PatientRegistrationProps> = ({ savePatientForm, isOffline }) => {
  const { t } = useTranslation();
  const { currentSession, identifierTypes } = useResourcesContext();
  const { patientUuid: uuidOfPatientToEdit } = useParams();
  const { search } = useLocation();
  const { isLoading: isLoadingPatientToEdit, patient: patientToEdit } = usePatient(uuidOfPatientToEdit);
  const config = useConfig<RegistrationConfig>();

  const [initialFormValues, setInitialFormValues] = useInitialFormValues(
    isLoadingPatientToEdit,
    patientToEdit,
    uuidOfPatientToEdit,
  );
  const [initialAddressFieldValues] = useInitialAddressFieldValues(
    {},
    isLoadingPatientToEdit,
    patientToEdit,
    uuidOfPatientToEdit,
  );

  const [patientUuidMap] = usePatientUuidMap({}, isLoadingPatientToEdit, patientToEdit, uuidOfPatientToEdit);

  const [target, setTarget] = useState<undefined | string>();
  const [capturePhotoProps, setCapturePhotoProps] = useState<CapturePhotoProps | null>(null);

  const location = currentSession?.sessionLocation?.uuid;
  const inEditMode = isLoadingPatientToEdit ? undefined : !!(uuidOfPatientToEdit && patientToEdit);
  const showDummyData = useMemo(() => localStorage.getItem('openmrs:devtools') === 'true' && !inEditMode, [inEditMode]);
  const { data: photo } = usePatientPhoto(patientToEdit?.id);
  const savePatientTransactionManager = useRef(new SavePatientTransactionManager());
  const validationSchema = getValidationSchema(config, t);

  useEffect(() => {
    exportedInitialFormValuesForTesting = initialFormValues;
  }, [initialFormValues]);

  const sections: Array<SectionDefinition> = useMemo(() => {
    return config.sections
      .map(
        (sectionName) =>
          config.sectionDefinitions.filter((s) => s.id == sectionName)[0] ??
          builtInSections.filter((s) => s.id == sectionName)[0],
      )
      .filter((s) => s);
  }, [config.sections, config.sectionDefinitions]);

  const onFormSubmit = async (values: FormValues, helpers: FormikHelpers<FormValues>) => {
    const abortController = new AbortController();
    helpers.setSubmitting(true);

    const updatedFormValues = { ...values, identifiers: filterOutUndefinedPatientIdentifiers(values.identifiers) };
    try {
      await savePatientForm(
        !inEditMode,
        updatedFormValues,
        patientUuidMap,
        initialAddressFieldValues,
        capturePhotoProps,
        location,
        initialFormValues['identifiers'],
        currentSession,
        config,
        savePatientTransactionManager.current,
        abortController,
      );

      showSnackbar({
        subtitle: inEditMode
          ? t('updatePatientSuccessSnackbarSubtitle', "The patient's information has been successfully updated")
          : t(
              'registerPatientSuccessSnackbarSubtitle',
              'The patient can now be found by searching for them using their name or ID number',
            ),
        title: inEditMode
          ? t('updatePatientSuccessSnackbarTitle', 'Patient Details Updated')
          : t('registerPatientSuccessSnackbarTitle', 'New Patient Created'),
        kind: 'success',
        isLowContrast: true,
      });

      const afterUrl = new URLSearchParams(search).get('afterUrl');
      const redirectUrl = interpolateUrl(afterUrl || config.links.submitButton, { patientUuid: values.patientUuid });

      setTarget(redirectUrl);
    } catch (error) {
      if (error.responseBody?.error?.globalErrors) {
        error.responseBody.error.globalErrors.forEach((error) => {
          showSnackbar({
            title: inEditMode
              ? t('updatePatientErrorSnackbarTitle', 'Patient Details Update Failed')
              : t('registrationErrorSnackbarTitle', 'Patient Registration Failed'),
            subtitle: error.message,
            kind: 'error',
          });
        });
      } else if (error.responseBody?.error?.message) {
        showSnackbar({
          title: inEditMode
            ? t('updatePatientErrorSnackbarTitle', 'Patient Details Update Failed')
            : t('registrationErrorSnackbarTitle', 'Patient Registration Failed'),
          subtitle: error.responseBody.error.message,
          kind: 'error',
        });
      } else {
        createErrorHandler()(error);
      }

      helpers.setSubmitting(false);
    }
  };

  const getDescription = (errors) => {
    return (
      <ul style={{ listStyle: 'inside' }}>
        {Object.keys(errors).map((error, index) => {
          return <li key={index}>{t(`${error}LabelText`, error)}</li>;
        })}
      </ul>
    );
  };

  const displayErrors = (errors) => {
    if (errors && typeof errors === 'object' && !!Object.keys(errors).length) {
      showSnackbar({
        isLowContrast: true,
        kind: 'warning',
        title: t('fieldsWithErrors', 'The following fields have errors:'),
        subtitle: <>{getDescription(errors)}</>,
      });
    }
  };

  const createContextValue = useCallback(
    (formikProps) => ({
      identifierTypes,
      validationSchema,
      values: formikProps.values,
      inEditMode,
      setFieldValue: formikProps.setFieldValue,
      setFieldTouched: formikProps.setFieldTouched,
      setCapturePhotoProps,
      currentPhoto: photo?.imageSrc,
      isOffline,
      initialFormValues: formikProps.initialValues,
      setInitialFormValues,
    }),
    [
      identifierTypes,
      validationSchema,
      inEditMode,
      setCapturePhotoProps,
      photo?.imageSrc,
      isOffline,
      setInitialFormValues,
    ],
  );

  return (
    <Formik
      enableReinitialize
      initialValues={initialFormValues}
      onSubmit={onFormSubmit}
      validationSchema={validationSchema}>
      {(props) => (
        <Form className={styles.form}>
          <BeforeSavePrompt when={Object.keys(props.touched).length > 0} redirect={target} />
          <div className={styles.formContainer}>
            <div>
              <div className={styles.stickyColumn}>
                <h4>
                  {inEditMode
                    ? t('editPatientDetails', 'Edit patient details')
                    : t('createNewPatient', 'Create new patient')}
                </h4>
                {showDummyData && <DummyDataInput setValues={props.setValues} />}
                <p className={styles.label01}>{t('jumpTo', 'Jump to')}</p>
                {sections.map((section) => (
                  <div className={classNames(styles.space05, styles.touchTarget)} key={section.name}>
                    <Link className={styles.linkName} onClick={() => scrollIntoView(section.id)}>
                      <XAxis size={16} /> {t(`${section.id}Section`, section.name)}
                    </Link>
                  </div>
                ))}
                <Button
                  className={styles.submitButton}
                  type="submit"
                  onClick={() => props.validateForm().then((errors) => displayErrors(errors))}
                  // Current session and identifiers are required for patient registration.
                  // If currentSession or identifierTypes are not available, then the
                  // user should be blocked to register the patient.
                  disabled={!currentSession || !identifierTypes || props.isSubmitting}>
                  {props.isSubmitting ? (
                    <InlineLoading
                      className={styles.spinner}
                      description={`${t('submitting', 'Submitting')} ...`}
                      iconDescription="submitting"
                    />
                  ) : inEditMode ? (
                    t('updatePatient', 'Update patient')
                  ) : (
                    t('registerPatient', 'Register patient')
                  )}
                </Button>
                <Button className={styles.cancelButton} kind="secondary" onClick={cancelRegistration}>
                  {t('cancel', 'Cancel')}
                </Button>
              </div>
            </div>
            <div className={styles.infoGrid}>
              <PatientSearchComponent
                onPatientSelect={(patient) => {
                  // Mejorar el parsing de nombres: primer nombre en given, segundo en middle, resto en family
                  const nameParts = patient.name.trim().split(/\s+/); // Usar regex para manejar múltiples espacios

                  let givenName = '';
                  let middleName = '';
                  let familyName = '';

                  if (nameParts.length === 1) {
                    // Solo un nombre - va a given
                    givenName = nameParts[0];
                  } else if (nameParts.length === 2) {
                    // Dos nombres - primero a given, segundo a family
                    givenName = nameParts[0];
                    familyName = nameParts[1];
                  } else if (nameParts.length >= 3) {
                    // Tres o más nombres - primero a given, segundo a middle, resto a family
                    givenName = nameParts[0];
                    middleName = nameParts[1];
                    familyName = nameParts.slice(2).join(' '); // Resto como apellidos
                  }

                  // Función para parsear fecha correctamente sin problemas de timezone
                  const parseBirthDate = (dateString) => {
                    if (!dateString) return null;

                    try {
                      // Si ya es un objeto Date, usarlo directamente
                      if (dateString instanceof Date) {
                        return dateString;
                      }

                      // Si es string, parsearlo manteniendo la fecha local
                      const date = new Date(dateString);

                      // Verificar si la fecha es válida
                      if (isNaN(date.getTime())) {
                        console.warn('Fecha inválida recibida:', dateString);
                        return null;
                      }

                      // Para evitar problemas de timezone, crear fecha con componentes locales
                      if (typeof dateString === 'string' && dateString.includes('T')) {
                        // Si tiene formato ISO, extraer solo la fecha
                        const datePart = dateString.split('T')[0];
                        const [year, month, day] = datePart.split('-').map(Number);
                        return new Date(year, month - 1, day); // month es 0-indexed
                      } else if (typeof dateString === 'string' && dateString.includes('-')) {
                        // Formato YYYY-MM-DD
                        const [year, month, day] = dateString.split('-').map(Number);
                        return new Date(year, month - 1, day);
                      } else if (typeof dateString === 'string' && dateString.includes('/')) {
                        // Formato DD/MM/YYYY o MM/DD/YYYY - asumir DD/MM/YYYY para Guatemala
                        const parts = dateString.split('/');
                        if (parts.length === 3) {
                          const day = parseInt(parts[0]);
                          const month = parseInt(parts[1]);
                          const year = parseInt(parts[2]);
                          return new Date(year, month - 1, day);
                        }
                      }

                      // Como último recurso, usar el constructor Date pero ajustar timezone
                      const parsedDate = new Date(dateString);
                      // Ajustar por diferencia de timezone para mantener la fecha correcta
                      const timezoneOffset = parsedDate.getTimezoneOffset() * 60000;
                      return new Date(parsedDate.getTime() + timezoneOffset);
                    } catch (error) {
                      console.error('Error parseando fecha:', error, 'Fecha original:', dateString);
                      return null;
                    }
                  };

                  // This attribute UUID corresponds to the "is patient unknown" flag.
                  // Setting it to 'false' ensures the name fields are visible.
                  props.setFieldValue('attributes.8b56eac7-5c76-4b9c-8c6f-1deab8d3fc47', 'false');

                  // Establecer valores con validación
                  props.setFieldValue('givenName', givenName);
                  props.setFieldValue('familyName', familyName);
                  props.setFieldValue('middleName', middleName);
                  props.setFieldValue('gender', patient.gender || '');

                  // Parsear y establecer fecha de nacimiento
                  const birthDate = parseBirthDate(patient.birthDate);
                  if (birthDate) {
                    props.setFieldValue('birthdate', birthDate);
                  } else {
                    console.warn('No se pudo establecer fecha de nacimiento para paciente:', patient);
                  }

                  props.setFieldValue('patientUuid', patient.uuid || '');

                  showSnackbar({
                    isLowContrast: true,
                    kind: 'success',
                    title: t('patientDataLoaded', 'Patient Data Loaded'),
                    subtitle: t('verifyAndComplete', 'Please verify the information and complete the registration.'),
                  });
                }}
              />
              <PatientRegistrationContextProvider value={createContextValue(props)}>
                {sections.map((section, index) => (
                  <SectionWrapper
                    key={`registration-section-${section.id}`}
                    sectionDefinition={section}
                    index={index}
                  />
                ))}
              </PatientRegistrationContextProvider>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
};

/**
 * @internal
 * Just exported for testing
 */
export { exportedInitialFormValuesForTesting as initialFormValues };
